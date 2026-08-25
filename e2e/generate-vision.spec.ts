import { test, expect, type Route } from "@playwright/test";

// Same SSE encoding as generate.spec.ts (see its own comment for the
// exact protocol reference) — duplicated locally since each e2e spec file
// in this repo is self-contained with no shared helper module.
function sseBody(chunks: object[]): string {
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

async function fulfillSse(route: Route, chunks: object[]) {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body: sseBody(chunks),
  });
}

function assistantTextChunks(text: string): object[] {
  const textId = "text-1";
  return [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: text },
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

function quizToolChunks(): object[] {
  const toolCallId = "call-1";
  const input = {
    topic: "This image",
    questions: [
      {
        question: "What is shown in the image?",
        options: ["A square", "A circle", "A triangle", "A line"],
        correctIndex: 0,
      },
    ],
  };
  return [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId,
      toolName: "createQuiz",
      input,
    },
    {
      type: "tool-output-available",
      toolCallId,
      output: { quizId: "quiz-1", ...input },
    },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

// A syntactically valid 2x2 red PNG — enough for client-side attach/preview
// behavior and for a mocked /api/chat route, neither of which decode the
// image. Real end-to-end model image understanding was verified separately,
// directly against the live Groq API (see the implementation notes).
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
const VALID_PNG_BUFFER = Buffer.from(VALID_PNG_BASE64, "base64");

async function attachImage(page: import("@playwright/test").Page, buffer = VALID_PNG_BUFFER) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer,
  });
}

test("mode selector defaults to Auto and lists Fast/Vision", async ({ page }) => {
  await page.goto("/generate");

  const modeButton = page.getByRole("button", { name: /^Mode: Auto\./ });
  await expect(modeButton).toBeVisible();
  await modeButton.click();

  await expect(page.getByRole("menuitemradio", { name: /Fast/ })).toBeVisible();
  await expect(page.getByRole("menuitemradio", { name: /Vision/ })).toBeVisible();
});

test("attaching an image disables the Fast mode option", async ({ page }) => {
  await page.goto("/generate");
  await attachImage(page);

  await page.getByRole("button", { name: /^Mode:/ }).click();
  const fastItem = page.getByRole("menuitemradio", { name: /Fast/ });
  await expect(fastItem).toHaveAttribute("aria-disabled", "true");
});

test("selecting Fast mode disables the attach button", async ({ page }) => {
  await page.goto("/generate");

  await page.getByRole("button", { name: /^Mode:/ }).click();
  await page.getByRole("menuitemradio", { name: /Fast/ }).click();

  await expect(page.getByRole("button", { name: "Attach image" })).toBeDisabled();
});

test("an oversized image is rejected client-side without sending a request", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    await fulfillSse(route, assistantTextChunks("should not be reached"));
  });

  await page.goto("/generate");

  const oversized = Buffer.alloc(3 * 1024 * 1024 + 1024, 0x41);
  await attachImage(page, oversized);

  await expect(page.getByText("Image must be 3MB or smaller.")).toBeVisible();
  expect(requestCount).toBe(0);
});

test("a wrong-type file is rejected client-side without sending a request", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    await fulfillSse(route, assistantTextChunks("should not be reached"));
  });

  await page.goto("/generate");

  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.gif",
    mimeType: "image/gif",
    buffer: Buffer.from("not a real gif but that's fine for this check"),
  });

  await expect(page.getByText("Images must be JPEG, PNG, or WebP.")).toBeVisible();
  expect(requestCount).toBe(0);
});

test("a valid image shows a preview with a remove control, and removing clears it", async ({
  page,
}) => {
  await page.goto("/generate");
  await attachImage(page);

  await expect(page.getByText("photo.png")).toBeVisible();
  await page.getByRole("button", { name: "Remove image" }).click();

  await expect(page.getByText("photo.png")).not.toBeVisible();
});

test("sending with an attached image includes mode and the image in the request, and clears the composer", async ({
  page,
}) => {
  let requestBody: { mode?: string; messages?: Array<{ parts?: unknown[] }> } | undefined;
  await page.route("**/api/chat", async (route) => {
    requestBody = route.request().postDataJSON();
    await fulfillSse(route, assistantTextChunks("It's a small red square."));
  });

  await page.goto("/generate");
  await attachImage(page);

  const composer = page.getByLabel("Message");
  await composer.fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("It's a small red square.")).toBeVisible();

  expect(requestBody?.mode).toBe("auto");
  const lastMessage = requestBody?.messages?.at(-1);
  const filePart = lastMessage?.parts?.find(
    (part) => (part as { type?: string }).type === "file",
  );
  expect(filePart).toBeDefined();

  // Composer and preview both clear after a successful send.
  await expect(page.getByText("photo.png")).not.toBeVisible();
  await expect(composer).toHaveValue("");
});

test("image -> quiz: an attached image can produce a quiz, shown as a ready notice", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillSse(route, quizToolChunks());
  });

  await page.goto("/generate");
  await attachImage(page);

  const composer = page.getByLabel("Message");
  await composer.fill("Quiz me on this image");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/Quiz ready/)).toBeVisible();
});

test("fast mode with an image is rejected by the server with a specific message", async ({
  page,
}) => {
  // The composer structurally prevents this combination (Fast disables
  // attach, an attachment disables Fast) — this hits the API directly to
  // verify the server-side backstop still rejects it clearly on its own,
  // reusing the browser's already-authenticated session/cookies.
  await page.goto("/generate");

  const response = await page.request.post("/api/chat", {
    data: {
      mode: "fast",
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [
            { type: "text", text: "What is this?" },
            {
              type: "file",
              mediaType: "image/png",
              filename: "photo.png",
              url: `data:image/png;base64,${VALID_PNG_BASE64}`,
            },
          ],
        },
      ],
    },
  });

  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error).toBe(
    "Fast mode doesn't support images. Switch to Auto or Vision mode to send an image.",
  );
});

test("mode selector and attach button are reachable and operable by keyboard", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillSse(route, assistantTextChunks("ok"));
  });

  await page.goto("/generate");

  const modeButton = page.getByRole("button", { name: /^Mode:/ });
  await modeButton.focus();
  await expect(modeButton).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: /Vision/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const attachButton = page.getByRole("button", { name: "Attach image" });
  await attachButton.focus();
  await expect(attachButton).toBeFocused();
  await expect(attachButton).toBeEnabled();
});

test("composer with mode selector and attach button fits on a mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.goto("/generate");

  await expect(page.getByRole("button", { name: /^Mode:/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach image" })).toBeVisible();
  await expect(page.getByLabel("Message")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

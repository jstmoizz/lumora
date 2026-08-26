import { test, expect, type Route } from "@playwright/test";

// Same SSE encoding as generate.spec.ts — duplicated since each e2e spec
// file here is self-contained.
function sseBody(chunks: object[]): string {
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

async function fulfillSse(
  route: Route,
  chunks: object[],
  { delayMs = 0 }: { delayMs?: number } = {},
) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
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

function extractionChunks(): object[] {
  const textId = "extraction-text";
  return [
    { type: "start" },
    { type: "start-step" },
    {
      type: "data-extraction",
      id: "extraction",
      data: {
        title: "Plant Cell Diagram",
        summary: "A labeled diagram of a plant cell.",
        extractedContent: "Cell wall, chloroplast, nucleus, vacuole.",
        keyConcepts: ["Cell wall", "Chloroplast", "Nucleus"],
      },
    },
    { type: "text-start", id: textId },
    {
      type: "text-delta",
      id: textId,
      delta: "A labeled diagram of a plant cell.",
    },
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

function flashcardsToolChunks(): object[] {
  const toolCallId = "call-1";
  const input = {
    topic: "This image",
    cards: [{ front: "What is shown in the image?", back: "A plant cell." }],
  };
  return [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId,
      toolName: "createFlashcards",
      input,
    },
    {
      type: "tool-output-available",
      toolCallId,
      output: { flashcardSetId: "flashcards-1", ...input },
    },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

// Mirrors what app/api/chat/route.ts's onError callbacks put on the wire —
// only ever a safe AIErrorCode string. No `finish` chunk follows an `error`
// chunk, since a real failure never completes a turn.
function errorChunks(code: "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "GENERATION_FAILED"): object[] {
  return [{ type: "start" }, { type: "start-step" }, { type: "error", errorText: code }];
}

// A syntactically valid 2x2 red PNG — enough for client-side attach/preview
// and a mocked route, neither of which decode the image.
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

test("sending an image shows 'Understanding your image…' while extraction is pending, then the card replaces it", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillSse(route, extractionChunks(), { delayMs: 300 });
  });

  await page.goto("/generate");
  await attachImage(page);

  const composer = page.getByLabel("Message");
  await composer.fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Understanding your image…")).toBeVisible();

  await expect(page.getByText("I found this in your image")).toBeVisible();
  await expect(page.getByText("Understanding your image…")).not.toBeVisible();
  // The card's own text is never duplicated as a separate plain-text bubble.
  await expect(
    page.getByText("A labeled diagram of a plant cell.", { exact: true }),
  ).toHaveCount(1);
});

test("image -> extraction card -> Create Quiz hands off to GPT-OSS, not Qwen, with no image", async ({
  page,
}) => {
  let requestCount = 0;
  let secondRequestBody:
    | { mode?: string; messages?: Array<{ parts?: Array<{ type?: string }> }> }
    | undefined;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await fulfillSse(route, extractionChunks());
      return;
    }
    secondRequestBody = route.request().postDataJSON();
    await fulfillSse(route, quizToolChunks(), { delayMs: 300 });
  });

  await page.goto("/generate");
  await attachImage(page);

  const composer = page.getByLabel("Message");
  await composer.fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("I found this in your image")).toBeVisible();
  await expect(page.getByText("A labeled diagram of a plant cell.")).toBeVisible();
  await expect(page.getByText("Cell wall, chloroplast, nucleus, vacuole.")).toBeVisible();

  const quizButton = page.getByRole("button", { name: "Create Quiz" });
  await quizButton.click();

  // The conversation, including the card above, stays visible the whole
  // time — no second loading screen appears.
  await expect(page.getByText("Creating your quiz…")).toBeVisible();
  await expect(page.getByText("I found this in your image")).toBeVisible();
  await expect(quizButton).toBeDisabled();

  await expect(page.getByText(/Quiz ready/)).toBeVisible();
  await expect(page.getByText("Creating your quiz…")).not.toBeVisible();
  expect(requestCount).toBe(2);
  // Forced to "auto" regardless of the composer's own mode, no image attached.
  expect(secondRequestBody?.mode).toBe("auto");
  const lastMessage = secondRequestBody?.messages?.at(-1);
  expect(lastMessage?.parts?.some((part) => part.type === "file")).toBe(false);
});

test("image extraction rate-limit failure shows the image-analysis-specific copy, never the raw code or provider name", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillSse(route, errorChunks("RATE_LIMITED"));
  });

  await page.goto("/generate");
  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("Image analysis is temporarily unavailable."),
  ).toBeVisible();
  await expect(page.getByText("Understanding your image…")).not.toBeVisible();
  // Never the generic copy or a mode-switch hint — no mode processes the image better.
  await expect(page.getByText("AI usage is temporarily limited.")).not.toBeVisible();
  await expect(page.getByText(/different mode/)).not.toBeVisible();

  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/RATE_LIMITED|groq|qwen|gpt-oss|429|tpd|tpm/i);

  // Composer isn't stuck.
  await expect(page.getByLabel("Message")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("image extraction generic failure shows the extraction-specific default copy", async ({
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillSse(route, errorChunks("GENERATION_FAILED"));
  });

  await page.goto("/generate");
  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Couldn't analyze this image.")).toBeVisible();
  await expect(page.getByText("Couldn't finish that response")).not.toBeVisible();
});

test("a Retry after a failed image extraction succeeds without duplicating the user's message", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await fulfillSse(route, errorChunks("PROVIDER_UNAVAILABLE"));
      return;
    }
    await fulfillSse(route, extractionChunks());
  });

  await page.goto("/generate");
  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("Image analysis is temporarily unavailable."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(page.getByText("I found this in your image")).toBeVisible();
  expect(requestCount).toBe(2);
  await expect(page.getByText("What is this?")).toHaveCount(1);
});

test("quiz generation rate-limit failure after an image extraction shows the usage-limit copy", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await fulfillSse(route, extractionChunks());
      return;
    }
    await fulfillSse(route, errorChunks("RATE_LIMITED"));
  });

  await page.goto("/generate");
  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I found this in your image")).toBeVisible();

  await page.getByRole("button", { name: "Create Quiz" }).click();

  await expect(page.getByText("AI usage is temporarily limited.")).toBeVisible();
  await expect(page.getByText("Creating your quiz…")).not.toBeVisible();
  // The failure doesn't wipe the conversation.
  await expect(page.getByText("I found this in your image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("retrying a failed quiz handoff while the composer is on Vision mode still forces GPT-OSS, not Qwen, on retry", async ({
  page,
}) => {
  // Regression coverage: Retry used to resend the composer's raw selected
  // mode, silently routing a handoff retry back to Qwen instead of GPT-OSS.
  let requestCount = 0;
  const requestModes: Array<string | undefined> = [];
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    const body = route.request().postDataJSON() as { mode?: string };
    requestModes.push(body.mode);
    if (requestCount === 1) {
      await fulfillSse(route, extractionChunks());
      return;
    }
    if (requestCount === 2) {
      await fulfillSse(route, errorChunks("RATE_LIMITED"));
      return;
    }
    await fulfillSse(route, quizToolChunks());
  });

  await page.goto("/generate");

  // Vision stays selected from here on — nothing resets it after the image
  // turn completes.
  await page.getByRole("button", { name: /^Mode:/ }).click();
  await page.getByRole("menuitemradio", { name: /Vision/ }).click();

  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I found this in your image")).toBeVisible();

  await page.getByRole("button", { name: "Create Quiz" }).click();
  await expect(page.getByText("AI usage is temporarily limited.")).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText(/Quiz ready/)).toBeVisible();

  expect(requestCount).toBe(3);
  // Request 1 is the real image extraction ("vision"). Requests 2 and 3
  // are the quiz handoff and its retry — both must be "auto".
  expect(requestModes[1]).toBe("auto");
  expect(requestModes[2]).toBe("auto");
});

test("flashcard generation rate-limit failure after an image extraction shows the usage-limit copy", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await fulfillSse(route, extractionChunks());
      return;
    }
    await fulfillSse(route, errorChunks("RATE_LIMITED"));
  });

  await page.goto("/generate");
  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I found this in your image")).toBeVisible();

  await page.getByRole("button", { name: "Create Flashcards" }).click();

  await expect(page.getByText("AI usage is temporarily limited.")).toBeVisible();
  await expect(page.getByText("Creating your flashcards…")).not.toBeVisible();
});

test("a flashcards handoff still succeeds normally (regression check)", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await fulfillSse(route, extractionChunks());
      return;
    }
    await fulfillSse(route, flashcardsToolChunks());
  });

  await page.goto("/generate");
  await attachImage(page);
  await page.getByLabel("Message").fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("I found this in your image")).toBeVisible();

  await page.getByRole("button", { name: "Create Flashcards" }).click();

  await expect(page.getByText(/Flashcards ready/)).toBeVisible();
});

test("fast mode with an image is rejected by the server with a specific message", async ({
  page,
}) => {
  // The composer structurally prevents this combination — hits the API
  // directly to verify the server-side backstop rejects it too.
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

test("ExtractionCard buttons are keyboard reachable and the card fits a mobile viewport without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.route("**/api/chat", async (route) => {
    await fulfillSse(route, extractionChunks());
  });

  await page.goto("/generate");
  await attachImage(page);

  const composer = page.getByLabel("Message");
  await composer.fill("What is this?");
  await page.getByRole("button", { name: "Send" }).click();

  const quizButton = page.getByRole("button", { name: "Create Quiz" });
  await expect(quizButton).toBeVisible();
  await quizButton.focus();
  await expect(quizButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create Flashcards" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Ask about this" })).toBeFocused();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
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

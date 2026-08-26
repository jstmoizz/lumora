import { test, expect, type Route } from "@playwright/test";

// Encodes chunks the same way toUIMessageStreamResponse does server-side:
// one `data: <json>\n\n` line per chunk, terminated by `data: [DONE]\n\n`.
function sseBody(chunks: object[]): string {
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function assistantReplyBody(text: string): string {
  const textId = "text-1";
  return sseBody([
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: text },
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish" },
  ]);
}

async function fulfillAssistantReply(
  route: Route,
  text: string,
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
    body: assistantReplyBody(text),
  });
}

// Mirrors what app/api/chat/route.ts's onError callbacks put on the wire —
// only a safe AIErrorCode string, mid-stream with no finish chunk after it.
function errorSseBody(code: "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "GENERATION_FAILED"): string {
  return sseBody([{ type: "start" }, { type: "start-step" }, { type: "error", errorText: code }]);
}

async function fulfillError(
  route: Route,
  code: "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "GENERATION_FAILED",
) {
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body: errorSseBody(code),
  });
}

test("primary flow: ask a question and read the streamed reply", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillAssistantReply(
      route,
      "Photosynthesis converts light into chemical energy.",
      { delayMs: 300 },
    );
  });

  await page.goto("/generate");

  await expect(
    page.getByRole("heading", { name: "What are you studying today?" }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Example prompts" })).toBeVisible();

  const composer = page.getByLabel("Message");
  await composer.fill("Explain photosynthesis");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Explain photosynthesis")).toBeVisible();
  await expect(page.getByText("Thinking…")).toBeVisible();

  await expect(
    page.getByText("Photosynthesis converts light into chemical energy."),
  ).toBeVisible();
  await expect(page.getByText("Thinking…")).not.toBeVisible();
});

test("a failed turn shows the error card and Retry recovers it", async ({ page }) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Something went wrong while generating a response.",
        }),
      });
      return;
    }
    await fulfillAssistantReply(route, "Newton's laws describe motion and force.");
  });

  await page.goto("/generate");

  const composer = page.getByLabel("Message");
  await composer.fill("Explain Newton's laws");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Couldn't finish that response")).toBeVisible();
  // The raw server error body must never reach the user.
  await expect(
    page.getByText("Something went wrong while generating a response."),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();

  await expect(
    page.getByText("Newton's laws describe motion and force."),
  ).toBeVisible();
  await expect(page.getByText("Couldn't finish that response")).not.toBeVisible();
  expect(requestCount).toBe(2);
});

test("a rate-limited turn shows the usage-limit copy — never the code, provider name, or raw error — and Retry recovers it", async ({
  page,
}) => {
  let requestCount = 0;
  await page.route("**/api/chat", async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await fulfillError(route, "RATE_LIMITED");
      return;
    }
    await fulfillAssistantReply(route, "Newton's laws describe motion and force.");
  });

  await page.goto("/generate");

  const composer = page.getByLabel("Message");
  await composer.fill("Explain Newton's laws");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("AI usage is temporarily limited.")).toBeVisible();
  await expect(page.getByText(/different mode/)).toBeVisible();
  await expect(page.getByText("Thinking…")).not.toBeVisible();
  // The wire code, any provider name, and raw provider text must never
  // reach the page.
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toMatch(/RATE_LIMITED|groq|qwen|gpt-oss|429|tpd|tpm/i);

  // Composer isn't stuck: still fillable, Send still reachable once ready.
  await expect(composer).toBeEnabled();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(
    page.getByText("Newton's laws describe motion and force."),
  ).toBeVisible();
  await expect(page.getByText("AI usage is temporarily limited.")).not.toBeVisible();
  expect(requestCount).toBe(2);
});

test("a provider-unavailable turn shows the temporary-unavailable copy", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await fulfillError(route, "PROVIDER_UNAVAILABLE");
  });

  await page.goto("/generate");
  await page.getByLabel("Message").fill("Explain entropy");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("The AI service is temporarily unavailable."),
  ).toBeVisible();
});

test("an error card on a 375px viewport stays clean, with no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 720 });
  await page.route("**/api/chat", async (route) => {
    await fulfillError(route, "RATE_LIMITED");
  });

  await page.goto("/generate");
  await page.getByLabel("Message").fill("Explain entropy");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("AI usage is temporarily limited.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

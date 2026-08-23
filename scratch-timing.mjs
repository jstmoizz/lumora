import { chromium } from "playwright";

const EMAIL = "lumora-e2e-test@example.com";
const PASSWORD = "Lumora-E2E-Test-Password-1!";
const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (msg) => console.log("[page]", msg.text()));

await page.goto(`${BASE}/login`);
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Log in" }).click();
await page.waitForURL(`${BASE}/generate`, { timeout: 20000 });

// Call /api/chat directly, bypassing the UI, and timestamp every chunk of
// the raw SSE stream as it arrives client-side — this measures exactly
// where wall-clock time goes: time-to-first-byte, gaps between named
// events (tool output vs step-start vs text), and total duration.
const result = await page.evaluate(async () => {
  const t0 = performance.now();
  const events = [];
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "Give me 2 flashcards on the water cycle." }],
        },
      ],
      trigger: "submit-message",
    }),
  });
  events.push({ t: performance.now() - t0, label: "response headers received" });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const parsed = JSON.parse(raw);
        events.push({ t: performance.now() - t0, type: parsed.type });
      } catch {}
    }
  }
  events.push({ t: performance.now() - t0, label: "stream done" });
  return events;
});

for (const e of result) {
  console.log(`t=${e.t.toFixed(0)}ms`, e.label ?? e.type);
}

await browser.close();

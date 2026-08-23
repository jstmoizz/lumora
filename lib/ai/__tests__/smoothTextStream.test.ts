import { describe, expect, test } from "vitest";
import { smoothTextStream } from "../smoothTextStream";

// Drives the transform's factory + TransformStream directly, bypassing
// streamText entirely — the same shape of chunks streamText's internals
// pass through `experimental_transform`.
async function run(chunks: unknown[], options?: Parameters<typeof smoothTextStream>[0]) {
  const transform = smoothTextStream(options)({ tools: {}, stopStream: () => {} });
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();

  const output: unknown[] = [];
  const readAll = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      output.push(value);
    }
  })();

  for (const chunk of chunks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writer.write(chunk as any);
  }
  await writer.close();
  await readAll;
  return output;
}

describe("smoothTextStream", () => {
  test("re-chunks text-delta into words, paced by delayInMs", async () => {
    const output = await run(
      [
        { type: "text-delta", id: "1", text: "Hello " },
        { type: "text-delta", id: "1", text: "world" },
      ],
      { delayInMs: null },
    );

    expect(output).toEqual([{ type: "text-delta", id: "1", text: "Hello " }]);
  });

  test("passes reasoning-delta straight through, unbuffered and untouched", async () => {
    const output = await run(
      [
        { type: "reasoning-delta", id: "r1", text: "thinking about it" },
        { type: "text-delta", id: "1", text: "Hi " },
      ],
      { delayInMs: null },
    );

    expect(output[0]).toEqual({
      type: "reasoning-delta",
      id: "r1",
      text: "thinking about it",
    });
  });

  test("a trailing word with no delimiter stays buffered until a delimiter arrives — matching smoothStream's own behavior", async () => {
    const output = await run(
      [
        { type: "text-delta", id: "1", text: "trailing" },
        { type: "text-delta", id: "1", text: " word " },
      ],
      { delayInMs: null },
    );

    expect(output).toEqual([
      { type: "text-delta", id: "1", text: "trailing " },
      { type: "text-delta", id: "1", text: "word " },
    ]);
  });

  test("passes non-text chunks (tool calls, step events) through immediately", async () => {
    const toolCall = { type: "tool-call", toolCallId: "t1" };
    const output = await run([toolCall], { delayInMs: null });

    expect(output).toEqual([toolCall]);
  });
});

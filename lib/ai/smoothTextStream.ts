import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

type TextDeltaPart<TOOLS extends ToolSet> = Extract<
  TextStreamPart<TOOLS>,
  { type: "text-delta" }
>;

const CHUNKING_REGEXPS = {
  word: /\S+\s+/m,
  line: /\n+/m,
} as const;

/**
 * Same word-by-word re-chunking as AI SDK's `smoothStream`, but scoped to
 * the visible `text-delta` stream only. `smoothStream` paces `reasoning-delta`
 * chunks at the same `delayInMs` rate as text — real wall-clock time spent
 * smoothing a stream `ChatInterface.tsx` never renders, since reasoning
 * models (like qwen3.6-27b) emit a full "thinking" trace before every step.
 * Reasoning (and everything else — tool calls, step-finish events) is
 * passed straight through immediately, unbuffered.
 */
export function smoothTextStream<TOOLS extends ToolSet>({
  delayInMs = 10,
  chunking = "word",
}: {
  delayInMs?: number | null;
  chunking?: "word" | "line" | RegExp;
} = {}): StreamTextTransform<TOOLS> {
  const chunkingRegex =
    typeof chunking === "string" ? CHUNKING_REGEXPS[chunking] : chunking;

  function detectChunk(buffer: string): string | null {
    const match = chunkingRegex.exec(buffer);
    if (!match) return null;
    return buffer.slice(0, match.index) + match[0];
  }

  return () => {
    let buffer = "";
    let id = "";
    let providerMetadata: TextDeltaPart<ToolSet>["providerMetadata"];

    function flushBuffer(controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) {
      if (buffer.length > 0) {
        controller.enqueue({
          type: "text-delta",
          text: buffer,
          id,
          ...(providerMetadata != null ? { providerMetadata } : {}),
        } as TextDeltaPart<TOOLS>);
        buffer = "";
        providerMetadata = undefined;
      }
    }

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      async transform(chunk, controller) {
        if (chunk.type !== "text-delta") {
          flushBuffer(controller);
          controller.enqueue(chunk);
          return;
        }

        if (chunk.id !== id && buffer.length > 0) {
          flushBuffer(controller);
        }
        buffer += chunk.text;
        id = chunk.id;
        if (chunk.providerMetadata != null) {
          providerMetadata = chunk.providerMetadata;
        }

        let match;
        while ((match = detectChunk(buffer)) != null) {
          controller.enqueue({ type: "text-delta", text: match, id } as TextDeltaPart<TOOLS>);
          buffer = buffer.slice(match.length);
          if (delayInMs != null) {
            await new Promise((resolve) => setTimeout(resolve, delayInMs));
          }
        }
      },
    });
  };
}

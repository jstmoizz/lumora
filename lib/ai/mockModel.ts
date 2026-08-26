/**
 * A deterministic, offline stand-in for the real Groq model, used only when
 * `LUMORA_E2E_MOCK_AI=true`. Lets E2E tests exercise the real chat route and
 * Supabase persistence without a real, quota-consuming Groq call. Built on
 * the `ai` package's own test tooling so it genuinely implements
 * `LanguageModelV4` — `streamText` can't tell the difference.
 */

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// Not the generic `CI` flag (used elsewhere for unrelated purposes) — a
// dedicated flag keeps mocking an explicit, single-purpose opt-in.
const MOCK_AI_ENV_VAR = "LUMORA_E2E_MOCK_AI";

export function isE2eMockAiEnabled(): boolean {
  return process.env[MOCK_AI_ENV_VAR] === "true";
}

// Fixed, not derived from the request — tests assert on persistence, never
// on reply content.
const MOCK_RESPONSE_TEXT = "Acknowledged.";

/** A fresh instance per call, so concurrent/multi-turn requests never share
 * mutable state. */
export function createE2eMockLanguageModel(modelId: string): MockLanguageModelV4 {
  const textId = "e2e-mock-text";
  return new MockLanguageModelV4({
    modelId,
    doStream: {
      stream: simulateReadableStream({
        chunks: [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: textId },
          { type: "text-delta", id: textId, delta: MOCK_RESPONSE_TEXT },
          { type: "text-end", id: textId },
          {
            type: "finish",
            finishReason: { unified: "stop", raw: undefined },
            usage: {
              inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: 0, text: 0, reasoning: undefined },
            },
          },
        ],
        // No artificial delay — a CI run should complete this as fast as
        // possible; there's no test value in slowing it down deliberately.
        initialDelayInMs: null,
        chunkDelayInMs: null,
      }),
    },
  });
}

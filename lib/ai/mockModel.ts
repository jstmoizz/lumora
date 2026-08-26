/**
 * A deterministic, offline stand-in for the real Groq model, used only when
 * `LUMORA_E2E_MOCK_AI=true` (see `isE2eMockAiEnabled` below). This exists so
 * `e2e/generate-persistence.spec.ts` can keep exercising the real
 * `app/api/chat/route.ts` handler and its real Supabase persistence in CI —
 * request parsing, the `streamText` call, and the `onEnd` callback that
 * writes conversation/message rows all still run for real — without CI ever
 * making a real, quota-consuming call to Groq's API.
 *
 * Built on the `ai` package's own first-party test tooling
 * (`MockLanguageModelV4` from `ai/test`, `simulateReadableStream` from
 * `ai`) rather than a hand-rolled fake or an HTTP-level double, so it
 * genuinely implements the same `LanguageModelV4` interface
 * `@ai-sdk/groq`'s real models do — `streamText` can't tell the difference
 * except that no network call happens.
 */

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// Deliberately not the generic `CI` flag (already used elsewhere, e.g. by
// Playwright itself, for unrelated purposes) — a dedicated flag makes
// mocking the model an explicit, single-purpose opt-in rather than
// something that silently piggybacks on a broader "is this CI" signal.
const MOCK_AI_ENV_VAR = "LUMORA_E2E_MOCK_AI";

export function isE2eMockAiEnabled(): boolean {
  return process.env[MOCK_AI_ENV_VAR] === "true";
}

// Fixed text, not derived from the request: the only thing that exercises
// this (generate-persistence.spec.ts) asserts on conversation/message row
// counts and timestamps, never on the assistant's actual reply content — so
// there's nothing to gain from echoing the prompt back, and a fixed string
// keeps this trivially deterministic.
const MOCK_RESPONSE_TEXT = "Acknowledged.";

/**
 * A fresh mock model per call. `resolveModel()` in `lib/ai/config.ts` calls
 * this once per request, so the initial message and the follow-up message
 * in a multi-turn test each get their own independent instance — no shared
 * mutable state to reset between them, and each one deterministically
 * completes with the same short response.
 */
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

/**
 * Safe, provider-agnostic classification of AI generation/extraction
 * failures — the only thing allowed to cross the wire to the browser when
 * something goes wrong.
 *
 * `classifyAIError` runs server-side (app/api/chat/route.ts, inside the
 * streamText and extraction `onError` callbacks) against the real thrown
 * error, which may be a Groq `APICallError` carrying raw provider text/
 * status/quota details. It reduces that to one of the codes below, and the
 * route returns *only the code* as the stream's `errorText` — never the
 * original error. The client never sees the raw error at all; it only ever
 * receives one of these three strings, and maps that back to friendly,
 * context-appropriate copy via `getAIErrorCopy`. No provider or model name
 * appears anywhere in this file.
 *
 * Kept in its own client-safe module (no env vars, no secrets — `ai`'s
 * `APICallError` is a plain error class, already part of the client bundle
 * via `@ai-sdk/react`) so both sides of that contract share one source of
 * truth for the code values themselves, the same way lib/ai/model.ts is
 * shared for chat-mode constants.
 */

import { APICallError } from "ai";

export type AIErrorCode = "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "GENERATION_FAILED";

const AI_ERROR_CODES: readonly AIErrorCode[] = [
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "GENERATION_FAILED",
];

/**
 * Whether a string is one of our own safe codes — used client-side to
 * recognize a code the server deliberately sent, as opposed to any other
 * error text. A raw provider error or an unrelated failure can never match
 * this, since the server never forwards anything but these three literal
 * strings for an AI generation/extraction failure.
 */
export function isAIErrorCode(value: string): value is AIErrorCode {
  return (AI_ERROR_CODES as readonly string[]).includes(value);
}

const HTTP_RATE_LIMIT_STATUS = 429;

// Last-resort signals for failures that don't carry a structured
// statusCode/type — a non-APICallError throw, or a provider response the
// client didn't parse into structured data. Deliberately narrow, and only
// ever consulted after the structured checks in classifyAIError below.
// Isolated here as the one place that ever needs updating/re-testing if
// provider wording changes.
const RATE_LIMIT_MESSAGE_PATTERN =
  /rate.?limit|too many requests|\bquota\b|tokens per (day|minute)|\btpd\b|\btpm\b|request rate/i;
const PROVIDER_UNAVAILABLE_MESSAGE_PATTERN =
  /service unavailable|temporarily unavailable|upstream (is )?unavailable|internal server error|bad gateway|gateway timeout/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

/**
 * Reduces an arbitrary thrown error to a safe classification. Prefers
 * structured signals the AI SDK actually exposes (HTTP status code, the
 * provider's own parsed error `type`) over string matching; string matching
 * is only ever a fallback for errors that carry neither.
 */
export function classifyAIError(error: unknown): AIErrorCode {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === HTTP_RATE_LIMIT_STATUS) return "RATE_LIMITED";
    if (
      typeof error.statusCode === "number" &&
      error.statusCode >= 500 &&
      error.statusCode < 600
    ) {
      return "PROVIDER_UNAVAILABLE";
    }

    // Providers that report a machine-readable error `type` (e.g.
    // "rate_limit_exceeded") alongside a non-429 status — still structured
    // data from the SDK's parsed error body, not free-text matching.
    const data = error.data as { error?: { type?: unknown } } | undefined;
    const providerType = data?.error?.type;
    if (typeof providerType === "string" && RATE_LIMIT_MESSAGE_PATTERN.test(providerType)) {
      return "RATE_LIMITED";
    }

    if (RATE_LIMIT_MESSAGE_PATTERN.test(error.message)) return "RATE_LIMITED";
    if (PROVIDER_UNAVAILABLE_MESSAGE_PATTERN.test(error.message)) return "PROVIDER_UNAVAILABLE";
    return "GENERATION_FAILED";
  }

  const message = messageOf(error);
  if (RATE_LIMIT_MESSAGE_PATTERN.test(message)) return "RATE_LIMITED";
  if (PROVIDER_UNAVAILABLE_MESSAGE_PATTERN.test(message)) return "PROVIDER_UNAVAILABLE";
  return "GENERATION_FAILED";
}

export type AIErrorContext = "extraction" | "generation";

export interface AIErrorCopy {
  title: string;
  description: string;
}

/**
 * The only place the actual user-facing wording lives — separate from
 * `classifyAIError` so prose can change without touching classification (or
 * its tests), and vice versa.
 *
 * `context` distinguishes an image-extraction (Qwen) failure from a normal
 * chat/tool-generation (GPT-OSS) failure, since the right recovery guidance
 * differs: the "generation" RATE_LIMITED copy hints that another mode might
 * help, but extraction deliberately omits that — an image still needs
 * Vision-capable processing no matter which mode is selected, so suggesting
 * a mode switch there would be misleading.
 */
export function getAIErrorCopy(code: AIErrorCode, context: AIErrorContext): AIErrorCopy {
  if (context === "extraction") {
    if (code === "RATE_LIMITED" || code === "PROVIDER_UNAVAILABLE") {
      return {
        title: "Image analysis is temporarily unavailable.",
        description: "Please try again later.",
      };
    }
    return {
      title: "Couldn't analyze this image.",
      description: "Please try again.",
    };
  }

  switch (code) {
    case "RATE_LIMITED":
      return {
        title: "AI usage is temporarily limited.",
        description: "Please try again later. You can also try a different mode.",
      };
    case "PROVIDER_UNAVAILABLE":
      return {
        title: "The AI service is temporarily unavailable.",
        description: "Please try again in a moment.",
      };
    default:
      return {
        title: "Couldn't finish that response",
        description: "Your message wasn't lost — you can retry it.",
      };
  }
}

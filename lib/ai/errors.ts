/**
 * Safe, provider-agnostic classification of AI failures — the only thing
 * allowed to cross the wire to the browser. `classifyAIError` reduces a raw
 * thrown error (which may carry provider status/quota details) to one of
 * the codes below; the route sends only the code, never the original error.
 * The client maps that code to friendly copy via `getAIErrorCopy`. No
 * provider or model name appears anywhere in this file.
 */

import { APICallError } from "ai";

export type AIErrorCode = "RATE_LIMITED" | "PROVIDER_UNAVAILABLE" | "GENERATION_FAILED";

const AI_ERROR_CODES: readonly AIErrorCode[] = [
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "GENERATION_FAILED",
];

// Recognizes a code the server deliberately sent, as opposed to any other error text.
export function isAIErrorCode(value: string): value is AIErrorCode {
  return (AI_ERROR_CODES as readonly string[]).includes(value);
}

const HTTP_RATE_LIMIT_STATUS = 429;

// Last-resort fallback for failures with no structured statusCode/type —
// only consulted after the structured checks in classifyAIError below.
const RATE_LIMIT_MESSAGE_PATTERN =
  /rate.?limit|too many requests|\bquota\b|tokens per (day|minute)|\btpd\b|\btpm\b|request rate/i;
const PROVIDER_UNAVAILABLE_MESSAGE_PATTERN =
  /service unavailable|temporarily unavailable|upstream (is )?unavailable|internal server error|bad gateway|gateway timeout/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

// Prefers structured signals (HTTP status, provider error `type`) over
// string matching, which is only a fallback.
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

    // A machine-readable error `type` (e.g. "rate_limit_exceeded") alongside
    // a non-429 status — still structured data, not free-text matching.
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

// The only place user-facing wording lives, kept separate from
// classification. `context` distinguishes image-extraction failures from
// chat/generation failures: extraction omits the "try another mode" hint
// since an image needs Vision-capable processing regardless of mode.
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

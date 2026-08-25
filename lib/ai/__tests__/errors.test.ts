import { describe, expect, test } from "vitest";
import { APICallError } from "ai";
import { classifyAIError, getAIErrorCopy, isAIErrorCode } from "../errors";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function apiCallError(overrides: {
  statusCode?: number;
  message?: string;
  data?: unknown;
}): APICallError {
  return new APICallError({
    message: overrides.message ?? "The model provider returned an error.",
    url: GROQ_URL,
    requestBodyValues: {},
    statusCode: overrides.statusCode,
    data: overrides.data,
    isRetryable: false,
  });
}

describe("classifyAIError", () => {
  test("a 429 status code classifies as RATE_LIMITED", () => {
    const error = apiCallError({ statusCode: 429, message: "Too many requests." });
    expect(classifyAIError(error)).toBe("RATE_LIMITED");
  });

  test("a provider error type of rate_limit_exceeded classifies as RATE_LIMITED even without a 429 status", () => {
    const error = apiCallError({
      statusCode: 400,
      message: "The request could not be completed.",
      data: { error: { type: "rate_limit_exceeded" } },
    });
    expect(classifyAIError(error)).toBe("RATE_LIMITED");
  });

  test("a daily token/quota message classifies as RATE_LIMITED via the message fallback", () => {
    const error = apiCallError({
      statusCode: 400,
      message: "You have exceeded your daily token quota. Please try again later.",
    });
    expect(classifyAIError(error)).toBe("RATE_LIMITED");
  });

  test("a 5xx status code classifies as PROVIDER_UNAVAILABLE", () => {
    for (const statusCode of [500, 502, 503, 504]) {
      const error = apiCallError({ statusCode, message: "The server had an error." });
      expect(classifyAIError(error)).toBe("PROVIDER_UNAVAILABLE");
    }
  });

  test("a service-unavailable message classifies as PROVIDER_UNAVAILABLE via the message fallback", () => {
    const error = apiCallError({
      statusCode: 400,
      message: "The upstream service is temporarily unavailable.",
    });
    expect(classifyAIError(error)).toBe("PROVIDER_UNAVAILABLE");
  });

  test("an ordinary provider error (e.g. a 400 unrelated to quota/capacity) classifies as GENERATION_FAILED", () => {
    const error = apiCallError({ statusCode: 400, message: "invalid image data" });
    expect(classifyAIError(error)).toBe("GENERATION_FAILED");
  });

  test("a plain Error thrown by our own code classifies as GENERATION_FAILED", () => {
    expect(classifyAIError(new Error("The vision model did not report an extraction."))).toBe(
      "GENERATION_FAILED",
    );
  });

  test("an unknown/non-Error thrown value classifies as GENERATION_FAILED", () => {
    expect(classifyAIError("some string failure")).toBe("GENERATION_FAILED");
    expect(classifyAIError(undefined)).toBe("GENERATION_FAILED");
    expect(classifyAIError({ weird: "shape" })).toBe("GENERATION_FAILED");
  });

  test("a non-APICallError whose message mentions rate limiting still classifies as RATE_LIMITED via the fallback", () => {
    expect(classifyAIError(new Error("rate limit exceeded, try again shortly"))).toBe(
      "RATE_LIMITED",
    );
  });
});

describe("isAIErrorCode", () => {
  test("recognizes the three known codes", () => {
    expect(isAIErrorCode("RATE_LIMITED")).toBe(true);
    expect(isAIErrorCode("PROVIDER_UNAVAILABLE")).toBe(true);
    expect(isAIErrorCode("GENERATION_FAILED")).toBe(true);
  });

  test("rejects arbitrary text, including raw provider-shaped strings", () => {
    expect(isAIErrorCode("rate_limit_exceeded")).toBe(false);
    expect(isAIErrorCode("Rate limit reached for model qwen/qwen3.6-27b")).toBe(false);
    expect(isAIErrorCode("")).toBe(false);
    expect(isAIErrorCode("generation_failed")).toBe(false);
  });
});

describe("getAIErrorCopy", () => {
  const ALL_SAFE_TEXT = [
    getAIErrorCopy("RATE_LIMITED", "generation"),
    getAIErrorCopy("PROVIDER_UNAVAILABLE", "generation"),
    getAIErrorCopy("GENERATION_FAILED", "generation"),
    getAIErrorCopy("RATE_LIMITED", "extraction"),
    getAIErrorCopy("PROVIDER_UNAVAILABLE", "extraction"),
    getAIErrorCopy("GENERATION_FAILED", "extraction"),
  ];

  test("never mentions a provider/model name or raw technical details", () => {
    const combined = ALL_SAFE_TEXT.map((copy) => `${copy.title} ${copy.description}`).join(" ");
    expect(combined).not.toMatch(/groq|qwen|gpt-oss|token|tpd|tpm|http|429|5\d\d/i);
  });

  test("generation context: RATE_LIMITED hints at trying a different mode, extraction does not", () => {
    expect(getAIErrorCopy("RATE_LIMITED", "generation").description).toContain("different mode");
    expect(getAIErrorCopy("RATE_LIMITED", "extraction").description).not.toContain("mode");
    expect(getAIErrorCopy("PROVIDER_UNAVAILABLE", "extraction").description).not.toContain("mode");
  });

  test("extraction context collapses RATE_LIMITED and PROVIDER_UNAVAILABLE into the same 'temporarily unavailable' copy", () => {
    expect(getAIErrorCopy("RATE_LIMITED", "extraction")).toEqual(
      getAIErrorCopy("PROVIDER_UNAVAILABLE", "extraction"),
    );
  });

  test("extraction's generic default is distinct from generation's generic default", () => {
    const extractionGeneric = getAIErrorCopy("GENERATION_FAILED", "extraction");
    const generationGeneric = getAIErrorCopy("GENERATION_FAILED", "generation");
    expect(extractionGeneric.title).toBe("Couldn't analyze this image.");
    expect(generationGeneric.title).toBe("Couldn't finish that response");
    expect(extractionGeneric).not.toEqual(generationGeneric);
  });

  test("generation's generic default matches the pre-existing default copy exactly", () => {
    expect(getAIErrorCopy("GENERATION_FAILED", "generation")).toEqual({
      title: "Couldn't finish that response",
      description: "Your message wasn't lost — you can retry it.",
    });
  });
});

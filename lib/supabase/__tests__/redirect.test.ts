import { describe, expect, test } from "vitest";
import { getSafeRedirect } from "../redirect";

describe("getSafeRedirect", () => {
  test("accepts a plain relative path", () => {
    expect(getSafeRedirect("/generate", "/fallback")).toBe("/generate");
  });

  test("accepts a relative path with a query string", () => {
    expect(getSafeRedirect("/history?tab=quizzes", "/fallback")).toBe(
      "/history?tab=quizzes",
    );
  });

  test("falls back for null/undefined/empty input", () => {
    expect(getSafeRedirect(null, "/fallback")).toBe("/fallback");
    expect(getSafeRedirect(undefined, "/fallback")).toBe("/fallback");
    expect(getSafeRedirect("", "/fallback")).toBe("/fallback");
  });

  test("rejects an absolute URL to another host", () => {
    expect(getSafeRedirect("https://evil.example/phish", "/fallback")).toBe(
      "/fallback",
    );
  });

  test("rejects a protocol-relative URL (//host)", () => {
    expect(getSafeRedirect("//evil.example", "/fallback")).toBe("/fallback");
  });

  test("rejects a path missing the leading slash", () => {
    expect(getSafeRedirect("generate", "/fallback")).toBe("/fallback");
  });

  test("rejects any path containing a colon (scheme indicator)", () => {
    expect(getSafeRedirect("/redirect:javascript:alert(1)", "/fallback")).toBe(
      "/fallback",
    );
  });

  // Browsers normalize `\` to `/` when resolving a URL for a special scheme
  // (http/https), so `/\evil.example` resolves exactly like `//evil.example`
  // — a real open-redirect bypass that the leading-`//` check alone misses,
  // since the raw string never actually contains `//`.
  test("rejects a backslash-prefixed host (a browser-normalized protocol-relative URL)", () => {
    expect(getSafeRedirect("/\\evil.example", "/fallback")).toBe("/fallback");
  });

  test("rejects a backslash anywhere in the path, not just at the start", () => {
    expect(getSafeRedirect("/generate/\\evil.example", "/fallback")).toBe(
      "/fallback",
    );
  });
});

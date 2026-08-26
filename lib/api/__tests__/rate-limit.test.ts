import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRateLimiter } from "../rate-limit";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createRateLimiter", () => {
  test("allows requests up to the limit within the window", () => {
    const check = createRateLimiter({ limit: 3, windowMs: 60_000 });

    expect(check("user-1").ok).toBe(true);
    expect(check("user-1").ok).toBe(true);
    expect(check("user-1").ok).toBe(true);
  });

  test("rejects the request once the limit is exceeded, with a positive Retry-After", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 60_000 });

    check("user-1");
    check("user-1");
    const result = check("user-1");

    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  test("keys are isolated from each other", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(check("user-1").ok).toBe(true);
    expect(check("user-1").ok).toBe(false);
    expect(check("user-2").ok).toBe(true);
  });

  test("allows requests again once the window has fully elapsed", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(check("user-1").ok).toBe(true);
    expect(check("user-1").ok).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(check("user-1").ok).toBe(true);
  });
});

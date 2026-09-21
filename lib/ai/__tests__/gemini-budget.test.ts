import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTokenBudget } from "../gemini-budget";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createTokenBudget", () => {
  test("allows usage under the cap", () => {
    const budget = createTokenBudget({ dailyTokenCap: 1000, windowMs: 60_000 });

    expect(budget.check("user-1").ok).toBe(true);
    budget.record("user-1", 500);
    expect(budget.check("user-1").ok).toBe(true);
  });

  test("blocks once the cap is exceeded", () => {
    const budget = createTokenBudget({ dailyTokenCap: 1000, windowMs: 60_000 });

    budget.record("user-1", 600);
    budget.record("user-1", 500);

    expect(budget.check("user-1").ok).toBe(false);
  });

  test("keys are isolated per user", () => {
    const budget = createTokenBudget({ dailyTokenCap: 1000, windowMs: 60_000 });

    budget.record("user-1", 1200);

    expect(budget.check("user-1").ok).toBe(false);
    expect(budget.check("user-2").ok).toBe(true);
  });

  test("resets after the window elapses", () => {
    const budget = createTokenBudget({ dailyTokenCap: 1000, windowMs: 60_000 });

    budget.record("user-1", 1200);
    expect(budget.check("user-1").ok).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(budget.check("user-1").ok).toBe(true);
  });

  test("ignores non-positive token amounts", () => {
    const budget = createTokenBudget({ dailyTokenCap: 1000, windowMs: 60_000 });

    budget.record("user-1", 0);
    budget.record("user-1", -50);

    expect(budget.check("user-1").ok).toBe(true);
  });

  test("ignores non-finite token amounts instead of poisoning future checks", () => {
    const budget = createTokenBudget({ dailyTokenCap: 1000, windowMs: 60_000 });

    budget.record("user-1", NaN);
    budget.record("user-1", Infinity);
    budget.record("user-1", 500);

    expect(budget.check("user-1").ok).toBe(true);
  });
});

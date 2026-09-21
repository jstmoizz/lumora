/**
 * Minimal in-memory, per-key sliding-window *token* budget — same shape as
 * lib/api/rate-limit.ts's request-count limiter, but sums token usage
 * instead of counting hits, over a 24h window. Process-local by design, for
 * the same reasons documented in rate-limit.ts and the README.
 *
 * This is necessarily advisory/after-the-fact: token counts for a request
 * are only known once that request's streamText call finishes, so this can
 * only block the *next* Gemini attempt, not the one already in flight. It
 * only gates whether we attempt Gemini — Groq fallback (a separate quota)
 * is never blocked by it. See app/api/chat/route.ts.
 */

interface TokenBudgetOptions {
  /** Max tokens allowed per key within `windowMs`. */
  dailyTokenCap: number;
  windowMs: number;
}

interface TokenBudgetCheckResult {
  ok: boolean;
}

interface UsageEntry {
  timestamp: number;
  tokens: number;
}

// Exported so tests can create an isolated instance instead of sharing
// geminiTokenBudget's module-level state, mirroring createRateLimiter.
export function createTokenBudget({ dailyTokenCap, windowMs }: TokenBudgetOptions) {
  const usageByKey = new Map<string, UsageEntry[]>();
  // Sweeps keys with no recent activity so the map can't grow forever.
  // Piggybacks on normal traffic rather than a setInterval, same rationale
  // as rate-limit.ts.
  let lastSweep = Date.now();
  const SWEEP_INTERVAL_MS = windowMs * 10;

  function recentEntries(key: string, now: number): UsageEntry[] {
    const entries = (usageByKey.get(key) ?? []).filter((e) => now - e.timestamp < windowMs);
    usageByKey.set(key, entries);
    return entries;
  }

  function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    for (const [key, entries] of usageByKey) {
      const recent = entries.filter((e) => now - e.timestamp < windowMs);
      if (recent.length === 0) usageByKey.delete(key);
      else usageByKey.set(key, recent);
    }
  }

  return {
    // Called before attempting Gemini — an advisory pre-check against the
    // window's already-recorded usage.
    check(key: string): TokenBudgetCheckResult {
      const now = Date.now();
      sweep(now);
      const total = recentEntries(key, now).reduce((sum, e) => sum + e.tokens, 0);
      return { ok: total < dailyTokenCap };
    },
    // Called once a Gemini call's actual usage is known (streamText's
    // usage promise), to count against future check() calls.
    record(key: string, tokens: number): void {
      // Guards against a non-finite usage value (e.g. a malformed provider
      // response) permanently poisoning this key's sum — `NaN < cap` is
      // always false, which would silently block Gemini for this key until
      // the entry ages out of the window.
      if (!Number.isFinite(tokens) || tokens <= 0) return;
      const now = Date.now();
      const entries = usageByKey.get(key) ?? [];
      entries.push({ timestamp: now, tokens });
      usageByKey.set(key, entries);
    },
  };
}

// 200,000 tokens/user/day — generous for normal study-session usage (tens
// of full turns/day at ~2048 max output tokens each) while bounding
// worst-case cost exposure on a shared free-tier Gemini key, well under AI
// Studio's free-tier request ceiling even across a few users sharing one key.
const GEMINI_DAILY_TOKEN_CAP = 200_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const geminiTokenBudget = createTokenBudget({
  dailyTokenCap: GEMINI_DAILY_TOKEN_CAP,
  windowMs: DAY_MS,
});

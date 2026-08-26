/**
 * Minimal in-memory, per-key sliding-window rate limiter. Process-local by
 * design (see README's "Security / production hygiene" section) — good
 * enough to blunt trivial abuse of a single capstone deployment, not a
 * substitute for distributed rate limiting at scale.
 */

interface RateLimitOptions {
  /** Max requests allowed per key within `windowMs`. */
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller should retry, only meaningful when `ok` is false. */
  retryAfterSeconds: number;
}

// One Map per limiter instance, so lib/ai and any future rate-limited route
// don't share state. Values are the timestamps (ms) of requests still
// inside the current window for that key. Exported so tests can create an
// isolated instance instead of sharing checkChatRateLimit's module-level state.
export function createRateLimiter({ limit, windowMs }: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  // Sweeps keys with no recent activity so the map can't grow forever.
  // Piggybacks on normal request traffic rather than a setInterval, which
  // would keep a serverless function instance alive for no reason.
  let lastSweep = Date.now();
  const SWEEP_INTERVAL_MS = windowMs * 10;

  function sweep(now: number) {
    if (now - lastSweep < SWEEP_INTERVAL_MS) return;
    lastSweep = now;
    for (const [key, timestamps] of hits) {
      const recent = timestamps.filter((t) => now - t < windowMs);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }

  return function check(key: string): RateLimitResult {
    const now = Date.now();
    sweep(now);

    const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= limit) {
      const oldestInWindow = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - oldestInWindow)) / 1000));
      hits.set(key, timestamps);
      return { ok: false, retryAfterSeconds };
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return { ok: true, retryAfterSeconds: 0 };
  };
}

// 20 requests per minute per user — generous enough for normal back-and-forth
// conversation (including retries) while blocking a tight abuse loop.
export const checkChatRateLimit = createRateLimiter({ limit: 20, windowMs: 60_000 });

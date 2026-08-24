/**
 * Validates a redirect target that came from user-controllable input (a
 * query param like `?redirectTo=` or `?next=`) before it's ever passed to
 * `redirect()`. Without this, a crafted link like
 * `/login?redirectTo=https://evil.example` or `//evil.example` (a
 * protocol-relative URL — no scheme, but browsers still treat `//host` as
 * "go to this other host") would send a user off Lumora right after they
 * authenticate. Only a same-origin, single-leading-slash path is accepted;
 * anything else falls back to `fallback`.
 *
 * The backslash check exists for the same reason: per the WHATWG URL spec,
 * browsers normalize `\` to `/` when resolving a URL for a special scheme
 * (http/https among them), so `/\evil.example` resolves exactly like
 * `//evil.example` even though the raw string never contains `//` — a
 * well-documented open-redirect bypass that a literal `//`/`:` check alone
 * doesn't catch.
 */
export function getSafeRedirect(
  path: string | null | undefined,
  fallback: string,
): string {
  if (!path) return fallback;
  if (!path.startsWith("/")) return fallback;
  if (path.startsWith("//")) return fallback;
  if (path.includes(":")) return fallback;
  if (path.includes("\\")) return fallback;
  return path;
}

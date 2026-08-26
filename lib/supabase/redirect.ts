/**
 * Validates a redirect target from user-controllable input (`?redirectTo=`,
 * `?next=`) before it reaches `redirect()`. Without this, a crafted link
 * like `//evil.example` (a protocol-relative URL) would send a user off
 * Lumora right after they authenticate. Only a same-origin,
 * single-leading-slash path is accepted.
 *
 * The backslash check matters too: browsers normalize `\` to `/` when
 * resolving a URL, so `/\evil.example` behaves like `//evil.example` even
 * though it contains no literal `//`.
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

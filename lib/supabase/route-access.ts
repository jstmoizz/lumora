/**
 * Which Lumora page routes require a signed-in user, and which auth pages
 * shouldn't be shown to someone who already is one. Pure path-matching
 * logic, deliberately kept independent of `middleware.ts`/Next.js request
 * types so it's trivial to unit test.
 *
 * `/playground` is intentionally NOT protected — it's dev/coursework demo
 * content (hand-built ARIA patterns, a shadcn comparison), not a
 * user-specific feature, so gating it behind an account would add friction
 * for no benefit.
 */

const PROTECTED_PREFIXES = ["/generate", "/history", "/explore", "/settings"];

// Pages that only make sense for a signed-OUT visitor — an already
// authenticated user landing here should be sent into the app instead.
// `/verify` and `/reset-password` are deliberately excluded even though
// they're auth-related: both are reached via a Supabase email link that
// establishes a real (or recovery) session before the page ever renders,
// so redirecting "authenticated" users away from them would break the
// exact flow they exist for.
const AUTHENTICATED_USER_REDIRECT_PATHS = ["/login", "/signup"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthOnlyForSignedOutPath(pathname: string): boolean {
  return AUTHENTICATED_USER_REDIRECT_PATHS.includes(pathname);
}

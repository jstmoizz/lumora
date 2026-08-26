/**
 * Which Lumora routes require a signed-in user, and which auth pages
 * should redirect someone already signed in. Pure path-matching, kept
 * independent of middleware.ts/Next.js request types so it's trivial to
 * unit test.
 *
 * `/playground` is intentionally NOT protected — it's demo content, not a
 * user-specific feature.
 */

const PROTECTED_PREFIXES = ["/generate", "/history", "/explore", "/settings"];

// `/verify` and `/reset-password` are excluded even though they're
// auth-related — both are reached via a Supabase email link that
// establishes a session before the page renders, so redirecting an
// "authenticated" user away would break the flow they exist for.
const AUTHENTICATED_USER_REDIRECT_PATHS = ["/login", "/signup"];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthOnlyForSignedOutPath(pathname: string): boolean {
  return AUTHENTICATED_USER_REDIRECT_PATHS.includes(pathname);
}

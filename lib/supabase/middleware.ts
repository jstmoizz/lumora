/**
 * Next.js middleware's Supabase integration: refreshes the auth session on
 * every request (so a server-rendered page never sees a stale/expired
 * cookie — this is the piece `lib/supabase/server.ts`'s `createClient()`
 * comment flags as missing) and redirects based on route protection.
 *
 * This is the only place in the app that runs on literally every request,
 * so it's also the right place for the "not signed in on a protected page"
 * / "signed in on a signed-out-only page" redirects — see
 * `lib/supabase/route-access.ts` for which paths those are.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthOnlyForSignedOutPath, isProtectedPath } from "./route-access";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Written to both the request (so this same middleware pass sees
          // the refreshed cookie if it reads it again) and a fresh response
          // (so the browser actually receives it) — mirrors Supabase's own
          // documented middleware pattern exactly.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Re-validates against Supabase rather than trusting the cookie as-is —
  // required reading before any redirect decision below.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthOnlyForSignedOutPath(pathname)) {
    return NextResponse.redirect(new URL("/generate", request.url));
  }

  return supabaseResponse;
}

/**
 * Next.js middleware's Supabase integration: refreshes the auth session on
 * every request, so a server-rendered page never sees a stale cookie, and
 * redirects based on route protection (see lib/supabase/route-access.ts).
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
          // Written to both the request (for this same pass) and a fresh
          // response (so the browser receives it).
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

  // Re-validates against Supabase rather than trusting the cookie as-is.
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

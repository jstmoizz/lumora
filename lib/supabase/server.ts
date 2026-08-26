/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * route handlers. Uses the anon key plus the request's cookies, so queries
 * run as whichever user is signed in, subject to RLS. Not the privileged
 * client — see lib/supabase/admin.ts for the service-role client.
 *
 * Server-side only — reads `next/headers`, unavailable to client components.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Throws from a Server Component (only Actions/route handlers
            // can write cookies) — safe to ignore, middleware.ts refreshes
            // the session on every request instead.
          }
        },
      },
    },
  );
}

/**
 * The currently authenticated user for this request, or `null` if no one's
 * signed in. Thin wrapper around `auth.getUser()`, which re-validates the
 * session against Supabase rather than trusting a possibly-stale cookie.
 */
export async function getServerUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

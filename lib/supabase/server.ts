/**
 * Server-side Supabase client — for Server Components, Server Actions, and
 * route handlers. Uses the anon key (same as the browser client) plus the
 * request's own cookies, so queries run as whichever user is actually
 * signed in and are subject to Row Level Security exactly as they would be
 * from the browser. This is not the privileged client — see
 * `lib/supabase/admin.ts` for the service-role client, which is only for
 * trusted server-side operations that must bypass RLS.
 *
 * Must only ever be imported by server-side code — it reads `next/headers`,
 * which isn't available to client components.
 *
 * Wrapped in an async function rather than constructed at module scope, so
 * merely importing this file never throws even before the Supabase env
 * vars are configured — nothing calls `createClient()` yet.
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
            // `cookieStore.set` throws when called from a Server Component
            // (only Server Actions/route handlers can write cookies) — safe
            // to ignore since middleware.ts refreshes the session on every
            // request instead.
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

/**
 * Privileged Supabase client, authenticated with the service-role key.
 * This bypasses Row Level Security entirely — it can read and write any
 * row in any table, regardless of who (if anyone) is signed in.
 *
 * Rules for this file, non-negotiable:
 *   - Never import it from a client component or anything bundled to the
 *     browser. `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix
 *     specifically so Next.js refuses to inline it into client bundles —
 *     don't work around that.
 *   - Use it only for privileged, trusted server-side operations that
 *     genuinely need to bypass RLS (e.g. an admin-only action). Ordinary
 *     "read/write the signed-in user's own data" code should use
 *     `lib/supabase/server.ts` instead, so RLS still applies.
 *
 * Wrapped in a function rather than constructed at module scope, so merely
 * importing this file never throws even before
 * `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` are configured —
 * nothing calls `createAdminClient()` yet. Calling it without them set
 * throws a clear, actionable error instead (same fail-fast style as the
 * existing `GROQ_API_KEY` check in `app/api/chat/route.ts`).
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set to use the Supabase admin client. Add them to .env.local (see .env.example).",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * The one and only place in the codebase that writes `public.users.role`.
 * Keeping every role-write behind this single function is what makes the
 * security audit tractable.
 *
 * Promotes `userId` to `role = "admin"` if — and only if — `email` matches
 * the server-only `ADMIN_EMAIL` env var (case-insensitive, trimmed). Both
 * must come from a Supabase auth response already trusted (e.g. `verifyOtp`
 * or `signInWithPassword`'s returned `user`), never from client-submitted
 * form data. No-ops quietly if `ADMIN_EMAIL` isn't configured or doesn't
 * match; safe to call repeatedly since it only issues an UPDATE when the
 * row isn't already `admin`.
 *
 * Called from two places — `app/auth/confirm/route.ts` and `signIn` in
 * `lib/supabase/actions.ts` — so the admin account gets promoted whichever
 * path signup happens to take.
 */
export async function promoteIfConfiguredAdmin(
  userId: string,
  email: string,
): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;
  if (email.trim().toLowerCase() !== adminEmail.trim().toLowerCase()) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ role: "admin" })
    .eq("id", userId)
    .neq("role", "admin");

  if (error) {
    console.error(
      "[promoteIfConfiguredAdmin] failed to promote configured admin:",
      error.message,
    );
  }
}

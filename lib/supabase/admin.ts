/**
 * Privileged Supabase client, authenticated with the service-role key —
 * bypasses Row Level Security entirely.
 *
 * Non-negotiable rules: never import from a client component or anything
 * browser-bundled (`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix
 * on purpose). Use only for trusted server-side operations that genuinely
 * need to bypass RLS — ordinary user-data access should use
 * `lib/supabase/server.ts` instead.
 *
 * Wrapped in a function so importing this file never throws before the env
 * vars are configured; calling it without them throws a clear error instead.
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
 * The one and only place that writes `public.users.role`. Promotes
 * `userId` to admin only if `email` matches the server-only `ADMIN_EMAIL`
 * env var — both must come from an already-trusted Supabase auth response,
 * never client-submitted form data. No-ops if unconfigured or unmatched;
 * safe to call repeatedly.
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

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

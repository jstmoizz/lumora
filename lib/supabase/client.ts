"use client";

/**
 * Browser-side Supabase client. Safe to import from client components —
 * only reads the two `NEXT_PUBLIC_*` env vars, which are meant to be
 * public (the anon key is designed to be exposed; Row Level Security is
 * what actually restricts what it can read/write).
 *
 * Wrapped in a function rather than constructed at module scope, so
 * merely importing this file never throws even before
 * `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured
 * — nothing calls `createClient()` yet.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

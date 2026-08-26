"use client";

/**
 * Browser-side Supabase client. Safe for client components — the anon key
 * is designed to be public; RLS is what actually restricts access.
 * Wrapped in a function so importing this file never throws before the env
 * vars are configured.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

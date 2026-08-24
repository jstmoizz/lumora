/**
 * Read-side data access for Settings persistence. The write side (updating
 * a single preference) is a Server Action in `lib/supabase/settings-
 * actions.ts` — kept separate since anything exported from a "use server"
 * file becomes a network-callable endpoint; this module is only ever
 * imported by Server Components, so it stays a plain module.
 *
 * Every query here goes through the RLS-scoped server client — never the
 * service-role client — so "only the signed-in user's own row" is enforced
 * by Postgres itself (`supabase/schema.sql`'s `user_settings` policies),
 * not by application logic.
 */

import { createClient, getServerUser } from "./server";

export interface UserSettings {
  theme: "system" | "light" | "dark";
  responseStyle: string;
  explanationDepth: string;
  learningFocus: string;
  updatedAt: string;
}

function mapRow(row: {
  theme: "system" | "light" | "dark";
  response_style: string;
  explanation_depth: string;
  learning_focus: string;
  updated_at: string;
}): UserSettings {
  return {
    theme: row.theme,
    responseStyle: row.response_style,
    explanationDepth: row.explanation_depth,
    learningFocus: row.learning_focus,
    updatedAt: row.updated_at,
  };
}

const SETTINGS_COLUMNS =
  "theme, response_style, explanation_depth, learning_focus, updated_at";

/**
 * The signed-in user's `user_settings` row, creating it first if this is
 * their first visit to Settings. The insert deliberately supplies nothing
 * but `user_id` — every other column is left to the database's own
 * `default` (see `supabase/schema.sql`), so the actual default values live
 * in exactly one place rather than being duplicated here and risking
 * drift.
 *
 * Returns `null` only if there's no signed-in user (shouldn't happen —
 * middleware already protects /settings — but this stays defensive rather
 * than assuming that guarantee always holds, same as
 * `app/settings/page.tsx`'s existing handling of `account`) or if Supabase
 * itself fails; the page renders a plain fallback message in either case
 * rather than crashing.
 */
export async function getOrCreateUserSettings(): Promise<UserSettings | null> {
  const user = await getServerUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data: existing, error: selectError } = await supabase
    .from("user_settings")
    .select(SETTINGS_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error(
      "[settings] failed to load user settings:",
      selectError.message,
    );
    return null;
  }

  if (existing) {
    return mapRow(existing);
  }

  const { data: created, error: insertError } = await supabase
    .from("user_settings")
    .insert({ user_id: user.id })
    .select(SETTINGS_COLUMNS)
    .single();

  if (insertError || !created) {
    console.error(
      "[settings] failed to create default user settings:",
      insertError?.message,
    );
    return null;
  }

  return mapRow(created);
}

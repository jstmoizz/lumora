/**
 * Read-side data access for Settings. The write side is a Server Action in
 * `lib/supabase/settings-actions.ts` — kept separate since anything
 * exported from a "use server" file becomes a network-callable endpoint.
 *
 * Every query goes through the RLS-scoped server client, never the
 * service-role client, so access is enforced by Postgres itself.
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
 * The signed-in user's `user_settings` row, creating it first on their
 * first visit. The insert supplies only `user_id`, leaving every other
 * column to the database's own default, so defaults live in one place.
 * Returns `null` on no user or a Supabase failure; the page falls back to
 * a plain message rather than crashing.
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

"use server";

/**
 * The one Server Action that writes to `user_settings`, separate from
 * `lib/supabase/settings.ts`'s read-only access.
 *
 * Identity always comes from `getServerUser()`, never an argument. `field`
 * is checked against a runtime whitelist, not just TypeScript's types,
 * since a Server Action is a network-callable endpoint reachable by a
 * hand-crafted request.
 */

import { createClient, getServerUser } from "./server";

export type UpdatableSettingField =
  | "response_style"
  | "explanation_depth"
  | "learning_focus"
  | "theme";

const UPDATABLE_FIELDS: readonly UpdatableSettingField[] = [
  "response_style",
  "explanation_depth",
  "learning_focus",
  "theme",
];

// `theme` is a fixed enum, not free text — validated against this exact
// set rather than the generic length check below (see the branch in
// updateUserSetting).
const THEME_VALUES = ["system", "light", "dark"] as const;

const MAX_VALUE_LENGTH = 100;

export interface UpdateUserSettingState {
  error: string | null;
}

export async function updateUserSetting(
  field: UpdatableSettingField,
  value: string,
): Promise<UpdateUserSettingState> {
  if (!UPDATABLE_FIELDS.includes(field)) {
    return { error: "That preference can't be changed." };
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue.length > MAX_VALUE_LENGTH) {
    return { error: "That value isn't valid." };
  }
  if (
    field === "theme" &&
    !THEME_VALUES.includes(trimmedValue as (typeof THEME_VALUES)[number])
  ) {
    return { error: "That value isn't valid." };
  }

  const user = await getServerUser();
  if (!user) {
    return { error: "You must be signed in to update your preferences." };
  }

  const supabase = await createClient();

  // A literal per-field object, not `{ [field]: trimmedValue }` — Supabase's
  // generated types reject a computed property key here.
  const fieldValue =
    field === "response_style"
      ? { response_style: trimmedValue }
      : field === "explanation_depth"
        ? { explanation_depth: trimmedValue }
        : field === "learning_focus"
          ? { learning_focus: trimmedValue }
          : { theme: trimmedValue as "system" | "light" | "dark" };

  // Upsert, not update: a missing row (shouldn't happen, since
  // getOrCreateUserSettings runs on page load) still gets created correctly.
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      updated_at: new Date().toISOString(),
      ...fieldValue,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error(`[settings] failed to update ${field}:`, error.message);
    return { error: "Couldn't save that change. Please try again." };
  }

  return { error: null };
}

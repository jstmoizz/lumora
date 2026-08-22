"use server";

/**
 * The one Server Action that writes to `user_settings` — kept narrowly
 * scoped and separate from `lib/supabase/settings.ts`'s read-only data
 * access, same split as `lib/supabase/actions.ts` (auth writes) vs.
 * `lib/supabase/conversations.ts` (conversation reads).
 *
 * Identity always comes from the authenticated session (`getServerUser()`),
 * never from an argument — there is no `userId` parameter for a caller to
 * supply, so there's nothing to spoof. `field` is restricted to a runtime
 * whitelist rather than trusted from the client purely via TypeScript's
 * types: a Server Action is still a network-callable endpoint underneath,
 * reachable with a hand-crafted request that ignores whatever the compiled
 * client code would ever actually send.
 */

import { createClient, getServerUser } from "./server";

export type UpdatableSettingField =
  | "response_style"
  | "explanation_depth"
  | "learning_focus";

const UPDATABLE_FIELDS: readonly UpdatableSettingField[] = [
  "response_style",
  "explanation_depth",
  "learning_focus",
];

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

  const user = await getServerUser();
  if (!user) {
    return { error: "You must be signed in to update your preferences." };
  }

  const supabase = await createClient();

  // A literal per-field object rather than `{ [field]: trimmedValue }`:
  // Supabase's generated Insert/Update types reject a computed property
  // key here (it widens to a generic string index signature, which their
  // stricter "no excess properties" check doesn't allow), so the field
  // gets picked via a switch instead.
  const fieldValue =
    field === "response_style"
      ? { response_style: trimmedValue }
      : field === "explanation_depth"
        ? { explanation_depth: trimmedValue }
        : { learning_focus: trimmedValue };

  // `upsert` rather than a plain `update`: the row is created up front by
  // `getOrCreateUserSettings()` on page load, so this should always be an
  // update in practice, but upsert makes that an assumption this code
  // doesn't actually depend on — a missing row still gets one, with every
  // other column falling back to its own database default exactly as a
  // fresh `insert()` would. `user_id` here identifies whose row to touch;
  // it's never taken from the caller, only from the session above.
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

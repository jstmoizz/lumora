import { getServerUser } from "@/lib/supabase/server";
import { getOrCreateUserSettings } from "@/lib/supabase/settings";
import SettingsClient, { type SettingsAccount } from "./SettingsClient";

export default async function SettingsPage() {
  const user = await getServerUser();

  // Should never actually be null — middleware redirects signed-out
  // visitors away from /settings before this ever renders — but
  // SettingsClient handles it gracefully regardless (no Account section)
  // rather than assuming the middleware guarantee always holds.
  const account: SettingsAccount | null = user?.email
    ? { email: user.email, verified: Boolean(user.email_confirmed_at) }
    : null;

  const preferences = await getOrCreateUserSettings();

  return <SettingsClient account={account} preferences={preferences} />;
}

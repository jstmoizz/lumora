import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_PERSISTENCE_TEST_EMAIL,
  E2E_PERSISTENCE_TEST_PASSWORD,
} from "./global-setup";

// Mirrors the inline admin client in global-setup.ts — see that file's
// comment for why.
function createTestAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set (in .env.local) to run this test.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Reuses generate-persistence.spec.ts's dedicated account. Safe here,
// unlike history.spec.ts's first attempt at the same idea: this test
// never asserts an exact count or anything else that another concurrently
// running test touching a *different* table could disturb — it only ever
// reads/writes `user_settings` (a 1:1 table by user_id), a table no other
// spec file touches at all.
test.use({ storageState: { cookies: [], origins: [] } });

const RESPONSE_STYLE_OPTIONS = [
  "Clear and concise",
  "Detailed",
  "Conversational",
];

test("Settings loads real preferences, persists a change across reload, and scopes it to the correct user", async ({
  page,
}) => {
  const admin = createTestAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_PERSISTENCE_TEST_EMAIL)
    .single();
  if (profileError || !profile) {
    throw new Error(
      `Could not find the seeded E2E test user's profile: ${profileError?.message}`,
    );
  }
  const userId = profile.id as string;

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_PERSISTENCE_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_PERSISTENCE_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

  await page.goto("/settings");
  await expect(page).toHaveURL("/settings");

  // "existing preferences are displayed": whatever this account's row
  // currently holds (its first-ever default, or a value left over from an
  // earlier run of this same test) renders as the active option — not a
  // hardcoded assumption about which one, since this test is designed to
  // be safely re-run against the same account indefinitely.
  const group = page.getByRole("group", { name: "Response style" });
  const selectedButton = group.locator('[aria-current="true"]');
  await expect(selectedButton).toBeVisible();
  const currentValue = (await selectedButton.textContent())?.trim();
  const nextValue = RESPONSE_STYLE_OPTIONS.find(
    (option) => option !== currentValue,
  );
  if (!nextValue) {
    throw new Error(
      `Unexpected current Response style value: ${currentValue}`,
    );
  }

  await group.getByRole("button", { name: nextValue }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

  // A real reload, not just client state — this is what actually proves
  // persistence rather than an optimistic UI update that never made it to
  // the database.
  await page.reload();
  await expect(group.locator('[aria-current="true"]')).toHaveText(nextValue);

  // "preferences remain associated with the correct user": the row this
  // change landed in belongs to this account's own id, read via the
  // service-role client (bypassing RLS deliberately, only for this
  // out-of-band verification — the app itself never does this).
  const { data: row, error: rowError } = await admin
    .from("user_settings")
    .select("user_id, response_style")
    .eq("user_id", userId)
    .single();
  expect(rowError).toBeNull();
  expect(row?.user_id).toBe(userId);
  expect(row?.response_style).toBe(nextValue);
});

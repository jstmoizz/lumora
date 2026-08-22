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

// Starts signed OUT and logs in as the dedicated persistence-test account
// (also used by generate-persistence.spec.ts and settings.spec.ts) rather
// than the default shared account: auth.spec.ts's "log out" test calls
// Supabase's signOut() with its default global scope against the default
// account, which revokes every session for that account — including this
// spec's, if it happened to be mid-test on a concurrent worker (this is
// exactly why the dedicated accounts in global-setup.ts exist; the first
// version of this test used the default account and was flaky for exactly
// this reason). Safe to share topic_progress with settings.spec.ts and
// generate-persistence.spec.ts's account since neither of them touches that
// table, and this test deliberately uses topics no other explore.spec.ts
// test clicks ("Software Engineering", "Databases"), so there's no
// cross-file collision on the same topic_progress row either. Designed to
// be safely re-run indefinitely — it reads the current count and asserts on
// the *delta*, never an absolute starting value.
test.use({ storageState: { cookies: [], origins: [] } });

const TOPIC_ID = "software-engineering";
const TOPIC_LABEL = "Software Engineering";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_PERSISTENCE_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_PERSISTENCE_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });
}

test("selecting a topic records progress, and it persists across reload", async ({
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

  async function currentStudyCount(): Promise<number> {
    const { data } = await admin
      .from("topic_progress")
      .select("study_count")
      .eq("user_id", userId)
      .eq("topic_id", TOPIC_ID)
      .maybeSingle();
    return data?.study_count ?? 0;
  }

  const beforeCount = await currentStudyCount();

  await login(page);

  await page.goto("/explore");
  await expect(
    page.getByRole("heading", { name: "Explore your knowledge space" }),
  ).toBeVisible();

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  await topics.getByRole("button", { name: TOPIC_LABEL }).click();

  await expect(
    page.getByRole("region", { name: `${TOPIC_LABEL} details` }),
  ).toBeVisible();

  // The write happens server-side, off the critical path of the UI update
  // above (Explore never blocks selection on it) — poll rather than assert
  // immediately.
  await expect
    .poll(() => currentStudyCount(), { timeout: 10_000 })
    .toBe(beforeCount + 1);

  // A real reload, not just client state, to prove the read side picks the
  // persisted value back up on the next page load.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Explore your knowledge space" }),
  ).toBeVisible();
  expect(await currentStudyCount()).toBe(beforeCount + 1);
});

test("reduced motion: selecting a topic through the static fallback still records progress", async ({
  page,
}) => {
  const admin = createTestAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_PERSISTENCE_TEST_EMAIL)
    .single();
  const userId = profile!.id as string;

  const REDUCED_MOTION_TOPIC_ID = "databases";

  async function currentStudyCount(): Promise<number> {
    const { data } = await admin
      .from("topic_progress")
      .select("study_count")
      .eq("user_id", userId)
      .eq("topic_id", REDUCED_MOTION_TOPIC_ID)
      .maybeSingle();
    return data?.study_count ?? 0;
  }

  const beforeCount = await currentStudyCount();

  await login(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  await topics.getByRole("button", { name: "Databases" }).click();

  await expect(
    page.getByRole("region", { name: "Databases details" }),
  ).toBeVisible();

  await expect
    .poll(() => currentStudyCount(), { timeout: 10_000 })
    .toBe(beforeCount + 1);
});

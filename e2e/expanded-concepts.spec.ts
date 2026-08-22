import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

// Uses the dedicated persistence-test account (also used by
// settings.spec.ts, generate-persistence.spec.ts, and topic-progress.spec.ts)
// rather than the default shared account — see topic-progress.spec.ts's own
// comment for the full rationale (auth.spec.ts's global-scope logout can
// revoke a concurrently-running test's session on the default account).
// Deliberately uses topics ("data-structures", "networks", "algorithms")
// that topic-progress.spec.ts never touches under this same account
// ("software-engineering", "databases"), so there's no row-level collision
// either.
test.use({ storageState: { cookies: [], origins: [] } });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_PERSISTENCE_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_PERSISTENCE_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });
}

// Forces a topic's familiarity tier directly via the service-role client
// rather than clicking through the UI repeatedly: the UI's own
// click-to-record path is already covered by topic-progress.spec.ts, and
// that path can only ever *increase* study_count, so it can't deterministically
// produce "exactly 1" (hinted) on a re-run against a persistent account that
// may already be past that. Seeding directly is what makes this test safe
// to run indefinitely regardless of prior runs.
async function seedStudyCount(
  admin: SupabaseClient,
  userId: string,
  topicId: string,
  studyCount: number,
) {
  if (studyCount <= 0) {
    await admin
      .from("topic_progress")
      .delete()
      .eq("user_id", userId)
      .eq("topic_id", topicId);
    return;
  }
  await admin.from("topic_progress").upsert(
    {
      user_id: userId,
      topic_id: topicId,
      study_count: studyCount,
      last_studied_at: new Date().toISOString(),
    },
    { onConflict: "user_id,topic_id" },
  );
}

test("expanded concepts appear only once a topic is familiar enough, deterministically per topic", async ({
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

  await seedStudyCount(admin, userId, "data-structures", 0);
  await seedStudyCount(admin, userId, "networks", 1);
  await seedStudyCount(admin, userId, "algorithms", 2);

  await login(page);
  await page.goto("/explore");

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });

  // Unstudied: the core node only — no mention of related concepts at all.
  await topics.getByRole("button", { name: "Data Structures" }).click();
  await expect(
    page.getByRole("region", { name: "Data Structures details" }),
  ).toBeVisible();
  await expect(page.getByText(/related concept/i)).not.toBeVisible();

  // Studied once: a quiet textual hint, nothing clickable yet.
  await topics.getByRole("button", { name: "Networks" }).click();
  await expect(
    page.getByRole("region", { name: "Networks details" }),
  ).toBeVisible();
  await expect(page.getByText(/related concepts/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "TCP/IP" })).not.toBeVisible();

  // Studied repeatedly: concepts are revealed as real, selectable controls.
  await topics.getByRole("button", { name: "Algorithms" }).click();
  await expect(
    page.getByRole("region", { name: "Algorithms details" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Sorting" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Graph Algorithms" }),
  ).toBeVisible();
});

test("selecting a revealed concept via keyboard opens its own accessible panel", async ({
  page,
}) => {
  const admin = createTestAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_PERSISTENCE_TEST_EMAIL)
    .single();
  const userId = profile!.id as string;
  await seedStudyCount(admin, userId, "algorithms", 2);

  await login(page);
  await page.goto("/explore");

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  await topics.getByRole("button", { name: "Algorithms" }).click();

  const sortingButton = page.getByRole("button", { name: "Sorting" });
  await sortingButton.focus();
  await expect(sortingButton).toBeFocused();
  await page.keyboard.press("Enter");

  const conceptPanel = page.getByRole("region", { name: "Sorting details" });
  await expect(conceptPanel).toBeVisible();
  await expect(
    conceptPanel.getByRole("heading", { name: "Sorting" }),
  ).toBeVisible();
  await expect(conceptPanel.getByText("Part of Algorithms")).toBeVisible();

  await conceptPanel.getByRole("button", { name: "Back to overview" }).click();
  await expect(conceptPanel).not.toBeVisible();
});

test("reduced motion: expanded concepts remain discoverable and selectable through the panel", async ({
  page,
}) => {
  const admin = createTestAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_PERSISTENCE_TEST_EMAIL)
    .single();
  const userId = profile!.id as string;
  await seedStudyCount(admin, userId, "algorithms", 2);

  await login(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  await topics.getByRole("button", { name: "Algorithms" }).click();

  const sortingButton = page.getByRole("button", { name: "Sorting" });
  await expect(sortingButton).toBeVisible();
  await sortingButton.click();

  await expect(
    page.getByRole("region", { name: "Sorting details" }),
  ).toBeVisible();
});

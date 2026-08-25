import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { E2E_HISTORY_TEST_EMAIL, E2E_HISTORY_TEST_PASSWORD } from "./global-setup";

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

// Mirrors lib/knowledge-graph/topics.ts's normalizeTopicKey exactly — see
// expanded-concepts.spec.ts's own copy of this function for why it's
// duplicated rather than imported.
function normalizeTopicKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// Uses the dedicated history-test account (otherwise only used by
// history.spec.ts, which never touches /explore or knowledge_nodes) rather
// than the default shared account. These tests used to rely on the default
// storageState and were flaky for the same reason documented in
// settings.spec.ts: auth.spec.ts's "log out"
// test calls Supabase's signOut() with its default global scope against
// the default account, which can revoke this test's session mid-run on a
// concurrent worker. That race went from "rare" to "reliably reproduced" as
// Phase 4.2/4.3 added more e2e specs and stretched the suite's total
// runtime — fixed here using the same established pattern the other
// specs already use, not a change to any of the actual assertions below.
test.use({ storageState: { cookies: [], origins: [] } });

// All three tests below seed and clean up the SAME set of knowledge_nodes
// rows under the shared history-test account. Under Playwright's default
// fullyParallel scheduling they'd race each other within this file (one
// test's afterEach cleanup deleting rows a concurrently-running sibling
// still needs) — serializing just this file's own tests relative to each
// other avoids that without opting the rest of the suite out of
// parallelism. Same pattern as expanded-concepts.spec.ts.
test.describe.configure({ mode: "serial" });

const ALGORITHMS_LABEL = "Algorithms";
const MATHEMATICS_LABEL = "Mathematics";
const NETWORKS_LABEL = "Networks";
const OWNED_TOP_LEVEL_LABELS = [ALGORITHMS_LABEL, MATHEMATICS_LABEL, NETWORKS_LABEL];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_HISTORY_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_HISTORY_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });
}

async function getUserId(admin: SupabaseClient): Promise<string> {
  const { data: profile, error } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_HISTORY_TEST_EMAIL)
    .single();
  if (error || !profile) {
    throw new Error(`Could not find the seeded E2E test user's profile: ${error?.message}`);
  }
  return profile.id as string;
}

// Creates the real knowledge_nodes rows this spec's UI assertions depend
// on — the actual root cause of these tests' failures was that the account
// had zero topics, so the Topics list (OptionWheel, backed entirely by
// knowledge_nodes — see ExploreClient.tsx's allTopicLabels) had nothing to
// show. Upserts rather than plain inserts so a re-run after an interrupted
// previous cleanup never collides on knowledge_nodes' `unique (user_id,
// topic_key)` constraint.
async function seedKnowledgeNodes(admin: SupabaseClient, userId: string) {
  for (const label of OWNED_TOP_LEVEL_LABELS) {
    const { error } = await admin.from("knowledge_nodes").upsert(
      {
        user_id: userId,
        topic_key: normalizeTopicKey(label),
        label,
        parent_id: null,
        related_labels: [],
      },
      { onConflict: "user_id,topic_key" },
    );
    if (error) {
      throw new Error(`Failed to seed knowledge node "${label}": ${error.message}`);
    }
  }
}

async function cleanupKnowledgeNodes(admin: SupabaseClient, userId: string) {
  await admin
    .from("knowledge_nodes")
    .delete()
    .eq("user_id", userId)
    .in("topic_key", OWNED_TOP_LEVEL_LABELS.map(normalizeTopicKey));
}

test.beforeEach(async () => {
  const admin = createTestAdminClient();
  const userId = await getUserId(admin);
  await seedKnowledgeNodes(admin, userId);
});

test.afterEach(async () => {
  const admin = createTestAdminClient();
  const userId = await getUserId(admin);
  await cleanupKnowledgeNodes(admin, userId);
});

test("primary flow: select a topic, read its panel, return to overview", async ({
  page,
}) => {
  await login(page);
  await page.goto("/explore");

  await expect(
    page.getByRole("heading", { name: "Your knowledge universe" }),
  ).toBeVisible();

  // The top-level topic list is OptionWheel's roving-focus listbox (an
  // `<aside aria-label="Topics">` wrapping a `role="listbox"`, `role="option"`
  // structure) — not a `<nav>`/`<button>` list.
  const topics = page.getByRole("listbox", { name: "Topics" });
  await expect(topics).toBeVisible();

  // OptionWheel always starts with index 0 selected internally
  // (`defaultSelected` defaults to 0) but node order from the DB query
  // isn't guaranteed, so it's never safe to assume Algorithms starts there.
  // Selection only fires its onChange when a click actually *changes* the
  // selected index, so a throwaway click on a different item first
  // guarantees the real selection below always registers as a change,
  // regardless of which item happened to start selected.
  await topics.getByRole("option", { name: MATHEMATICS_LABEL }).click();

  const algorithmsOption = topics.getByRole("option", { name: ALGORITHMS_LABEL });
  await expect(algorithmsOption).toBeVisible();
  await algorithmsOption.click();

  const panel = page.getByRole("region", { name: "Algorithms details" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Algorithms" }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Back to overview" }).click();
  await expect(panel).not.toBeVisible();
});

test("keyboard: a topic can be reached and selected without a mouse", async ({
  page,
}) => {
  await login(page);
  await page.goto("/explore");

  const topics = page.getByRole("listbox", { name: "Topics" });
  await topics.focus();
  await expect(topics).toBeFocused();

  const mathPanel = page.getByRole("region", { name: "Mathematics details" });

  // OptionWheel's keyboard handling lives on the listbox root, not on
  // individual (non-tabbable) options: ArrowUp/ArrowDown move the selected
  // index by one and fire selection immediately (there's no separate
  // "Enter to activate" step — see OptionWheel.tsx's handleKeyDown/
  // applyTarget). It always starts at index 0 (`defaultSelected`'s default),
  // but which label that is isn't guaranteed, so a fixed number of
  // "ArrowDown to Mathematics" presses would be unsafe to assume.
  //
  // Force one real transition first (0 -> 1 is guaranteed to be a genuine
  // index change, since the wheel always starts at 0), then walk back to
  // index 0 and sweep forward through every remaining index in order,
  // checking after each press whether Mathematics' panel has opened. Every
  // step in this sweep is a real, adjacent index change, so every press
  // genuinely exercises keyboard activation rather than relying on a
  // possibly-stale initial aria-selected value.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  for (let i = 0; i < OWNED_TOP_LEVEL_LABELS.length - 1; i++) {
    if (await mathPanel.isVisible()) break;
    await page.keyboard.press("ArrowDown");
  }

  await expect(mathPanel).toBeVisible();
});

test("reduced motion: the static knowledge space is shown and stays interactive", async ({
  page,
}) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const topics = page.getByRole("listbox", { name: "Topics" });
  // See the primary-flow test's own comment: a throwaway click on a
  // different item first guarantees the real selection below registers as
  // a change, regardless of which item the wheel started on.
  await topics.getByRole("option", { name: ALGORITHMS_LABEL }).click();

  const networksOption = topics.getByRole("option", { name: NETWORKS_LABEL });
  await expect(networksOption).toBeVisible();
  await networksOption.click();

  await expect(
    page.getByRole("region", { name: "Networks details" }),
  ).toBeVisible();
});

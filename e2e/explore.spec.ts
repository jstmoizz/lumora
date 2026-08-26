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

// Mirrors lib/knowledge-graph/topics.ts's normalizeTopicKey — not imported,
// since e2e specs avoid reaching into app modules.
function normalizeTopicKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// Uses the dedicated history-test account rather than the default shared
// one — auth.spec.ts's "log out" test signs the default account out
// globally, which can revoke this test's session mid-run on a concurrent worker.
test.use({ storageState: { cookies: [], origins: [] } });

// All three tests seed and clean up the same knowledge_nodes rows, which
// would race under fullyParallel scheduling. Serializing just this file
// avoids that without opting the rest of the suite out of parallelism.
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

// Upserts rather than plain inserts so a re-run after an interrupted
// previous cleanup never collides on the unique (user_id, topic_key) constraint.
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

// Wipes the whole graph, not just OWNED_TOP_LEVEL_LABELS's rows — this
// file's tests assume the account's top-level topic list is exactly the 3
// labels seeded below, and any stray leftover node (e.g. from a past,
// differently-shaped test run against this same shared account) throws off
// the keyboard sweep test, which walks a fixed number of ArrowDown presses
// from index 0. A dedicated single-purpose E2E account has nothing else to
// preserve here.
async function cleanupKnowledgeNodes(admin: SupabaseClient, userId: string) {
  await admin.from("knowledge_nodes").delete().eq("user_id", userId);
}

test.beforeEach(async () => {
  const admin = createTestAdminClient();
  const userId = await getUserId(admin);
  await cleanupKnowledgeNodes(admin, userId);
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

  const topics = page.getByRole("listbox", { name: "Topics" });
  await expect(topics).toBeVisible();

  // OptionWheel always starts at index 0, but node order from the DB isn't
  // guaranteed, and onChange only fires on an actual index change — a
  // throwaway click first guarantees the real selection below registers.
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

  // Keyboard handling lives on the listbox root — ArrowUp/ArrowDown move
  // the selected index and fire selection immediately, no separate
  // "Enter to activate" step. Which label starts at index 0 isn't
  // guaranteed, so force one real transition (0 -> 1 -> 0) to make sure a
  // real selection fires even if Mathematics turns out to already be at
  // index 0 — OptionWheel's mount-time layout effect doesn't fire onChange
  // for the index it's already at.
  //
  // Rather than sweeping forward and polling for the panel after each
  // press (which raced the panel's render on a loaded CI runner — the
  // previous version of this test), read the rendered option labels
  // directly and press ArrowDown exactly as many times as Mathematics'
  // real index. That's deterministic regardless of how many topics exist
  // or what order the DB returns them in, with no timing dependency until
  // the one, final, properly-retrying assertion.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");

  const labels = await topics.getByRole("option").allTextContents();
  const mathIndex = labels.indexOf(MATHEMATICS_LABEL);
  if (mathIndex === -1) {
    throw new Error(
      `"${MATHEMATICS_LABEL}" not found among rendered topics: ${labels.join(", ")}`,
    );
  }
  for (let i = 0; i < mathIndex; i++) {
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
  // A throwaway click first guarantees the real selection registers.
  await topics.getByRole("option", { name: ALGORITHMS_LABEL }).click();

  const networksOption = topics.getByRole("option", { name: NETWORKS_LABEL });
  await expect(networksOption).toBeVisible();
  await networksOption.click();

  await expect(
    page.getByRole("region", { name: "Networks details" }),
  ).toBeVisible();
});

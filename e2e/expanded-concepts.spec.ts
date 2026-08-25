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

// Mirrors lib/knowledge-graph/topics.ts's normalizeTopicKey exactly (a
// two-line pure function: trim, collapse whitespace, lowercase) — not
// imported directly, since e2e specs deliberately avoid reaching into app
// modules (see global-setup.ts's own comment on why the admin client there
// is inlined rather than imported).
function normalizeTopicKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// Uses the dedicated persistence-test account (also used by
// settings.spec.ts and generate-persistence.spec.ts) rather than the
// default shared account: auth.spec.ts's "log out" test calls Supabase's
// signOut() with its default global scope against the default account,
// which revokes every session for that account — including this spec's, if
// it happened to be mid-test on a concurrent worker.
test.use({ storageState: { cookies: [], origins: [] } });

// This file's three tests all upsert/delete the SAME set of knowledge_nodes
// rows under the shared persistence account (settings.spec.ts never
// touches knowledge_nodes, so there's no cross-file collision — but the
// tests *within this file* would race each other under
// Playwright's default fullyParallel scheduling, since one test's afterEach
// cleanup would delete rows a concurrently-running sibling test still needs).
// Serializing just this file's own tests relative to each other avoids that,
// without opting the rest of the suite out of parallelism — each test is
// still fully self-contained (seeds its own fixture in beforeEach, cleans
// it up in afterEach), so nothing here depends on *which* test runs first,
// only that they don't overlap in time.
test.describe.configure({ mode: "serial" });

const DATA_STRUCTURES_LABEL = "Data Structures";
const NETWORKS_LABEL = "Networks";
const ALGORITHMS_LABEL = "Algorithms";
const SORTING_LABEL = "Sorting";
const GRAPH_ALGORITHMS_LABEL = "Graph Algorithms";
// Deliberately left with no matching knowledge_nodes row of its own — this
// is what exercises TopicPanel's "preview" (not-yet-studied) branch rather
// than a real node's.
const TCP_IP_LABEL = "TCP/IP";

// Every top-level topic_key this file owns exclusively under the shared
// account.
const OWNED_TOP_LEVEL_LABELS = [DATA_STRUCTURES_LABEL, NETWORKS_LABEL, ALGORITHMS_LABEL];

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_PERSISTENCE_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_PERSISTENCE_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });
}

async function getUserId(admin: SupabaseClient): Promise<string> {
  const { data: profile, error } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_PERSISTENCE_TEST_EMAIL)
    .single();
  if (error || !profile) {
    throw new Error(`Could not find the seeded E2E test user's profile: ${error?.message}`);
  }
  return profile.id as string;
}

async function upsertNode(
  admin: SupabaseClient,
  userId: string,
  label: string,
  relatedLabels: string[],
  parentId: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("knowledge_nodes")
    .upsert(
      {
        user_id: userId,
        topic_key: normalizeTopicKey(label),
        label,
        parent_id: parentId,
        related_labels: relatedLabels,
      },
      { onConflict: "user_id,topic_key" },
    )
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed knowledge node "${label}": ${error?.message}`);
  }
  return data.id as string;
}

// Creates the real knowledge_nodes rows this spec's UI assertions depend
// on — the actual root cause of the original "0 topics" failure was that
// no such rows existed at all (only topic_progress rows, a table nothing
// in the app reads). Upserts rather than plain inserts so a re-run after an
// interrupted previous cleanup never collides on knowledge_nodes' `unique
// (user_id, topic_key)` constraint.
async function seedKnowledgeNodes(admin: SupabaseClient, userId: string) {
  await upsertNode(admin, userId, DATA_STRUCTURES_LABEL, [], null);
  await upsertNode(admin, userId, NETWORKS_LABEL, [TCP_IP_LABEL], null);
  const algorithmsId = await upsertNode(
    admin,
    userId,
    ALGORITHMS_LABEL,
    [SORTING_LABEL, GRAPH_ALGORITHMS_LABEL],
    null,
  );
  await upsertNode(admin, userId, SORTING_LABEL, [], algorithmsId);
  await upsertNode(admin, userId, GRAPH_ALGORITHMS_LABEL, [], algorithmsId);
}

// `parent_id ... on delete cascade` (see supabase/schema.sql) removes
// Sorting/Graph Algorithms automatically once Algorithms is deleted —
// deleting the three parent-less topics this file owns is enough to clean
// up the whole set it created.
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

test("a node's related labels render as real controls when a matching node exists, previews when it doesn't, and nothing when there are none", async ({
  page,
}) => {
  await login(page);
  await page.goto("/explore");

  // The top-level topic list is OptionWheel's roving-focus listbox (an
  // `<aside aria-label="Topics">` wrapping a `role="listbox"`, `role="option"`
  // structure) — not a `<nav>`/`<button>` list. Related concepts inside a
  // selected node's own panel (below) are real buttons, a different, plain
  // control.
  const topics = page.getByRole("listbox", { name: "Topics" });

  // OptionWheel starts with *some* item already selected internally
  // (index 0 of `items` — node order from the DB query isn't guaranteed,
  // so it's never safe to assume which label that is) and only fires its
  // onChange when a click actually *changes* that index. A throwaway click
  // on a different item first guarantees the real first selection below
  // always registers as a change, regardless of which item happened to
  // start selected.
  await topics.getByRole("option", { name: GRAPH_ALGORITHMS_LABEL }).click();

  // No related_labels at all: no "Related" section appears.
  await topics.getByRole("option", { name: DATA_STRUCTURES_LABEL }).click();
  const dataStructuresPanel = page.getByRole("region", {
    name: `${DATA_STRUCTURES_LABEL} details`,
  });
  await expect(dataStructuresPanel).toBeVisible();
  await expect(dataStructuresPanel.getByText("Related", { exact: true })).not.toBeVisible();

  // A related label with no matching node yet: shown as a real button, but
  // selecting it opens the "not studied yet" preview state, not a real
  // node's data.
  await topics.getByRole("option", { name: NETWORKS_LABEL }).click();
  const networksPanel = page.getByRole("region", { name: `${NETWORKS_LABEL} details` });
  await expect(networksPanel).toBeVisible();
  const tcpIpButton = page.getByRole("button", { name: TCP_IP_LABEL });
  await expect(tcpIpButton).toBeVisible();
  await tcpIpButton.click();

  const tcpIpPanel = page.getByRole("region", { name: `${TCP_IP_LABEL} details` });
  await expect(tcpIpPanel).toBeVisible();
  await expect(
    tcpIpPanel.getByText("Not studied yet — an unlocked suggestion based on what you already know."),
  ).toBeVisible();

  // A related label that DOES match a real node: selecting it opens that
  // node's own full panel (Delete Topic control included), not the preview
  // state above.
  // `exact: true` — Playwright's role-name matching is substring-based by
  // default, and "Algorithms" would otherwise also match "Graph Algorithms".
  await topics.getByRole("option", { name: ALGORITHMS_LABEL, exact: true }).click();
  const algorithmsPanel = page.getByRole("region", { name: `${ALGORITHMS_LABEL} details` });
  await expect(algorithmsPanel).toBeVisible();
  const sortingButton = page.getByRole("button", { name: SORTING_LABEL });
  await expect(sortingButton).toBeVisible();
  await expect(page.getByRole("button", { name: GRAPH_ALGORITHMS_LABEL })).toBeVisible();

  await sortingButton.click();
  const sortingPanel = page.getByRole("region", { name: `${SORTING_LABEL} details` });
  await expect(sortingPanel).toBeVisible();
  await expect(sortingPanel.getByRole("button", { name: "Delete Topic" })).toBeVisible();
});

test("selecting a revealed concept via keyboard opens its own accessible panel", async ({
  page,
}) => {
  await login(page);
  await page.goto("/explore");

  const topics = page.getByRole("listbox", { name: "Topics" });
  // See the first test's own comment: a throwaway click on a different
  // item first guarantees the real selection below registers as a change,
  // regardless of which item the wheel started on.
  await topics.getByRole("option", { name: DATA_STRUCTURES_LABEL }).click();
  // `exact: true` — Playwright's role-name matching is substring-based by
  // default, and "Algorithms" would otherwise also match "Graph Algorithms".
  await topics.getByRole("option", { name: ALGORITHMS_LABEL, exact: true }).click();

  const sortingButton = page.getByRole("button", { name: SORTING_LABEL });
  await sortingButton.focus();
  await expect(sortingButton).toBeFocused();
  await page.keyboard.press("Enter");

  const conceptPanel = page.getByRole("region", { name: `${SORTING_LABEL} details` });
  await expect(conceptPanel).toBeVisible();
  await expect(
    conceptPanel.getByRole("heading", { name: SORTING_LABEL }),
  ).toBeVisible();

  await conceptPanel.getByRole("button", { name: "Back to overview" }).click();
  await expect(conceptPanel).not.toBeVisible();
});

test("reduced motion: expanded concepts remain discoverable and selectable through the panel", async ({
  page,
}) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const topics = page.getByRole("listbox", { name: "Topics" });
  // See the first test's own comment: a throwaway click on a different
  // item first guarantees the real selection below registers as a change,
  // regardless of which item the wheel started on.
  await topics.getByRole("option", { name: DATA_STRUCTURES_LABEL }).click();
  // `exact: true` — Playwright's role-name matching is substring-based by
  // default, and "Algorithms" would otherwise also match "Graph Algorithms".
  await topics.getByRole("option", { name: ALGORITHMS_LABEL, exact: true }).click();

  const sortingButton = page.getByRole("button", { name: SORTING_LABEL });
  await expect(sortingButton).toBeVisible();
  await sortingButton.click();

  await expect(
    page.getByRole("region", { name: `${SORTING_LABEL} details` }),
  ).toBeVisible();
});

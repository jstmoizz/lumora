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

// Mirrors lib/knowledge-graph/topics.ts's normalizeTopicKey — not imported,
// since e2e specs avoid reaching into app modules.
function normalizeTopicKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

// Uses the dedicated persistence-test account rather than the default
// shared one — auth.spec.ts's "log out" test signs that account out
// globally, which would revoke this spec's session mid-test on a
// concurrent worker.
test.use({ storageState: { cookies: [], origins: [] } });

// This file's three tests all upsert/delete the same knowledge_nodes rows,
// which would race each other under fullyParallel scheduling (one test's
// afterEach cleanup deleting rows a sibling still needs). Serializing just
// this file avoids that without opting the rest of the suite out of
// parallelism.
test.describe.configure({ mode: "serial" });

const DATA_STRUCTURES_LABEL = "Data Structures";
const NETWORKS_LABEL = "Networks";
const ALGORITHMS_LABEL = "Algorithms";
const SORTING_LABEL = "Sorting";
const GRAPH_ALGORITHMS_LABEL = "Graph Algorithms";
// No matching knowledge_nodes row of its own — exercises TopicPanel's
// "preview" (not-yet-studied) branch.
const TCP_IP_LABEL = "TCP/IP";

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

// Upserts rather than plain inserts so a re-run after an interrupted
// previous cleanup never collides on the unique (user_id, topic_key) constraint.
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

// on delete cascade removes Sorting/Graph Algorithms automatically once
// Algorithms is deleted.
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

  const topics = page.getByRole("listbox", { name: "Topics" });

  // OptionWheel starts with some item already selected and only fires
  // onChange on an actual index change — a throwaway click first guarantees
  // the real selection below registers, regardless of which item started selected.
  await topics.getByRole("option", { name: GRAPH_ALGORITHMS_LABEL }).click();

  // No related_labels at all: no "Related" section appears.
  await topics.getByRole("option", { name: DATA_STRUCTURES_LABEL }).click();
  const dataStructuresPanel = page.getByRole("region", {
    name: `${DATA_STRUCTURES_LABEL} details`,
  });
  await expect(dataStructuresPanel).toBeVisible();
  await expect(dataStructuresPanel.getByText("Related", { exact: true })).not.toBeVisible();

  // A related label with no matching node yet opens the preview state.
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

  // A related label that matches a real node opens its full panel instead.
  // exact: true, since "Algorithms" would otherwise also match "Graph Algorithms".
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
  // A throwaway click first guarantees the real selection registers.
  await topics.getByRole("option", { name: DATA_STRUCTURES_LABEL }).click();
  // exact: true, since "Algorithms" would otherwise also match "Graph Algorithms".
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
  // A throwaway click first guarantees the real selection registers.
  await topics.getByRole("option", { name: DATA_STRUCTURES_LABEL }).click();
  // exact: true, since "Algorithms" would otherwise also match "Graph Algorithms".
  await topics.getByRole("option", { name: ALGORITHMS_LABEL, exact: true }).click();

  const sortingButton = page.getByRole("button", { name: SORTING_LABEL });
  await expect(sortingButton).toBeVisible();
  await sortingButton.click();

  await expect(
    page.getByRole("region", { name: `${SORTING_LABEL} details` }),
  ).toBeVisible();
});

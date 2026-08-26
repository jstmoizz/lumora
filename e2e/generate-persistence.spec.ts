import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_PERSISTENCE_TEST_EMAIL,
  E2E_PERSISTENCE_TEST_PASSWORD,
} from "./global-setup";

// Logs in as its own dedicated account rather than reusing the shared
// session, since auth.spec.ts's "log out" test can revoke that session at
// any point while this test's real, non-mocked requests are in flight.
test.use({ storageState: { cookies: [], origins: [] } });

// Mirrors the inline admin client in global-setup.ts rather than importing
// lib/supabase/admin.ts, whose Database generic pulls in the `ai` package
// purely for typing.
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

// Deliberately does NOT mock /api/chat (unlike generate.spec.ts) — it
// exercises the real route against the real Supabase project and model, to
// verify persistence works end to end. Nothing is cleaned up afterward.
test("a real authenticated turn is persisted, and a follow-up reuses the same conversation", async ({
  page,
}) => {
  // Two full, non-mocked model round trips plus several polled Supabase
  // lookups, generous since this can queue behind other workers.
  test.setTimeout(180_000);

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

  const { data: conversationsBefore } = await admin
    .from("conversations")
    .select("id")
    .eq("user_id", userId);
  const countBefore = conversationsBefore?.length ?? 0;

  async function conversationCountForUser() {
    const { data } = await admin
      .from("conversations")
      .select("id")
      .eq("user_id", userId);
    return data?.length ?? 0;
  }

  async function messageRoleCounts(conversationId: string) {
    const { data } = await admin
      .from("messages")
      .select("role")
      .eq("conversation_id", conversationId);
    return {
      user: data?.filter((m) => m.role === "user").length ?? 0,
      assistant: data?.filter((m) => m.role === "assistant").length ?? 0,
    };
  }

  // The UI's "done" signal fires before the server's onEnd persistence
  // runs, so every assertion below that depends on it polls rather than
  // reading once immediately after a UI wait.
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_PERSISTENCE_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_PERSISTENCE_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

  const composer = page.getByLabel("Message");
  await composer.fill("Say the single word: acknowledged");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking…")).toBeVisible();

  // The conversation row is created before generation starts, so this
  // resolves quickly — it's a proxy for "exists," not "the turn finished".
  await expect
    .poll(conversationCountForUser, { timeout: 40_000 })
    .toBe(countBefore + 1);

  const { data: created } = await admin
    .from("conversations")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);
  const conversationId = created![0].id as string;
  const createdAt = created![0].created_at as string;

  // Only true once onEnd has run — the assistant message is inserted there.
  await expect
    .poll(() => messageRoleCounts(conversationId), { timeout: 40_000 })
    .toEqual({ user: 1, assistant: 1 });

  // The timestamp bump is the last thing onEnd does — poll it separately
  // rather than assuming it landed already.
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("conversations")
          .select("updated_at")
          .eq("id", conversationId)
          .single();
        return data?.updated_at;
      },
      { timeout: 40_000 },
    )
    .not.toBe(createdAt);

  // A follow-up in the same page session must continue this conversation,
  // not start a second one.
  await composer.fill("Now say the single word: understood");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking…")).toBeVisible();

  await expect
    .poll(() => messageRoleCounts(conversationId), { timeout: 40_000 })
    .toEqual({ user: 2, assistant: 2 });

  expect(await conversationCountForUser()).toBe(countBefore + 1);
});

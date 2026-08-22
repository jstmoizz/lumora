import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_PERSISTENCE_TEST_EMAIL,
  E2E_PERSISTENCE_TEST_PASSWORD,
} from "./global-setup";

// Signed out, unlike every other test's default: this test logs in as its
// own dedicated account (see global-setup.ts) rather than reusing the
// shared session, since auth.spec.ts's "log out" test can revoke that
// shared session (Supabase's signOut() defaults to all-sessions scope) at
// any point while this test's real, non-mocked requests are in flight.
test.use({ storageState: { cookies: [], origins: [] } });

// Mirrors the inline admin client in global-setup.ts rather than importing
// lib/supabase/admin.ts: that module's `Database` generic pulls in
// lib/ai/tools.ts (and, through it, the `ai` package) purely for typing,
// and Playwright's TS transform only reliably covers files statically
// reachable from playwright.config.ts/spec files. This test only needs a
// few untyped table reads, so the app's typed client isn't worth the risk.
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

// This test deliberately does NOT mock /api/chat (unlike generate.spec.ts)
// — it exercises the real route against the real, configured Supabase
// project and the real model, to verify Phase 3.1's persistence actually
// works end to end, not just that the UI renders correctly against a
// canned response. It creates one new conversation and its messages under
// its own dedicated E2E account (see global-setup.ts); nothing is cleaned
// up afterward, same as that account's own auth.users row.
test("a real authenticated turn is persisted, and a follow-up reuses the same conversation", async ({
  page,
}) => {
  // Two full, non-mocked model round trips plus several polled Supabase
  // lookups. Generous on top of that: under the full suite's parallel
  // workers, this test's requests share one dev server with everything
  // else, so it can queue behind other workers' first-time route
  // compilation rather than reflecting anything slow in the feature itself.
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

  // The client's own "generation finished" signal (the composer switching
  // back from "Stop" to "Send") fires once the AI SDK processes the
  // stream's `finish` chunk — which the server enqueues *before* running
  // `onEnd` (where api/chat/route.ts's persistence happens; `onEnd` is the
  // TransformStream's `flush()`, which only runs once every chunk,
  // including `finish`, has already been sent). So there's an inherent gap
  // between "the UI looks done" and "the database write has landed" for
  // each individual write — every assertion below that depends on
  // server-side persistence polls for it rather than reading once
  // immediately after a UI wait.
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_PERSISTENCE_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_PERSISTENCE_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

  const composer = page.getByLabel("Message");
  await composer.fill("Say the single word: acknowledged");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thinking…")).toBeVisible();

  // The conversation row itself is created up front, before generation
  // starts, so this poll resolves quickly — it isn't a proxy for "the turn
  // finished", just for "a conversation now exists".
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

  // Only becomes true once `onEnd` has run, since the assistant message is
  // inserted there and nowhere else.
  await expect
    .poll(() => messageRoleCounts(conversationId), { timeout: 40_000 })
    .toEqual({ user: 1, assistant: 1 });

  // The timestamp bump is the last thing `onEnd` does, right after the
  // assistant insert above — poll it separately rather than assuming it
  // landed by the time the message poll above resolved.
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

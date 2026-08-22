import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_HISTORY_TEST_EMAIL,
  E2E_HISTORY_TEST_PASSWORD,
} from "./global-setup";

// Mirrors the inline admin client in global-setup.ts rather than importing
// lib/supabase/admin.ts — see that file's comment for why.
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

// Its own dedicated account (see global-setup.ts) — sharing
// generate-persistence.spec.ts's account was the first attempt, but that
// test asserts an *exact* conversation count for its account, and this
// test running concurrently and inserting its own conversation into the
// same account raced with that count. Every assertion below is still
// scoped to a uniquely-titled conversation this test creates itself, so
// it's also safe regardless of whatever else this account accumulates
// across this test's own prior runs.
test.use({ storageState: { cookies: [], origins: [] } });

test("History lists a real conversation and resumes it with its past messages", async ({
  page,
}) => {
  const admin = createTestAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_HISTORY_TEST_EMAIL)
    .single();
  if (profileError || !profile) {
    throw new Error(
      `Could not find the seeded E2E test user's profile: ${profileError?.message}`,
    );
  }
  const userId = profile.id as string;

  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_HISTORY_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_HISTORY_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

  // Seeded directly via the admin client rather than through a real model
  // round trip: History only needs to read and navigate what's already in
  // the table, which generate-persistence.spec.ts already proves gets
  // written correctly — no need to pay for a second real model call here.
  const title = `E2E history check ${randomUUID().slice(0, 8)}`;
  const userText = "What causes the seasons?";
  const assistantText = "Earth's axial tilt changes how directly sunlight hits each hemisphere.";

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    throw new Error(`Failed to seed a conversation: ${conversationError?.message}`);
  }
  const conversationId = conversation.id as string;

  const { error: messagesError } = await admin.from("messages").insert([
    {
      conversation_id: conversationId,
      role: "user",
      content: userText,
      parts: [{ type: "text", text: userText }],
    },
    {
      conversation_id: conversationId,
      role: "assistant",
      content: assistantText,
      parts: [{ type: "text", text: assistantText, state: "done" }],
    },
  ]);
  if (messagesError) {
    throw new Error(`Failed to seed messages: ${messagesError.message}`);
  }

  await page.goto("/history");

  const conversationLink = page.getByRole("link", { name: new RegExp(title) });
  await expect(conversationLink).toBeVisible();

  await conversationLink.click();
  await expect(page).toHaveURL(new RegExp(`conversationId=${conversationId}`));
  await expect(page.getByText(userText)).toBeVisible();
  await expect(page.getByText(assistantText)).toBeVisible();
});

// The empty state ("No study sessions yet") isn't covered here — it would
// need a guaranteed-empty account, and every account this suite has either
// already has conversations by design (this file's own account) or would
// have to be created fresh per run to guarantee emptiness, piling up
// throwaway auth.users rows on every single run. That render path is
// already covered at the unit level (HistoryClient.test.tsx), including
// against listConversations() genuinely returning an empty array
// (conversations.test.ts) — an E2E pass would only additionally prove the
// real query returns empty for an empty account, which isn't worth a new
// permanent account to demonstrate.

import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { E2E_MANAGE_TEST_EMAIL, E2E_MANAGE_TEST_PASSWORD } from "./global-setup";

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

// Its own dedicated account (see global-setup.ts): this spec deletes
// conversations, which must never touch another spec's data.
test.use({ storageState: { cookies: [], origins: [] } });

test("History can search, rename, and delete a real conversation, and the database follows", async ({
  page,
}) => {
  const admin = createTestAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("users")
    .select("id")
    .eq("email", E2E_MANAGE_TEST_EMAIL)
    .single();
  if (profileError || !profile) {
    throw new Error(`Could not find the seeded E2E test user's profile: ${profileError?.message}`);
  }

  const suffix = randomUUID().slice(0, 8);
  const title = `E2E manage check ${suffix}`;
  const renamed = `E2E renamed ${suffix}`;

  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({ user_id: profile.id, title })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    throw new Error(`Failed to seed a conversation: ${conversationError?.message}`);
  }
  const conversationId = conversation.id as string;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_MANAGE_TEST_EMAIL);
    await page.getByLabel("Password").fill(E2E_MANAGE_TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

    await page.goto("/history");

    // Search narrows the list to just this conversation.
    await page.getByRole("searchbox", { name: "Search conversations" }).fill(suffix);
    const list = page.getByRole("list", { name: "Study sessions" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list.getByRole("link", { name: new RegExp(title) })).toBeVisible();

    // Rename.
    const row = list.getByRole("listitem").first();
    await row.hover();
    await row.getByRole("button", { name: "Rename conversation" }).click();
    const input = page.getByRole("textbox", { name: "Conversation title" });
    await input.fill(renamed);
    await input.press("Enter");
    await expect(list.getByRole("link", { name: new RegExp(renamed) })).toBeVisible();

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("conversations")
          .select("title")
          .eq("id", conversationId)
          .single();
        return data?.title;
      })
      .toBe(renamed);

    // The rename survives a reload — it's really saved, not just local state.
    await page.reload();
    await page.getByRole("searchbox", { name: "Search conversations" }).fill(suffix);
    await expect(list.getByRole("link", { name: new RegExp(renamed) })).toBeVisible();

    // Delete, through the confirmation dialog.
    await list.getByRole("listitem").first().hover();
    await list.getByRole("button", { name: "Delete conversation" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this conversation?" });
    await expect(dialog).toContainText(renamed);
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("link", { name: new RegExp(renamed) })).toHaveCount(0);
    await expect
      .poll(async () => {
        const { data } = await admin.from("conversations").select("id").eq("id", conversationId);
        return data?.length;
      })
      .toBe(0);
  } finally {
    // Leaves nothing behind if an assertion above failed before the delete.
    await admin.from("conversations").delete().eq("id", conversationId);
  }
});

import { randomUUID } from "node:crypto";
import { test, expect, type Route } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  E2E_WORKSPACE_TEST_EMAIL,
  E2E_WORKSPACE_TEST_PASSWORD,
} from "./global-setup";

// Its own dedicated account — see global-setup.ts's comment for why a
// Recent-Chats-listing test can't share an account with anything else that
// writes conversations concurrently.
test.use({ storageState: { cookies: [], origins: [] } });

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

function sseBody(chunks: object[]): string {
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

async function fulfillAssistantReply(route: Route, text: string) {
  const textId = "text-1";
  await route.fulfill({
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body: sseBody([
      { type: "start" },
      { type: "start-step" },
      { type: "text-start", id: textId },
      { type: "text-delta", id: textId, delta: text },
      { type: "text-end", id: textId },
      { type: "finish-step" },
      { type: "finish" },
    ]),
  });
}

async function seedConversation(
  admin: ReturnType<typeof createTestAdminClient>,
  userId: string,
  title: string,
) {
  const { data: conversation, error: conversationError } = await admin
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id")
    .single();
  if (conversationError || !conversation) {
    throw new Error(`Failed to seed a conversation: ${conversationError?.message}`);
  }
  const conversationId = conversation.id as string;

  const userText = "What causes the seasons?";
  const assistantText =
    "Earth's axial tilt changes how directly sunlight hits each hemisphere.";
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

  return { conversationId, userText, assistantText };
}

// Serial, not parallel: all three tests share the one dedicated workspace
// account (see global-setup.ts), and logging into the same account from
// several parallel workers at once raced against Supabase's own session/rate
// handling (observed as a login that silently stayed on /login). Nothing
// here is slow enough on its own to need the parallelism.
test.describe.configure({ mode: "serial" });

test.describe("Generate workspace — Resources rename and Recent Chats", () => {
  test("Resources replaces Practice as the visible label, and Recent Chats lists a real conversation", async ({
    page,
  }) => {
    const admin = createTestAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("email", E2E_WORKSPACE_TEST_EMAIL)
      .single();
    if (profileError || !profile) {
      throw new Error(
        `Could not find the seeded E2E test user's profile: ${profileError?.message}`,
      );
    }
    const userId = profile.id as string;
    const title = `E2E workspace check ${randomUUID().slice(0, 8)}`;
    await seedConversation(admin, userId, title);

    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_WORKSPACE_TEST_EMAIL);
    await page.getByLabel("Password").fill(E2E_WORKSPACE_TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

    // "Resources", never the retired "Practice" label.
    await expect(
      page.getByRole("complementary", { name: "Resources" }),
    ).toBeVisible();
    await expect(page.getByText("Practice", { exact: true })).toHaveCount(0);

    const recentChats = page.getByRole("complementary", { name: "Recent chats" });
    await expect(recentChats).toBeVisible();
    // `exact: true` matters here: a loose substring match against "New
    // Chat" can also match a seeded row literally titled "...new chat...".
    await expect(
      recentChats.getByRole("button", { name: "New Chat", exact: true }),
    ).toBeVisible();
    await expect(
      recentChats.getByRole("button", { name: new RegExp(title) }),
    ).toBeVisible();
  });

  test("selecting a Recent Chat loads its messages and updates the URL, without a full navigation", async ({
    page,
  }) => {
    const admin = createTestAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("email", E2E_WORKSPACE_TEST_EMAIL)
      .single();
    if (profileError || !profile) {
      throw new Error(
        `Could not find the seeded E2E test user's profile: ${profileError?.message}`,
      );
    }
    const userId = profile.id as string;
    const title = `E2E workspace select ${randomUUID().slice(0, 8)}`;
    const { conversationId, userText, assistantText } = await seedConversation(
      admin,
      userId,
      title,
    );

    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_WORKSPACE_TEST_EMAIL);
    await page.getByLabel("Password").fill(E2E_WORKSPACE_TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

    // Starts on a fresh, empty conversation — the seeded one hasn't been
    // selected yet.
    await expect(
      page.getByRole("heading", { name: "What are you studying today?" }),
    ).toBeVisible();

    const recentChats = page.getByRole("complementary", { name: "Recent chats" });
    await recentChats.getByRole("button", { name: new RegExp(title) }).click();

    // Generous timeouts: this is a real (non-mocked) round trip through
    // /api/conversations/[id] to Supabase, same as generate-persistence.spec.ts's
    // real-DB polls.
    await expect(page).toHaveURL(
      new RegExp(`conversationId=${conversationId}`),
      { timeout: 15_000 },
    );
    await expect(page.getByText(userText)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(assistantText)).toBeVisible();
  });

  test("New Chat clears the composer back to a fresh, empty conversation", async ({
    page,
  }) => {
    await page.route("**/api/chat", async (route) => {
      await fulfillAssistantReply(route, "Newton's laws describe motion and force.");
    });

    const admin = createTestAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("email", E2E_WORKSPACE_TEST_EMAIL)
      .single();
    if (profileError || !profile) {
      throw new Error(
        `Could not find the seeded E2E test user's profile: ${profileError?.message}`,
      );
    }
    const userId = profile.id as string;
    const title = `E2E workspace new chat ${randomUUID().slice(0, 8)}`;
    await seedConversation(admin, userId, title);

    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_WORKSPACE_TEST_EMAIL);
    await page.getByLabel("Password").fill(E2E_WORKSPACE_TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });

    // Land on the seeded conversation first (via Recent Chats, same as the
    // previous test), so there's something for New Chat to actually clear.
    const recentChats = page.getByRole("complementary", { name: "Recent chats" });
    await recentChats.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByText("What causes the seasons?")).toBeVisible({
      timeout: 15_000,
    });

    await recentChats
      .getByRole("button", { name: "New Chat", exact: true })
      .click();

    await expect(page).toHaveURL(/\/generate$/);
    await expect(
      page.getByRole("heading", { name: "What are you studying today?" }),
    ).toBeVisible();
    await expect(page.getByText("What causes the seasons?")).toHaveCount(0);
  });
});

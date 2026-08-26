import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Seeded once, idempotently, pre-verified so tests never need a real inbox.
// Not a real secret. The account behind the default storageState every
// test starts with.
export const E2E_TEST_EMAIL = "lumora-e2e-test@example.com";
export const E2E_TEST_PASSWORD = "Lumora-E2E-Test-Password-1!";

// Dedicated account for generate-persistence.spec.ts: auth.spec.ts's "log
// out" test calls Supabase's signOut() with global scope on the shared
// account above, which would revoke a concurrently-running persistence
// test's session under Playwright's parallel workers.
export const E2E_PERSISTENCE_TEST_EMAIL =
  "lumora-e2e-persistence-test@example.com";
export const E2E_PERSISTENCE_TEST_PASSWORD =
  "Lumora-E2E-Persistence-Test-Password-1!";

// Dedicated account for history.spec.ts: it asserts on an exact
// conversation count for its account, which would race with any other
// concurrently-running spec writing to the same one.
export const E2E_HISTORY_TEST_EMAIL = "lumora-e2e-history-test@example.com";
export const E2E_HISTORY_TEST_PASSWORD = "Lumora-E2E-History-Test-Password-1!";

// Dedicated account for generate-workspace.spec.ts — same reasoning as the
// history account: it asserts on Recent Chats' exact contents.
export const E2E_WORKSPACE_TEST_EMAIL =
  "lumora-e2e-workspace-test@example.com";
export const E2E_WORKSPACE_TEST_PASSWORD =
  "Lumora-E2E-Workspace-Test-Password-1!";

// Dedicated account for auth.spec.ts's "log out" test, which calls
// Supabase's signOut() with global scope — running that against the shared
// default account would revoke every other spec's session too.
export const E2E_LOGOUT_TEST_EMAIL = "lumora-e2e-logout-test@example.com";
export const E2E_LOGOUT_TEST_PASSWORD = "Lumora-E2E-Logout-Test-Password-1!";

export const AUTH_STATE_PATH = resolve(__dirname, ".auth", "user.json");

// Playwright's own process doesn't inherit `.env.local` the way the
// `webServer` child (next dev) does — load it by hand rather than adding
// `dotenv` for one script.
function loadEnvLocal() {
  const path = resolve(__dirname, "..", ".env.local");
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// Built inline rather than importing lib/supabase/admin.ts, whose Database
// generic pulls in the `ai` package purely for typing — irrelevant to the
// one untyped auth.admin.* call this script makes.
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set (in .env.local) to run the E2E suite.",
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function ensureUserExists(email: string, password: string) {
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error && error.code !== "email_exists") {
    throw new Error(`Failed to seed the E2E test user ${email}: ${error.message}`);
  }
}

export default async function globalSetup(config: FullConfig) {
  loadEnvLocal();
  await ensureUserExists(E2E_TEST_EMAIL, E2E_TEST_PASSWORD);
  await ensureUserExists(E2E_PERSISTENCE_TEST_EMAIL, E2E_PERSISTENCE_TEST_PASSWORD);
  await ensureUserExists(E2E_HISTORY_TEST_EMAIL, E2E_HISTORY_TEST_PASSWORD);
  await ensureUserExists(E2E_WORKSPACE_TEST_EMAIL, E2E_WORKSPACE_TEST_PASSWORD);
  await ensureUserExists(E2E_LOGOUT_TEST_EMAIL, E2E_LOGOUT_TEST_PASSWORD);

  const baseURL =
    config.projects[0]?.use?.baseURL ?? "http://localhost:3100";

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Email").fill(E2E_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(`${baseURL}/generate`);

  await page.context().storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}

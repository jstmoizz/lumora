import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Seeded once (idempotently — `email_exists` from a prior run is fine) via
// Supabase's Admin API with `email_confirm: true`, so it's pre-verified and
// E2E tests never need a real inbox. Not a real secret — it exists only to
// exercise the login flow for tests against protected routes. This is the
// account behind the default `storageState` every test starts with.
export const E2E_TEST_EMAIL = "lumora-e2e-test@example.com";
export const E2E_TEST_PASSWORD = "Lumora-E2E-Test-Password-1!";

// A second, separate account used only by
// generate-persistence.spec.ts. That test makes real, authenticated
// requests to /api/chat and checks the database via Supabase Auth session
// state — it needs a session no *other* concurrently-running test can
// invalidate. Supabase's `signOut()` defaults to scope "global" (all
// sessions for that user, everywhere), and auth.spec.ts's "log out" test
// does call it on the shared account above; under Playwright's parallel
// workers, that can race with and revoke a persistence-test session using
// the same account. A dedicated account sidesteps that entirely rather
// than depending on test execution order.
export const E2E_PERSISTENCE_TEST_EMAIL =
  "lumora-e2e-persistence-test@example.com";
export const E2E_PERSISTENCE_TEST_PASSWORD =
  "Lumora-E2E-Persistence-Test-Password-1!";

// A third account, used only by history.spec.ts. It was originally going
// to reuse the persistence account above, but that test asserts on an
// *exact* conversation count for its account (`countBefore + 1`) — since
// history.spec.ts also writes a conversation for whichever account it
// uses, and Playwright runs both spec files' tests concurrently, sharing
// an account made the two tests race on that count. Same lesson as the
// persistence account's own split from the shared one above: a real-write
// test needs an account nothing else concurrently writes to.
export const E2E_HISTORY_TEST_EMAIL = "lumora-e2e-history-test@example.com";
export const E2E_HISTORY_TEST_PASSWORD = "Lumora-E2E-History-Test-Password-1!";

export const AUTH_STATE_PATH = resolve(__dirname, ".auth", "user.json");

// Playwright's own process (unlike the `webServer` child process, which runs
// `next dev` and loads `.env.local` itself) doesn't inherit `.env.local` —
// load it the same minimal, dependency-free way used elsewhere in this
// project rather than adding `dotenv` just for this one script.
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

// Builds the admin client inline rather than importing
// `lib/supabase/admin.ts`: that module's `Database` generic pulls in
// `lib/ai/tools.ts` (and, through it, the `ai` package) purely for typing —
// irrelevant to the one untyped `auth.admin.*` call this script makes — and
// Playwright's TS loader only reliably transforms files it discovers
// statically from `playwright.config.ts`, not an arbitrarily deep app
// import graph reached via dynamic `import()` at runtime.
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

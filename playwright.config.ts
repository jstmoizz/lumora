import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE_PATH } from "./e2e/global-setup";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Several specs (auth.spec.ts, explore.spec.ts, expanded-concepts.spec.ts)
  // do a real Supabase sign-in per test rather than reusing the shared
  // storageState. Left uncapped, Playwright's default worker count tracks
  // local CPU count — on a many-core machine that's enough concurrent real
  // logins to trip Supabase Auth's own rate limiting, which just leaves the
  // page stuck on /login with no app-level error. Capping it keeps
  // concurrent real logins within what Supabase actually tolerates, in both
  // CI (already effectively 2 workers on GitHub's runners) and locally.
  workers: process.env.CI ? 2 : 4,
  // "github" alone annotates the run but writes no report to disk — the
  // CI workflow's artifact-upload step needs the "html" reporter's output
  // in `playwright-report/` to actually have something to upload.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Seeds a pre-verified test account and signs it in once (see
  // e2e/global-setup.ts), saving the session so every test starts already
  // authenticated — /generate, /history, /explore, and /settings all
  // require a signed-in user now. Tests that specifically need to be
  // signed OUT (e2e/auth.spec.ts) override this per-test with
  // `test.use({ storageState: { cookies: [], origins: [] } })`.
  globalSetup: "./e2e/global-setup",
  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: AUTH_STATE_PATH,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

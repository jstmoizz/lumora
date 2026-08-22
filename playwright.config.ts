import { defineConfig, devices } from "@playwright/test";
import { AUTH_STATE_PATH } from "./e2e/global-setup";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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

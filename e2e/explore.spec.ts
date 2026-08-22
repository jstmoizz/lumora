import { test, expect, type Page } from "@playwright/test";
import { E2E_HISTORY_TEST_EMAIL, E2E_HISTORY_TEST_PASSWORD } from "./global-setup";

// Uses the dedicated history-test account (otherwise only used by
// history.spec.ts, which never touches /explore or topic_progress) rather
// than the default shared account. These tests used to rely on the default
// storageState and were flaky for the same reason documented in
// topic-progress.spec.ts and settings.spec.ts: auth.spec.ts's "log out"
// test calls Supabase's signOut() with its default global scope against
// the default account, which can revoke this test's session mid-run on a
// concurrent worker. That race went from "rare" to "reliably reproduced" as
// Phase 4.2/4.3 added more e2e specs and stretched the suite's total
// runtime — fixed here using the same established pattern the other
// specs already use, not a change to any of the actual assertions below.
test.use({ storageState: { cookies: [], origins: [] } });

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_HISTORY_TEST_EMAIL);
  await page.getByLabel("Password").fill(E2E_HISTORY_TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });
}

test("primary flow: select a topic, read its panel, return to overview", async ({
  page,
}) => {
  await login(page);
  await page.goto("/explore");

  await expect(
    page.getByRole("heading", { name: "Explore your knowledge space" }),
  ).toBeVisible();

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  await expect(topics).toBeVisible();

  const algorithmsButton = topics.getByRole("button", { name: "Algorithms" });
  await expect(algorithmsButton).toBeVisible();
  await algorithmsButton.click();

  const panel = page.getByRole("region", { name: "Algorithms details" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Algorithms" }),
  ).toBeVisible();

  await panel.getByRole("button", { name: "Back to overview" }).click();
  await expect(panel).not.toBeVisible();
});

test("keyboard: a topic button can be reached and activated without a mouse", async ({
  page,
}) => {
  await login(page);
  await page.goto("/explore");

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  const mathButton = topics.getByRole("button", { name: "Mathematics" });

  await mathButton.focus();
  await expect(mathButton).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(
    page.getByRole("region", { name: "Mathematics details" }),
  ).toBeVisible();
});

test("reduced motion: the static knowledge space is shown and stays interactive", async ({
  page,
}) => {
  await login(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/explore");

  const topics = page.getByRole("navigation", { name: "Knowledge topics" });
  const networksButton = topics.getByRole("button", { name: "Networks" });
  await expect(networksButton).toBeVisible();
  await networksButton.click();

  await expect(
    page.getByRole("region", { name: "Networks details" }),
  ).toBeVisible();
});

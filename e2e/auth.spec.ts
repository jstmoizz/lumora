import { test, expect } from "@playwright/test";
import { E2E_TEST_EMAIL, E2E_TEST_PASSWORD } from "./global-setup";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visiting a protected route redirects to /login with redirectTo set", async ({
    page,
  }) => {
    await page.goto("/generate");
    await expect(page).toHaveURL(/\/login\?redirectTo=/);
  });

  test("public routes stay accessible without signing in", async ({ page }) => {
    await page.goto("/about");
    await expect(
      page.getByRole("heading", { name: "About Lumora" }),
    ).toBeVisible();
  });

  test("logging in returns the user to the originally requested protected route", async ({
    page,
  }) => {
    await page.goto("/generate");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel("Email").fill(E2E_TEST_EMAIL);
    await page.getByLabel("Password").fill(E2E_TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();

    // A real Supabase sign-in round-trip, not a mocked route — give it more
    // room than the default 5s before treating it as failed.
    await expect(page).toHaveURL(/\/generate$/, { timeout: 15_000 });
  });

  test("wrong password shows an error without revealing whether the account exists", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_TEST_EMAIL);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();

    // Scoped by id, not `getByRole("alert")` — Next's own route-change
    // announcer (`#__next-route-announcer__`) also carries `role="alert"`
    // and would otherwise make this locator ambiguous.
    await expect(page.locator("#login-error")).toHaveText(
      "Invalid email or password.",
      { timeout: 15_000 },
    );
  });
});

test.describe("signed in", () => {
  test("navigating to /login while already signed in redirects into the app", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/generate$/, { timeout: 10_000 });
  });

  test("the nav shows the signed-in email and a working log out control", async ({
    page,
  }) => {
    await page.goto("/settings");
    // Scoped to the header — Settings' own new Account section also shows
    // the email, which would otherwise make this locator ambiguous.
    await expect(
      page.locator("header").getByText(E2E_TEST_EMAIL, { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/generate");
    await expect(page).toHaveURL(/\/login/);
  });
});

import { test, expect } from "@playwright/test";

test("primary flow: select a topic, read its panel, return to overview", async ({
  page,
}) => {
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

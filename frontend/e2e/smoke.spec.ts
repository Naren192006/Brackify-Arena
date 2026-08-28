import { expect, test } from "@playwright/test";

test("homepage and tournament discovery are reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Browse Tournaments" })).toBeVisible();
  await page.goto("/tournaments");
  await expect(page.getByRole("heading", { name: "Tournaments" })).toBeVisible();
});

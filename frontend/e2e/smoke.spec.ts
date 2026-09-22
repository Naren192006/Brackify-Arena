import { expect, test } from "@playwright/test";

test("homepage and tournament discovery are reachable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Browse Tournaments" })).toBeVisible();
  await page.goto("/tournaments");
  await expect(page.getByRole("heading", { name: "Tournaments", level: 1 })).toBeVisible();
});

test("guest auth pages render with working cross-links", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /welcome to brackify arena/i })).toBeVisible();

  const forgot = page.getByRole("link", { name: /forgot password/i });
  await expect(forgot).toBeVisible();
  await forgot.click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
});

test("password reset flow: request shows confirmation, confirm validates input", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel(/email/i).fill("e2e-reset@example.com");
  await page.getByRole("button", { name: /send reset link/i }).click();
  // Request goes to the live Render API — a cold instance can take a while.
  await expect(page.getByText(/if an account exists/i)).toBeVisible({ timeout: 30_000 });

  await page.goto("/reset-password?token=not-a-real-token");
  await page.getByLabel(/^new password$/i).fill("E2eReset#2026x");
  await page.getByLabel(/confirm new password/i).fill("E2eReset#2026x");
  await page.getByRole("button", { name: /update password/i }).click();
  await expect(page.getByText(/invalid|expired|failed|unable/i).first()).toBeVisible({ timeout: 30_000 });
});

test("register form blocks submission without consents", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByText(/at least 13 years old/i)).toBeVisible();

  await page.getByLabel(/email/i).fill("e2e-consent@example.com");
  await page.getByLabel(/^username/i).fill("e2econsent");
  await page.getByLabel(/^password/i).fill("E2eConsent#2026x");
  await page.getByRole("button", { name: /create account/i }).click();

  // With nothing ticked, the ToS gate fires first…
  await expect(page.getByText(/must agree to the terms/i)).toBeVisible();

  // …then, with ToS ticked but age not, the age gate fires.
  await page.getByLabel(/i agree to the terms/i).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/confirm the age requirement/i)).toBeVisible();
});

test("legal and SEO pages are reachable", async ({ page }) => {
  for (const path of ["/terms", "/privacy", "/cookies", "/refunds", "/data-deletion", "/conduct"]) {
    const res = await page.goto(path);
    expect(res?.status(), `GET ${path}`).toBeLessThan(400);
  }
});

test("404 page is branded with recovery links", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByText(/this map doesn't exist/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
});

test("sitemap and robots are served", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("<urlset");
});

test("web manifest is served with icons", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { name?: string; icons?: unknown[] };
  expect(body.name).toBe("Brackify Arena");
  expect((body.icons ?? []).length).toBeGreaterThan(0);
});

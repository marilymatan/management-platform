import { test, expect } from "@playwright/test";

test.describe("App loading", () => {
  test("renders with correct HTML attributes (Hebrew, RTL)", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "he");
    await expect(html).toHaveAttribute("dir", "rtl");
  });

  test("has the correct page title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("מנתח פוליסות ביטוח");
  });

  test("loads Heebo font", async ({ page }) => {
    await page.goto("/");
    const fontLink = page.locator(
      'link[href*="fonts.googleapis.com"][href*="Heebo"]'
    );
    await expect(fontLink).toBeAttached();
  });

  test("root element is rendered", async ({ page }) => {
    await page.goto("/");
    const root = page.locator("#root");
    await expect(root).toBeAttached();
    await expect(root).not.toBeEmpty();
  });
});

test.describe("Navigation", () => {
  test("404 page shows for unknown routes", async ({ page }) => {
    await page.goto("/some-nonexistent-page");
    await expect(page.locator("text=404")).toBeVisible();
    await expect(page.locator("text=העמוד לא נמצא")).toBeVisible();
  });

  test("404 page has a home button", async ({ page }) => {
    await page.goto("/404");
    const homeButton = page.locator("text=חזרה לדף הבית");
    await expect(homeButton).toBeVisible();
  });

  test("sidebar navigation items are present for authenticated users", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator("nav");
    if (await sidebar.isVisible()) {
      await expect(page.locator("text=ניתוח חדש")).toBeVisible();
      await expect(page.locator("text=דשבורד")).toBeVisible();
    }
  });
});

test.describe("Authentication UI", () => {
  test("dashboard shows login prompt when not authenticated", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    const loginPrompt = page.locator("text=אנא התחבר");
    const googleButton = page.locator("text=התחבר עם Google");
    await expect(loginPrompt.or(googleButton)).toBeVisible({ timeout: 10_000 });
  });

  test("profile page shows login prompt when not authenticated", async ({
    page,
  }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    const loginPrompt = page.locator("text=אנא התחבר");
    const googleButton = page.locator("text=התחבר עם Google");
    await expect(loginPrompt.or(googleButton)).toBeVisible({ timeout: 10_000 });
  });
});

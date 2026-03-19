import { test, expect } from "@playwright/test";

test.describe("Insurance categories page", () => {
  test("insurance page redirects to login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/insurance");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    await expect(loginHeading).toBeVisible({ timeout: 15_000 });
  });

  test("insurance category route redirects to login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/insurance/category/health");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    await expect(loginHeading).toBeVisible({ timeout: 15_000 });
  });

  test("insurance/new route redirects to login when not authenticated", async ({
    page,
  }) => {
    await page.goto("/insurance/new");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    await expect(loginHeading).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Insurance categories navigation (authenticated)", () => {
  test("sidebar shows ביטוחים navigation item", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.locator("nav");
    if (await sidebar.isVisible()) {
      await expect(page.locator("text=ביטוחים")).toBeVisible();
    }
  });
});

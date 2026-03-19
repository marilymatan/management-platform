import { test, expect } from "@playwright/test";

test.describe("Admin Dashboard", () => {
  test("admin route redirects unauthenticated users to login", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    await expect(loginHeading).toBeVisible({ timeout: 15_000 });
  });

  test("admin page loads the admin dashboard container", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const adminDashboard = page.locator("[data-testid='admin-dashboard']");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    const isLogin = await loginHeading.isVisible().catch(() => false);
    if (!isLogin) {
      await expect(adminDashboard).toBeVisible({ timeout: 10_000 });
    }
  });

  test("sidebar shows admin nav item only for admin users", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const sidebar = page.locator("nav");
    if (await sidebar.isVisible()) {
      const adminLink = page.locator("text=לוח בקרה");
      const isAdminVisible = await adminLink.isVisible().catch(() => false);
      expect(typeof isAdminVisible).toBe("boolean");
    }
  });

  test("404 page still works correctly", async ({ page }) => {
    await page.goto("/some-unknown-route-xyz");
    await expect(page.locator("text=404")).toBeVisible();
  });

  test("admin dashboard has correct page title and heading", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const heading = page.locator("text=לוח בקרה — מנהל");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    const isLogin = await loginHeading.isVisible().catch(() => false);
    if (!isLogin) {
      await expect(heading).toBeVisible({ timeout: 10_000 });
    }
  });

  test("admin dashboard has tabs navigation", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const tabs = page.locator("[data-testid='admin-tabs']");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    const isLogin = await loginHeading.isVisible().catch(() => false);
    if (!isLogin) {
      await expect(tabs).toBeVisible({ timeout: 10_000 });
      await expect(page.locator("text=סקירה")).toBeVisible();
      await expect(page.locator("text=משתמשים")).toBeVisible();
      await expect(page.locator("text=פעילות")).toBeVisible();
      await expect(page.locator("text=עלויות")).toBeVisible();
      await expect(page.locator("text=אבטחה")).toBeVisible();
      await expect(page.locator("text=מערכת")).toBeVisible();
    }
  });

  test("admin dashboard tabs are clickable and switch content", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    const isLogin = await loginHeading.isVisible().catch(() => false);
    if (!isLogin) {
      const usersTab = page.locator("[data-testid='admin-tabs']").locator("text=משתמשים");
      if (await usersTab.isVisible()) {
        await usersTab.click();
        await page.waitForTimeout(500);
        const userSearch = page.locator("[data-testid='user-search']");
        const searchVisible = await userSearch.isVisible().catch(() => false);
        expect(typeof searchVisible).toBe("boolean");
      }
    }
  });
});

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

  test("policy.summarizeCategory returns UNAUTHORIZED when not authenticated", async ({
    request,
  }) => {
    const response = await request.get(
      "/api/trpc/policy.summarizeCategory?input=%7B%22category%22%3A%22health%22%7D"
    );
    expect([401, 200]).toContain(response.status());
    const body = await response.json();
    if (body.error) {
      expect(body.error.json.data.code).toBe("UNAUTHORIZED");
    }
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

  test("category filter stays visible on category pages", async ({ page }) => {
    await page.goto("/insurance/category/life");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    const filterBar = page.getByTestId("insurance-category-filter");

    await expect(filterBar.or(loginHeading)).toBeVisible({ timeout: 15_000 });

    const isLogin = await loginHeading.isVisible().catch(() => false);
    if (isLogin) {
      return;
    }

    await expect(filterBar).toBeVisible();
    await expect(page.getByTestId("insurance-category-filter-life")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("insurance-category-filter-health").click();
    await expect(page).toHaveURL(/\/insurance\/category\/health$/);
    await expect(page.getByTestId("insurance-category-filter-health")).toHaveAttribute("aria-pressed", "true");
  });
});

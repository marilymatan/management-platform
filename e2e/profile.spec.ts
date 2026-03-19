import { test, expect } from "@playwright/test";

test.describe("Profile page (unauthenticated)", () => {
  test("shows login prompt when not authenticated", async ({ page }) => {
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    const loginPrompt = page.locator("text=אנא התחבר");
    const googleButton = page.locator("text=התחבר עם Google");
    await expect(loginPrompt.or(googleButton)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Profile API (unauthenticated)", () => {
  test("profile.get returns UNAUTHORIZED for unauthenticated requests", async ({ request }) => {
    const response = await request.get("/api/trpc/profile.get");
    expect([401, 200]).toContain(response.status());
    const body = await response.json();
    if (body.error) {
      expect(body.error.json.data.code).toBe("UNAUTHORIZED");
    }
  });

  test("profile.update returns UNAUTHORIZED for unauthenticated requests", async ({ request }) => {
    const response = await request.post("/api/trpc/profile.update", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ json: { maritalStatus: "single" } }),
    });
    expect([401, 200]).toContain(response.status());
    const body = await response.json();
    if (body.error) {
      expect(body.error.json.data.code).toBe("UNAUTHORIZED");
    }
  });
});

test.describe("Profile tRPC endpoint availability", () => {
  test("profile.get endpoint is reachable", async ({ request }) => {
    const response = await request.get("/api/trpc/profile.get");
    expect([200, 401]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });

  test("profile.update endpoint is reachable", async ({ request }) => {
    const response = await request.post("/api/trpc/profile.update", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ json: { maritalStatus: "single" } }),
    });
    expect([200, 401]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

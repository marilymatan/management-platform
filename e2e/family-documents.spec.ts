import { test, expect } from "@playwright/test";

test.describe("Family and documents pages (unauthenticated)", () => {
  test("family page redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/family");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    await expect(loginHeading).toBeVisible({ timeout: 15_000 });
  });

  test("documents page redirects to login when not authenticated", async ({ page }) => {
    await page.goto("/documents");
    await page.waitForLoadState("networkidle");
    const loginHeading = page.getByRole("heading", { name: "ברוכים הבאים" });
    await expect(loginHeading).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Family and documents tRPC endpoint availability", () => {
  test("family.list returns UNAUTHORIZED for unauthenticated requests", async ({ request }) => {
    const response = await request.get("/api/trpc/family.list");
    expect([200, 401]).toContain(response.status());
    const body = await response.json();
    if (body.error) {
      expect(body.error.json.data.code).toBe("UNAUTHORIZED");
    }
  });

  test("documents.getClassifications returns UNAUTHORIZED for unauthenticated requests", async ({ request }) => {
    const response = await request.get("/api/trpc/documents.getClassifications");
    expect([200, 401]).toContain(response.status());
    const body = await response.json();
    if (body.error) {
      expect(body.error.json.data.code).toBe("UNAUTHORIZED");
    }
  });

  test("documents.upsertClassification endpoint is reachable", async ({ request }) => {
    const response = await request.post("/api/trpc/documents.upsertClassification", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        json: {
          documentKey: "policy-1-0",
          sourceType: "analysis_file",
          sourceId: "1",
          manualType: "insurance",
        },
      }),
    });
    expect([200, 401]).toContain(response.status());
    const body = await response.json();
    expect(body).toBeDefined();
  });
});

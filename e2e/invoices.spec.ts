import { test, expect } from "@playwright/test";

test.describe("Insurance mail scan page", () => {
  test("renders the new insurance mail scan title or auth prompt", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "סריקת מיילי ביטוח" })).toBeVisible({ timeout: 10_000 });
  });

  test("shows insurance discovery area or a relevant empty state", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");

    const discoverySection = page.getByText("ממצאי ביטוח מהמייל");
    const emptyDiscoveries = page.getByText("עדיין לא זוהו ממצאי ביטוח מהמייל");
    const connectPrompt = page.getByText("חבר את Gmail שלך");
    const loginPrompt = page.getByText("יש להתחבר");
    const loginButton = page.getByText("התחברות עם Google");

    await expect(
      discoverySection.or(emptyDiscoveries).or(connectPrompt).or(loginPrompt).or(loginButton)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("shows insurance mail documents area or a relevant empty state", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");

    const documentsSection = page.getByText("מסמכים ביטוחיים שזוהו במייל");
    const emptyDocuments = page.getByText("עדיין לא נשמרו מסמכים ביטוחיים מהמייל");
    const connectPrompt = page.getByText("חבר את Gmail שלך");
    const loginPrompt = page.getByText("יש להתחבר");
    const loginButton = page.getByText("התחברות עם Google");

    await expect(
      documentsSection.or(emptyDocuments).or(connectPrompt).or(loginPrompt).or(loginButton)
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Insurance mail scan API", () => {
  test("file endpoint rejects unsigned URLs with 403", async ({ request }) => {
    const response = await request.get("/api/files/gmail-invoices/test/invoice.pdf");
    expect(response.status()).toBe(403);
  });

  test("file endpoint rejects expired tokens", async ({ request }) => {
    const response = await request.get(
      "/api/files/gmail-invoices/test/invoice.pdf?token=fakehash&exp=1000000000"
    );
    expect(response.status()).toBe(403);
  });

  test("tRPC getInvoices endpoint is reachable", async ({ request }) => {
    const response = await request.get(
      '/api/trpc/gmail.getInvoices?input=%7B%22limit%22%3A10%7D'
    );
    expect([200, 401]).toContain(response.status());
  });

  test("tRPC getInsuranceDiscoveries endpoint is reachable", async ({ request }) => {
    const response = await request.get(
      '/api/trpc/gmail.getInsuranceDiscoveries?input=%7B%22limit%22%3A10%7D'
    );
    expect([200, 401]).toContain(response.status());
  });
});

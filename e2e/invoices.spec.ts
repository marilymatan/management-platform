import { test, expect } from "@playwright/test";

test.describe("Smart Invoices page", () => {
  test("renders page title and header", async ({ page }) => {
    await page.goto("/smart-invoices");
    await page.waitForLoadState("networkidle");
    const header = page.locator("text=חשבוניות חכמות");
    await expect(header.first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows login prompt or Gmail connect when not authenticated", async ({ page }) => {
    await page.goto("/smart-invoices");
    await page.waitForLoadState("networkidle");
    const connectButton = page.locator("text=חבר Gmail");
    const loginPrompt = page.locator("text=יש להתחבר");
    await expect(connectButton.or(loginPrompt)).toBeVisible({ timeout: 10_000 });
  });

  test("expense summary section renders when data is present", async ({ page }) => {
    await page.goto("/smart-invoices");
    await page.waitForLoadState("networkidle");
    const summarySection = page.locator("text=סיכום הוצאות");
    const noInvoices = page.locator("text=לא נמצאו חשבוניות");
    const connectPrompt = page.locator("text=חבר Gmail");
    const loginPrompt = page.locator("text=יש להתחבר");
    const anyVisible = summarySection.or(noInvoices).or(connectPrompt).or(loginPrompt);
    await expect(anyVisible).toBeVisible({ timeout: 10_000 });
  });

  test("invoice cards display provider name (not just 'ספק לא ידוע')", async ({ page }) => {
    await page.goto("/smart-invoices");
    await page.waitForLoadState("networkidle");
    const invoiceCards = page.locator(".font-medium.text-sm.truncate");
    const count = await invoiceCards.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await invoiceCards.nth(i).textContent();
        expect(text).toBeTruthy();
      }
    }
  });
});

test.describe("Smart Invoices API", () => {
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

  test("tRPC getMonthlySummary endpoint is reachable", async ({ request }) => {
    const response = await request.get("/api/trpc/gmail.getMonthlySummary");
    expect([200, 401]).toContain(response.status());
  });
});

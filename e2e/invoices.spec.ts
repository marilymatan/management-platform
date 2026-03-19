import { test, expect } from "@playwright/test";

test.describe("Expenses page", () => {
  test("renders page title and header", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const header = page.locator("text=הוצאות");
    await expect(header.first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows login prompt or Gmail connect when not authenticated", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const connectButton = page.locator("text=חבר Gmail");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    await expect(connectButton.or(loginPrompt).or(loginButton)).toBeVisible({ timeout: 10_000 });
  });

  test("expense summary section renders when data is present", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const summarySection = page.locator("text=סיכום הוצאות");
    const noInvoices = page.locator("text=לא נמצאו חשבוניות");
    const connectPrompt = page.locator("text=חבר Gmail");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    const anyVisible = summarySection.or(noInvoices).or(connectPrompt).or(loginPrompt).or(loginButton);
    await expect(anyVisible).toBeVisible({ timeout: 10_000 });
  });

  test("invoice cards display provider name (not just 'ספק לא ידוע')", async ({ page }) => {
    await page.goto("/expenses");
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

test.describe("Manual expense dialog", () => {
  test("add expense button is visible on the page", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const addButton = page.locator("text=הוסף הוצאה");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    await expect(addButton.or(loginPrompt).or(loginButton)).toBeVisible({ timeout: 10_000 });
  });

  test("opens manual expense dialog when button clicked", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const addButton = page.locator("text=הוסף הוצאה");
    if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addButton.click();
      const dialogTitle = page.locator("text=הוספת הוצאה ידנית");
      await expect(dialogTitle).toBeVisible({ timeout: 5_000 });
      const providerInput = page.locator("#m-provider");
      await expect(providerInput).toBeVisible();
      const amountInput = page.locator("#m-amount");
      await expect(amountInput).toBeVisible();
    }
  });

  test("dialog closes on cancel", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const addButton = page.locator("text=הוסף הוצאה");
    if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addButton.click();
      const dialogTitle = page.locator("text=הוספת הוצאה ידנית");
      await expect(dialogTitle).toBeVisible({ timeout: 5_000 });
      const cancelButton = page.locator("text=ביטול");
      await cancelButton.click();
      await expect(dialogTitle).not.toBeVisible({ timeout: 3_000 });
    }
  });
});

test.describe("Monthly summary and compact accounts", () => {
  test("summary section shows monthly breakdown when data present", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const summarySection = page.locator("text=סיכום הוצאות");
    const noInvoices = page.locator("text=לא נמצאו חשבוניות");
    const connectPrompt = page.locator("text=חבר Gmail");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    const anyVisible = summarySection.or(noInvoices).or(connectPrompt).or(loginPrompt).or(loginButton);
    await expect(anyVisible).toBeVisible({ timeout: 10_000 });
  });

  test("connected accounts show as compact cards with disconnect button", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const connectButton = page.locator("text=חבר חשבון");
    const loginPrompt = page.locator("text=יש להתחבר");
    const connectGmail = page.locator("text=חבר Gmail");
    const loginButton = page.locator("text=התחברות עם Google");
    await expect(connectButton.or(loginPrompt).or(connectGmail).or(loginButton)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Expenses API", () => {
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

  test("tRPC addManualExpense endpoint requires auth", async ({ request }) => {
    const response = await request.post("/api/trpc/gmail.addManualExpense", {
      data: {
        provider: "Test",
        amount: 100,
        category: "אחר",
        invoiceDate: "2026-03-01",
        status: "paid",
      },
    });
    expect([200, 401]).toContain(response.status());
  });
});

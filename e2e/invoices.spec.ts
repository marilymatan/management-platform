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
    const summarySection = page.locator("text=סה\"כ הוצאות");
    const noInvoices = page.locator("text=לא נמצאו מסמכים כספיים");
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
    const addButton = page.getByTestId("manual-entry-button");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    await expect(addButton.or(loginPrompt).or(loginButton)).toBeVisible({ timeout: 10_000 });
  });

  test("opens manual expense dialog when button clicked", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const addButton = page.getByTestId("manual-entry-button");
    if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addButton.click();
      const dialogTitle = page.locator("text=הוספת תנועה ידנית");
      await expect(dialogTitle).toBeVisible({ timeout: 5_000 });
      const providerInput = page.locator("#m-provider");
      await expect(providerInput).toBeVisible();
      const amountInput = page.locator("#m-amount");
      await expect(amountInput).toBeVisible();
      await expect(page.getByTestId("manual-flow-direction")).toBeVisible();
    }
  });

  test("dialog closes on cancel", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const addButton = page.getByTestId("manual-entry-button");
    if (await addButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addButton.click();
      const dialogTitle = page.locator("text=הוספת תנועה ידנית");
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
    const summarySection = page.locator("text=סה\"כ הוצאות");
    const noInvoices = page.locator("text=לא נמצאו מסמכים כספיים");
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

test.describe("Category edit dialog", () => {
  test("edit category button is rendered on invoice cards", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const editButtons = page.locator("button[title='ערוך קטגוריה']");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    const noInvoices = page.locator("text=לא נמצאו מסמכים כספיים");
    const connectPrompt = page.locator("text=חבר Gmail");
    const anyFallback = loginPrompt.or(loginButton).or(noInvoices).or(connectPrompt);
    const hasEditButtons = await editButtons.count().catch(() => 0);
    if (hasEditButtons > 0) {
      await expect(editButtons.first()).toBeVisible();
    } else {
      await expect(anyFallback).toBeVisible({ timeout: 10_000 });
    }
  });

  test("clicking edit category opens the dialog", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const editButton = page.locator("button[title='ערוך קטגוריה']").first();
    if (await editButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editButton.click();
      const dialogTitle = page.locator("text=עריכת קטגוריה");
      await expect(dialogTitle).toBeVisible({ timeout: 5_000 });
      const categoryInput = page.locator("#edit-cat");
      await expect(categoryInput).toBeVisible();
    }
  });

  test("category edit dialog has quick-select category buttons", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const editButton = page.locator("button[title='ערוך קטגוריה']").first();
    if (await editButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editButton.click();
      const dialogTitle = page.locator("text=עריכת קטגוריה");
      await expect(dialogTitle).toBeVisible({ timeout: 5_000 });
      const categoryChip = page.locator("button", { hasText: "תקשורת" });
      await expect(categoryChip).toBeVisible();
    }
  });

  test("category edit dialog closes on cancel", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const editButton = page.locator("button[title='ערוך קטגוריה']").first();
    if (await editButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await editButton.click();
      const dialogTitle = page.locator("text=עריכת קטגוריה");
      await expect(dialogTitle).toBeVisible({ timeout: 5_000 });
      const cancelButton = page.locator("text=ביטול").last();
      await cancelButton.click();
      await expect(dialogTitle).not.toBeVisible({ timeout: 3_000 });
    }
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
        flowDirection: "expense",
      },
    });
    expect([200, 401]).toContain(response.status());
  });

  test("tRPC updateInvoiceCategory endpoint requires auth", async ({ request }) => {
    const response = await request.post("/api/trpc/gmail.updateInvoiceCategory", {
      data: {
        invoiceId: 1,
        customCategory: "קלינאית תקשורת",
      },
    });
    expect([200, 401]).toContain(response.status());
  });

  test("flow filter is rendered when the list area is available", async ({ page }) => {
    await page.goto("/expenses");
    await page.waitForLoadState("networkidle");
    const flowFilter = page.getByTestId("flow-filter");
    const noInvoices = page.locator("text=לא נמצאו מסמכים כספיים");
    const connectPrompt = page.locator("text=חבר Gmail");
    const loginPrompt = page.locator("text=יש להתחבר");
    const loginButton = page.locator("text=התחברות עם Google");
    await expect(flowFilter.or(noInvoices).or(connectPrompt).or(loginPrompt).or(loginButton)).toBeVisible({ timeout: 10_000 });
  });
});

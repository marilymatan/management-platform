import { test, expect, type Page } from "@playwright/test";
import superjson from "superjson";

const testUser = {
  id: 1,
  name: "מיכל ישראלי",
  email: "michal@example.com",
  role: "user",
};

function createTrpcSuccessResponse(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

async function mockExpensesWithInsuranceDiscoveries(page: Page, discoveries?: unknown[]) {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
    const responses = procedureNames.map((procedureName) => {
      switch (procedureName) {
        case "auth.me":
          return createTrpcSuccessResponse(testUser);
        case "profile.get":
          return createTrpcSuccessResponse({
            businessName: null,
            numberOfChildren: 2,
          });
        case "gmail.connectionStatus":
          return createTrpcSuccessResponse({
            connected: true,
            connections: [
              {
                id: 7,
                email: "michal@gmail.com",
                lastSyncedAt: new Date("2026-03-20T10:00:00.000Z"),
                lastSyncCount: 5,
              },
            ],
          });
        case "gmail.getInvoices":
          return createTrpcSuccessResponse([]);
        case "gmail.getMonthlySummary":
          return createTrpcSuccessResponse([]);
        case "gmail.getAuthUrl":
          return createTrpcSuccessResponse({
            url: "https://accounts.google.com/o/oauth2/auth",
          });
        case "gmail.getInsuranceDiscoveries":
          return createTrpcSuccessResponse(discoveries ?? [
            {
              id: 101,
              provider: "הראל",
              insuranceCategory: "health",
              artifactType: "premium_notice",
              confidence: 0.91,
              premiumAmount: 210,
              policyNumber: "12345",
              documentDate: new Date("2026-03-18T00:00:00.000Z"),
              subject: "עדכון פרמיה לביטוח בריאות",
              summary: "זוהה עדכון פרמיה לביטוח בריאות מהמייל.",
              actionHint: "כדאי לוודא שהחיוב תואם את הפוליסה",
              attachmentFilename: "harel-policy.pdf",
              attachmentUrl: "/api/files/gmail-invoices/1/file.pdf?token=test&exp=9999999999",
              extractedData: null,
            },
          ]);
        default:
          return createTrpcSuccessResponse(null);
      }
    });

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(url.searchParams.get("batch") === "1" ? responses : responses[0]),
    });
  });
}

test.describe("Gmail insurance discovery", () => {
  test("renders insurance discoveries on the expenses page", async ({ page }) => {
    await mockExpensesWithInsuranceDiscoveries(page);
    await page.goto("/expenses");

    await expect(page.getByTestId("insurance-discovery-section")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("ממצאי ביטוח מהמייל")).toBeVisible();
    await expect(page.getByTestId("insurance-discovery-card-101")).toBeVisible();
    await expect(page.getByText("הראל", { exact: true })).toBeVisible();
    await expect(page.getByText("עדכון פרמיה לביטוח בריאות מהמייל.")).toBeVisible();
    await expect(page.getByText("כדאי לוודא שהחיוב תואם את הפוליסה")).toBeVisible();
  });

  test("shows external action guidance when the email only contains a portal link", async ({ page }) => {
    await mockExpensesWithInsuranceDiscoveries(page, [
      {
        id: 202,
        provider: "הפניקס",
        insuranceCategory: "health",
        artifactType: "policy_document",
        confidence: 0.8,
        premiumAmount: null,
        policyNumber: null,
        documentDate: new Date("2026-03-20T00:00:00.000Z"),
        subject: "מסמך חדש ממתין עבורך",
        summary: "זוהה מסמך ביטוחי שמחכה באזור האישי.",
        actionHint: "צריך לפתוח את הקישור מהמייל, להתחבר לאזור האישי ולהוריד PDF כדי שנוכל לנתח.",
        attachmentFilename: null,
        attachmentUrl: null,
        actionUrl: "https://my.fnx.co.il/login?return=document",
        actionLabel: "לצפייה במסמך באפליקציית הפניקס",
        requiresExternalAccess: true,
        externalAccessMode: "portal_login",
        extractedData: null,
      },
    ]);
    await page.goto("/expenses");

    await expect(page.getByText("המסמך נמצא מאחורי אזור אישי או התחברות.")).toBeVisible();
    await expect(page.getByRole("button", { name: "פתח קישור והתחבר" })).toBeVisible();
    await expect(page.getByText("ללא PDF מצורף, זוהה קישור במייל")).toBeVisible();
  });
});

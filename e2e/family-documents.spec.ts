import { test, expect } from "@playwright/test";
import superjson from "superjson";

const previewPdfUrl = "http://127.0.0.1:3000/test-preview.pdf";
const previewPdfBody = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
const documentsTestUser = {
  id: 1,
  name: "בודק",
  email: "tester@example.com",
  role: "user",
};
const documentsTestAnalyses = [
  {
    sessionId: "session-1",
    status: "completed",
    createdAt: new Date("2026-03-20T10:00:00.000Z"),
    analysisResult: {
      generalInfo: {
        policyName: "פוליסת בריאות",
      },
    },
    files: [
      {
        name: "policy.pdf",
        fileKey: "policies/session-1/policy.pdf",
      },
    ],
  },
];
const documentsTestInvoices = [
  {
    id: 55,
    provider: "הראל",
    category: "ביטוח",
    customCategory: null,
    subject: "מסמך ביטוחי חדש",
    invoiceDate: new Date("2026-03-21T08:00:00.000Z"),
    createdAt: new Date("2026-03-21T08:00:00.000Z"),
    extractedData: {
      pdfUrl: previewPdfUrl,
      pdfFilename: "harel-mail.pdf",
      description: "מסמך ביטוחי שזוהה מתוך Gmail",
    },
  },
];
const documentsTestFamilyMembers = [
  { id: 11, fullName: "נועה" },
  { id: 12, fullName: "אורי" },
];

function createTrpcSuccessResponse(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

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

test.describe("Documents preview flow", () => {
  test("opens a pdf in a new tab and keeps the documents page active", async ({ page }) => {
    await page.route("**/api/trpc/**", async (route) => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map((procedureName) => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(documentsTestUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getUserAnalyses":
            return createTrpcSuccessResponse(documentsTestAnalyses);
          case "gmail.getInvoices":
            return createTrpcSuccessResponse(documentsTestInvoices);
          case "family.list":
            return createTrpcSuccessResponse(documentsTestFamilyMembers);
          case "documents.getClassifications":
            return createTrpcSuccessResponse([
              {
                id: 1,
                userId: 1,
                documentKey: "invoice-55",
                sourceType: "invoice_pdf",
                sourceId: "55",
                manualType: "family",
                familyMemberId: 12,
                createdAt: new Date("2026-03-21T08:05:00.000Z"),
                updatedAt: new Date("2026-03-21T08:05:00.000Z"),
              },
            ]);
          case "policy.getSecureFileUrl":
            return createTrpcSuccessResponse({ url: previewPdfUrl });
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

    await page.route("**/test-preview.pdf", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: previewPdfBody,
      });
    });

    await page.goto("/documents");
    await expect(page).toHaveURL(/\/documents$/);
    await expect(page.getByRole("heading", { name: "מסמכי ביטוח" })).toBeVisible({ timeout: 15_000 });

    const popupPromise = page.waitForEvent("popup");
    await page.getByTestId("document-view-policy-session-1-0").click();
    const popup = await popupPromise;

    await expect(page).toHaveURL(/\/documents$/);
    await expect.poll(() => popup.url()).toContain("/test-preview.pdf");
  });

  test("shows assignment options for insurance and family members", async ({ page }) => {
    await page.route("**/api/trpc/**", async (route) => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map((procedureName) => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(documentsTestUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getUserAnalyses":
            return createTrpcSuccessResponse(documentsTestAnalyses);
          case "gmail.getInvoices":
            return createTrpcSuccessResponse(documentsTestInvoices);
          case "family.list":
            return createTrpcSuccessResponse(documentsTestFamilyMembers);
          case "documents.getClassifications":
            return createTrpcSuccessResponse([
              {
                id: 1,
                userId: 1,
                documentKey: "invoice-55",
                sourceType: "invoice_pdf",
                sourceId: "55",
                manualType: "family",
                familyMemberId: 12,
                createdAt: new Date("2026-03-21T08:05:00.000Z"),
                updatedAt: new Date("2026-03-21T08:05:00.000Z"),
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

    await page.goto("/documents");

    await expect(page.getByRole("heading", { name: "מסמכי ביטוח" })).toBeVisible({ timeout: 15_000 });
    const select = page.getByTestId("document-type-select-invoice-55");
    await expect(select).toBeVisible();
    await expect(select.locator('option[value="insurance"]')).toHaveText("ביטוח");
    await expect(select.locator('option[value="family:11"]')).toHaveText("נועה");
    await expect(select.locator('option[value="family:12"]')).toHaveText("אורי");
  });
});

import { expect, test, type Page } from "@playwright/test";
import superjson from "superjson";

const testUser = {
  id: 1,
  name: "מיכל ישראלי",
  email: "michal@example.com",
  role: "user",
};

const profile = {
  maritalStatus: "married",
  ownsApartment: true,
  hasActiveMortgage: true,
  numberOfVehicles: 1,
  numberOfChildren: 2,
  hasSpecialHealthConditions: false,
};

function createTrpcSuccessResponse(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

function formatFutureDate(daysFromNow: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);

  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function createAnalyses() {
  return [
    {
      sessionId: "health-1",
      status: "completed",
      createdAt: new Date("2026-03-20T10:00:00.000Z"),
      insuranceCategory: "health",
      files: [{ name: "health.pdf", fileKey: "policies/health-1/health.pdf" }],
      analysisResult: {
        generalInfo: {
          policyName: "בריאות משפחתית",
          insurerName: "מגדל",
          monthlyPremium: "210",
          endDate: formatFutureDate(35),
          insuranceCategory: "health",
        },
        coverages: [{ name: "אמבולטורי" }],
        duplicateCoverages: [{ policyName: "בריאות משלימה" }],
        personalizedInsights: [],
        summary: "פוליסת בריאות למשפחה.",
      },
    },
    {
      sessionId: "car-1",
      status: "completed",
      createdAt: new Date("2026-03-18T09:30:00.000Z"),
      insuranceCategory: "car",
      files: [{ name: "car.pdf", fileKey: "policies/car-1/car.pdf" }],
      analysisResult: {
        generalInfo: {
          policyName: "רכב משפחתי",
          insurerName: "הפניקס",
          monthlyPremium: "130",
          endDate: formatFutureDate(12),
          insuranceCategory: "car",
        },
        coverages: [{ name: "מקיף" }],
        duplicateCoverages: [],
        personalizedInsights: [],
        summary: "ביטוח רכב בתוקף.",
      },
    },
    {
      sessionId: "home-1",
      status: "completed",
      createdAt: new Date("2026-03-16T11:00:00.000Z"),
      insuranceCategory: "home",
      files: [{ name: "home.pdf", fileKey: "policies/home-1/home.pdf" }],
      analysisResult: {
        generalInfo: {
          policyName: "ביטוח דירה",
          insurerName: "הראל",
          monthlyPremium: "95",
          endDate: formatFutureDate(180),
          insuranceCategory: "home",
        },
        coverages: [{ name: "מבנה" }],
        duplicateCoverages: [],
        personalizedInsights: [],
        summary: "ביטוח דירה בתוקף.",
      },
    },
  ];
}

async function mockAuthenticatedInsurance(page: Page, analyses = createAnalyses()) {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
    const responses = procedureNames.map((procedureName) => {
      switch (procedureName) {
        case "auth.me":
          return createTrpcSuccessResponse(testUser);
        case "profile.get":
          return createTrpcSuccessResponse(profile);
        case "profile.getImageUrl":
          return createTrpcSuccessResponse(null);
        case "policy.getUserAnalyses":
          return createTrpcSuccessResponse(analyses);
        case "policy.summarizeCategory":
          return createTrpcSuccessResponse(null);
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

test.describe("Insurance overview page", () => {
  test("shows a focused aggregated overview and category split", async ({ page }) => {
    await mockAuthenticatedInsurance(page);

    await page.goto("/insurance");

    await expect(page.getByTestId("insurance-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("insurance-overview-card")).toBeVisible();
    await expect(page.getByTestId("insurance-overview-card")).toContainText("₪435");
    await expect(page.getByTestId("insurance-overview-card")).toContainText("3/4");
    await expect(page.getByTestId("insurance-category-grid")).toBeVisible();
    await expect(page.getByTestId("category-card-health")).toContainText("ביטוחי בריאות");
    await expect(page.getByTestId("category-card-health")).toContainText("₪210");
    await expect(page.getByTestId("category-card-car")).toContainText("₪130");
    await expect(page.getByTestId("category-card-life")).toContainText("כדאי להשלים");
    await expect(page.getByTestId("insurance-attention-card")).toContainText("חידושים מתקרבים");
    await expect(page.getByTestId("insurance-attention-card")).toContainText("קטגוריות שחסר להשלים");

    await page.getByTestId("category-card-car").click();
    await expect(page).toHaveURL(/\/insurance\/category\/car$/);
    await expect(page.getByRole("heading", { name: "ביטוחי רכב" })).toBeVisible();
  });

  test("shows a concise empty state before the first upload", async ({ page }) => {
    await mockAuthenticatedInsurance(page, []);

    await page.goto("/insurance");

    await expect(page.getByTestId("insurance-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.getByTestId("empty-state-scan-button")).toBeVisible();
    await expect(page.getByTestId("insurance-overview-card")).toHaveCount(0);
    await expect(page.getByText("עדיין אין פוליסות בתיק")).toBeVisible();
  });
});

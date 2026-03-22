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

function createHealthAnalysisResult() {
  return {
    analysisVersion: 2,
    summary: "פוליסת בריאות למשפחה.",
    requiresReanalysis: false,
    personalizedInsights: [],
    policies: [
      {
        id: "policy-health-primary",
        summary: "פוליסת בריאות למשפחה.",
        sourceFiles: ["health.pdf"],
        generalInfo: {
          policyName: "בריאות משפחתית",
          insurerName: "מגדל",
          policyNumber: "H-100",
          policyType: "ביטוח בריאות",
          insuranceCategory: "health",
          premiumPaymentPeriod: "monthly",
          monthlyPremium: "210",
          annualPremium: "2520",
          startDate: "01/01/2026",
          endDate: formatFutureDate(35),
          importantNotes: [],
          fineprint: [],
        },
        coverages: [
          {
            id: "coverage-health-primary-ambulatory",
            policyId: "policy-health-primary",
            title: "אמבולטורי",
            category: "בריאות",
            summary: "כיסוי לטיפולים ושירותים אמבולטוריים.",
            sourceFile: "health.pdf",
            clauses: [
              {
                id: "clause-health-primary-ambulatory-benefit",
                coverageId: "coverage-health-primary-ambulatory",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי לשירותים אמבולטוריים, בדיקות וטיפולי המשך.",
              },
            ],
          },
        ],
      },
      {
        id: "policy-health-secondary",
        summary: "פוליסה משלימה עם כיסוי אמבולטורי דומה.",
        sourceFiles: ["health.pdf"],
        generalInfo: {
          policyName: "בריאות משלימה",
          insurerName: "מגדל",
          policyNumber: "H-200",
          policyType: "ביטוח בריאות משלים",
          insuranceCategory: "health",
          premiumPaymentPeriod: "monthly",
          monthlyPremium: "145",
          annualPremium: "1740",
          startDate: "01/01/2026",
          endDate: formatFutureDate(35),
          importantNotes: [],
          fineprint: [],
        },
        coverages: [
          {
            id: "coverage-health-secondary-ambulatory",
            policyId: "policy-health-secondary",
            title: "אמבולטורי",
            category: "בריאות",
            summary: "כיסוי נוסף לשירותים אמבולטוריים.",
            sourceFile: "health.pdf",
            clauses: [
              {
                id: "clause-health-secondary-ambulatory-benefit",
                coverageId: "coverage-health-secondary-ambulatory",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי לטיפולים אמבולטוריים במסלול נוסף.",
              },
            ],
          },
        ],
      },
    ],
    coverageOverlapGroups: [
      {
        id: "coverage-overlap-health-ambulatory",
        title: "אמבולטורי",
        coverageRefs: [
          {
            policyId: "policy-health-primary",
            coverageId: "coverage-health-primary-ambulatory",
          },
          {
            policyId: "policy-health-secondary",
            coverageId: "coverage-health-secondary-ambulatory",
          },
        ],
        matchedClauseIdsByCoverage: {
          "coverage-health-primary-ambulatory": ["clause-health-primary-ambulatory-benefit"],
          "coverage-health-secondary-ambulatory": ["clause-health-secondary-ambulatory-benefit"],
        },
        explanation: "נראית חפיפה בין שני כיסויים אמבולטוריים בתיק הבריאות.",
        recommendation: "כדאי להשוות בין שני הכיסויים ולהחליט אם באמת צריך את שניהם.",
      },
    ],
    policyOverlapGroups: [],
    generalInfo: {
      policyName: "בריאות משפחתית",
      policyNames: ["בריאות משפחתית", "בריאות משלימה"],
      insurerName: "מגדל",
      policyNumber: "לא מצוין בפוליסה",
      policyType: "ביטוח בריאות",
      insuranceCategory: "health",
      premiumPaymentPeriod: "monthly",
      monthlyPremium: "355",
      annualPremium: "4260",
      startDate: "01/01/2026",
      endDate: formatFutureDate(35),
      importantNotes: [],
      fineprint: [],
    },
    coverages: [
      {
        id: "coverage-health-primary-ambulatory",
        title: "אמבולטורי",
        category: "בריאות",
        limit: "לא מצוין בפוליסה",
        details: "כיסוי לטיפולים ושירותים אמבולטוריים.",
        eligibility: "לא מצוין בפוליסה",
        copay: "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: "לא מצוין בפוליסה",
        waitingPeriod: "לא מצוין בפוליסה",
        sourceFile: "health.pdf",
        policyId: "policy-health-primary",
        summary: "כיסוי לטיפולים ושירותים אמבולטוריים.",
        clauseIds: ["clause-health-primary-ambulatory-benefit"],
      },
      {
        id: "coverage-health-secondary-ambulatory",
        title: "אמבולטורי",
        category: "בריאות",
        limit: "לא מצוין בפוליסה",
        details: "כיסוי נוסף לשירותים אמבולטוריים.",
        eligibility: "לא מצוין בפוליסה",
        copay: "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: "לא מצוין בפוליסה",
        waitingPeriod: "לא מצוין בפוליסה",
        sourceFile: "health.pdf",
        policyId: "policy-health-secondary",
        summary: "כיסוי נוסף לשירותים אמבולטוריים.",
        clauseIds: ["clause-health-secondary-ambulatory-benefit"],
      },
    ],
    duplicateCoverages: [
      {
        id: "coverage-overlap-health-ambulatory",
        title: "אמבולטורי",
        coverageIds: [
          "coverage-health-primary-ambulatory",
          "coverage-health-secondary-ambulatory",
        ],
        sourceFiles: ["health.pdf"],
        explanation: "נראית חפיפה בין שני כיסויים אמבולטוריים בתיק הבריאות.",
        recommendation: "כדאי להשוות בין שני הכיסויים ולהחליט אם באמת צריך את שניהם.",
      },
    ],
  };
}

function createAnalyses() {
  return [
    {
      sessionId: "health-1",
      status: "completed",
      createdAt: new Date("2026-03-20T10:00:00.000Z"),
      insuranceCategory: "health",
      files: [{ name: "health.pdf", fileKey: "policies/health-1/health.pdf" }],
      analysisResult: createHealthAnalysisResult(),
    },
    {
      sessionId: "car-1",
      status: "completed",
      createdAt: new Date("2026-03-18T09:30:00.000Z"),
      insuranceCategory: "car",
      files: [{ name: "car.pdf", fileKey: "policies/car-1/car.pdf" }],
      analysisResult: {
        analysisVersion: 2,
        generalInfo: {
          policyName: "רכב משפחתי",
          insurerName: "הפניקס",
          policyNumber: "C-100",
          policyType: "ביטוח רכב",
          monthlyPremium: "130",
          annualPremium: "1560",
          startDate: "01/01/2026",
          endDate: formatFutureDate(12),
          insuranceCategory: "car",
          premiumPaymentPeriod: "monthly",
          importantNotes: [],
          fineprint: [],
        },
        policies: [
          {
            id: "policy-car-1",
            summary: "ביטוח רכב בתוקף.",
            sourceFiles: ["car.pdf"],
            generalInfo: {
              policyName: "רכב משפחתי",
              insurerName: "הפניקס",
              policyNumber: "C-100",
              policyType: "ביטוח רכב",
              insuranceCategory: "car",
              premiumPaymentPeriod: "monthly",
              monthlyPremium: "130",
              annualPremium: "1560",
              startDate: "01/01/2026",
              endDate: formatFutureDate(12),
              importantNotes: [],
              fineprint: [],
            },
            coverages: [
              {
                id: "coverage-car-1",
                policyId: "policy-car-1",
                title: "מקיף",
                category: "רכב",
                summary: "כיסוי מקיף לרכב המשפחתי.",
                sourceFile: "car.pdf",
                clauses: [
                  {
                    id: "clause-car-1",
                    coverageId: "coverage-car-1",
                    kind: "benefit_detail",
                    title: "פירוט הכיסוי",
                    text: "כיסוי מקיף לרכב המשפחתי.",
                  },
                ],
              },
            ],
          },
        ],
        coverages: [
          {
            id: "coverage-car-1",
            title: "מקיף",
            category: "רכב",
            limit: "לא מצוין בפוליסה",
            details: "כיסוי מקיף לרכב המשפחתי.",
            eligibility: "לא מצוין בפוליסה",
            copay: "לא מצוין בפוליסה",
            maxReimbursement: "לא מצוין בפוליסה",
            exclusions: "לא מצוין בפוליסה",
            waitingPeriod: "לא מצוין בפוליסה",
            sourceFile: "car.pdf",
            policyId: "policy-car-1",
            summary: "כיסוי מקיף לרכב המשפחתי.",
            clauseIds: ["clause-car-1"],
          },
        ],
        coverageOverlapGroups: [],
        policyOverlapGroups: [],
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
        analysisVersion: 2,
        generalInfo: {
          policyName: "ביטוח דירה",
          insurerName: "הראל",
          policyNumber: "HM-100",
          policyType: "ביטוח דירה",
          monthlyPremium: "95",
          annualPremium: "1140",
          startDate: "01/01/2026",
          endDate: formatFutureDate(180),
          insuranceCategory: "home",
          premiumPaymentPeriod: "monthly",
          importantNotes: [],
          fineprint: [],
        },
        policies: [
          {
            id: "policy-home-1",
            summary: "ביטוח דירה בתוקף.",
            sourceFiles: ["home.pdf"],
            generalInfo: {
              policyName: "ביטוח דירה",
              insurerName: "הראל",
              policyNumber: "HM-100",
              policyType: "ביטוח דירה",
              insuranceCategory: "home",
              premiumPaymentPeriod: "monthly",
              monthlyPremium: "95",
              annualPremium: "1140",
              startDate: "01/01/2026",
              endDate: formatFutureDate(180),
              importantNotes: [],
              fineprint: [],
            },
            coverages: [
              {
                id: "coverage-home-1",
                policyId: "policy-home-1",
                title: "מבנה",
                category: "דירה",
                summary: "כיסוי למבנה הדירה.",
                sourceFile: "home.pdf",
                clauses: [
                  {
                    id: "clause-home-1",
                    coverageId: "coverage-home-1",
                    kind: "benefit_detail",
                    title: "פירוט הכיסוי",
                    text: "כיסוי למבנה הדירה.",
                  },
                ],
              },
            ],
          },
        ],
        coverages: [
          {
            id: "coverage-home-1",
            title: "מבנה",
            category: "דירה",
            limit: "לא מצוין בפוליסה",
            details: "כיסוי למבנה הדירה.",
            eligibility: "לא מצוין בפוליסה",
            copay: "לא מצוין בפוליסה",
            maxReimbursement: "לא מצוין בפוליסה",
            exclusions: "לא מצוין בפוליסה",
            waitingPeriod: "לא מצוין בפוליסה",
            sourceFile: "home.pdf",
            policyId: "policy-home-1",
            summary: "כיסוי למבנה הדירה.",
            clauseIds: ["clause-home-1"],
          },
        ],
        coverageOverlapGroups: [],
        policyOverlapGroups: [],
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
    await expect(page.getByTestId("insurance-overview-card")).toContainText("₪580");
    await expect(page.getByTestId("insurance-overview-card")).toContainText("3/4");
    await expect(page.getByTestId("insurance-category-grid")).toBeVisible();
    await expect(page.getByTestId("category-card-health")).toContainText("ביטוחי בריאות");
    await expect(page.getByTestId("category-card-health")).toContainText("₪355");
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

import { test, expect, type Page } from "@playwright/test";
import superjson from "superjson";

const testUser = {
  id: 1,
  name: "מיכל ישראלי",
  email: "michal@example.com",
  role: "user",
};

const profile = {
  dateOfBirth: "1987-01-12",
  maritalStatus: "married",
  ownsApartment: true,
  hasActiveMortgage: true,
  numberOfVehicles: 1,
  hasSpecialHealthConditions: false,
  employmentStatus: "employee",
};

const members = [
  {
    id: 10,
    fullName: "רן ישראלי",
    relation: "spouse",
    birthDate: "1986-03-10",
    gender: "male",
    allergies: null,
    medicalNotes: null,
    activities: null,
    insuranceNotes: "כדאי לבדוק כיסוי חיים",
    notes: null,
  },
  {
    id: 11,
    fullName: "נועה ישראלי",
    relation: "child",
    birthDate: "2016-07-14",
    gender: "female",
    allergies: "בוטנים",
    medicalNotes: "רגישה בעונת מעבר",
    activities: "חוג שחייה",
    insuranceNotes: null,
    notes: null,
  },
];

const analyses = [
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
        endDate: "10/05/2026",
        insuranceCategory: "health",
      },
      coverages: [{ name: "אמבולטורי" }],
      duplicateCoverages: [{ policyName: "בריאות משלימה" }],
      personalizedInsights: [],
      summary: "פוליסת בריאות למשפחה.",
    },
  },
  {
    sessionId: "home-1",
    status: "completed",
    createdAt: new Date("2026-03-18T09:30:00.000Z"),
    insuranceCategory: "home",
    files: [{ name: "home.pdf", fileKey: "policies/home-1/home.pdf" }],
    analysisResult: {
      generalInfo: {
        policyName: "ביטוח דירה",
        insurerName: "הפניקס",
        monthlyPremium: "95",
        endDate: "15/11/2026",
        insuranceCategory: "home",
      },
      coverages: [{ name: "מבנה" }],
      duplicateCoverages: [],
      personalizedInsights: [],
      summary: "ביטוח דירה בתוקף.",
    },
  },
];

const invoices = [
  {
    id: 1,
    provider: "הראל",
    amount: 210,
    status: "paid",
    invoiceDate: new Date("2026-03-01T00:00:00.000Z"),
    category: "ביטוח",
    flowDirection: "expense",
    extractedData: null,
  },
  {
    id: 2,
    provider: "מגדל",
    amount: 95,
    status: "pending",
    invoiceDate: new Date("2026-03-10T00:00:00.000Z"),
    category: "ביטוח",
    flowDirection: "expense",
    extractedData: null,
  },
];

const monthlySummary = [
  {
    month: "2026-03",
    total: 305,
    expenseTotal: 305,
    categories: [
      {
        category: "ביטוח",
        total: 305,
      },
    ],
  },
];

const insuranceMapSnapshot = {
  householdSize: 3,
  categoriesWithData: 2,
  missingCount: 5,
  reviewCount: 4,
  rows: [
    {
      id: "primary-user",
      fullName: "בעל/ת החשבון",
      relationLabel: "ראש המשפחה",
      hint: "הקשר הראשי של לומי לביטוחים ולמסמכים",
      kind: "primary",
      cells: [
        { category: "health", label: "ביטוחי בריאות", status: "household_covered", summary: "יש מסמך או פוליסה מזוהים בקטגוריית ביטוחי בריאות" },
        { category: "life", label: "ביטוחי חיים", status: "missing", summary: "עדיין לא זוהה מסמך בקטגוריית ביטוחי חיים" },
        { category: "car", label: "ביטוחי רכב", status: "missing", summary: "עדיין לא זוהה מסמך בקטגוריית ביטוחי רכב" },
        { category: "home", label: "ביטוחי דירה", status: "household_covered", summary: "יש מסמך או פוליסה מזוהים בקטגוריית ביטוחי דירה" },
      ],
    },
    {
      id: "member-10",
      fullName: "רן ישראלי",
      relationLabel: "בן/בת זוג",
      hint: "כדאי לבדוק כיסוי חיים",
      kind: "member",
      cells: [
        { category: "health", label: "ביטוחי בריאות", status: "needs_review", summary: "יש מסמכים בקטגוריית ביטוחי בריאות, אבל צריך לוודא את השיוך האישי" },
        { category: "life", label: "ביטוחי חיים", status: "missing", summary: "לא זוהה עדיין מסמך שמאפשר לבדוק את ביטוחי חיים עבור רן ישראלי" },
        { category: "car", label: "ביטוחי רכב", status: "missing", summary: "לא זוהה עדיין מסמך שמאפשר לבדוק את ביטוחי רכב עבור רן ישראלי" },
        { category: "home", label: "ביטוחי דירה", status: "needs_review", summary: "יש מסמכים בקטגוריית ביטוחי דירה, אבל צריך לוודא את השיוך האישי" },
      ],
    },
    {
      id: "member-11",
      fullName: "נועה ישראלי",
      relationLabel: "ילד/ה",
      hint: "גיל 9",
      kind: "member",
      cells: [
        { category: "health", label: "ביטוחי בריאות", status: "needs_review", summary: "יש מסמכים בקטגוריית ביטוחי בריאות, אבל צריך לוודא את השיוך האישי" },
        { category: "life", label: "ביטוחי חיים", status: "missing", summary: "לא זוהה עדיין מסמך שמאפשר לבדוק את ביטוחי חיים עבור נועה ישראלי" },
        { category: "car", label: "ביטוחי רכב", status: "not_relevant", summary: "כרגע לא עולה צורך מובהק בקטגוריה הזאת" },
        { category: "home", label: "ביטוחי דירה", status: "needs_review", summary: "יש מסמכים בקטגוריית ביטוחי דירה, אבל צריך לוודא את השיוך האישי" },
      ],
    },
  ],
};

function createTrpcSuccessResponse(data: unknown) {
  return {
    result: {
      data: superjson.serialize(data),
    },
  };
}

async function mockAuthenticatedApp(page: Page) {
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
        case "gmail.getMonthlySummary":
          return createTrpcSuccessResponse(monthlySummary);
        case "gmail.getInvoices":
          return createTrpcSuccessResponse(invoices);
        case "family.list":
          return createTrpcSuccessResponse(members);
        case "insuranceMap.get":
          return createTrpcSuccessResponse(insuranceMapSnapshot);
        case "gmail.connectionStatus":
          return createTrpcSuccessResponse({
            connected: true,
            email: "michal@gmail.com",
          });
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

test.describe("Insurance command center", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedApp(page);
  });

  test("renders the dashboard as an insurance command center", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("insurance-command-center")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("מרכז הפיקוד הביטוחי של המשפחה")).toBeVisible();
    await expect(page.getByText("תקציר משפחתי")).toBeVisible();
    await expect(page.getByText("פרמיה חודשית מזוהה")).toBeVisible();
    await expect(page.getByText("שיוכים לבדיקה", { exact: true }).first()).toBeVisible();
  });

  test("renders the family coverage map with household statuses", async ({ page }) => {
    await page.goto("/family");
    await expect(page.getByTestId("family-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("coverage-orbit-map")).toBeVisible();
    await expect(page.getByText("בעל/ת החשבון")).toBeVisible();
    await expect(page.getByText("רן ישראלי", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("נועה ישראלי", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("יש כיסוי", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("חסר מידע", { exact: true }).first()).toBeVisible();
  });

  test("renders the dedicated insurance map route with orbital map", async ({ page }) => {
    await page.goto("/insurance-map");
    await expect(page.getByTestId("family-insurance-map-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "תמונה אחת של כל הכיסויים בבית" })).toBeVisible();
    await expect(page.getByTestId("coverage-score-ring")).toBeVisible();
    await expect(page.getByTestId("coverage-orbit-map")).toBeVisible();
    await expect(page.getByText("בעל/ת החשבון")).toBeVisible();
    await expect(page.getByText("רן ישראלי", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("נועה ישראלי", { exact: true }).first()).toBeVisible();
  });
});

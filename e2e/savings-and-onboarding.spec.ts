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

function createTrpcErrorResponse(message: string, path: string) {
  return {
    error: {
      json: {
        message,
        code: -32603,
        data: {
          code: "INTERNAL_SERVER_ERROR",
          httpStatus: 500,
          path,
        },
      },
    },
  };
}

async function mockSavingsCenter(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
    const responses = procedureNames.map((procedureName) => {
      switch (procedureName) {
        case "auth.me":
          return createTrpcSuccessResponse(testUser);
        case "profile.get":
          return createTrpcSuccessResponse({
            maritalStatus: "married",
            numberOfChildren: 2,
            ownsApartment: true,
            hasActiveMortgage: true,
            numberOfVehicles: 1,
            onboardingCompleted: true,
          });
        case "profile.getImageUrl":
          return createTrpcSuccessResponse(null);
        case "savings.getReport":
          return createTrpcSuccessResponse({
            overview: "זוהו 2 הזדמנויות חיסכון עם פוטנציאל חודשי של ₪120.",
            totalMonthlySaving: 120,
            totalAnnualSaving: 1440,
            savedSoFar: 480,
            score: 74,
            totalMonthlySpend: 620,
            policyCount: 2,
            categoriesWithData: ["health", "life"],
            opportunities: [
              {
                id: 11,
                title: "ייתכן כפל כיסוי באמבולטורי",
                description: "יש חפיפה שנראית בין שתי פוליסות בריאות.",
                type: "duplicate",
                priority: "high",
                monthlySaving: 70,
                annualSaving: 840,
                actionSteps: ["לבדוק את שתי הפוליסות", "להחליט אם לצמצם כיסוי כפול"],
                status: "open",
              },
            ],
            actionItems: [
              {
                id: 21,
                title: "בדוק חידוש בהראל",
                description: "נשארו 14 ימים לחידוש.",
                type: "renewal",
                priority: "high",
                potentialSaving: 0,
                instructions: ["לבדוק מחיר מול תנאים קיימים"],
                status: "pending",
              },
            ],
          });
        case "actions.list":
          return createTrpcSuccessResponse([
            {
              id: 21,
              title: "בדוק חידוש בהראל",
              description: "נשארו 14 ימים לחידוש.",
              type: "renewal",
              priority: "high",
              potentialSaving: 0,
              instructions: ["לבדוק מחיר מול תנאים קיימים"],
              status: "pending",
            },
          ]);
        case "monitoring.getMonthlyReport":
          return createTrpcSuccessResponse({
            month: "2026-03",
            scoreAtTime: 74,
            scoreChange: 5,
            summary: "זוהו שינויי חיוב ביטוחיים בחודש מרץ.",
            changes: [
              {
                id: "chg-1",
                type: "amount_change",
                provider: "הראל",
                summary: "החיוב עלה מ-₪210 ל-₪285.",
              },
            ],
            newActions: [
              {
                title: "בדוק עליית חיוב",
                description: "נראה שיש התייקרות שדורשת הסבר.",
                priority: "high",
              },
            ],
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

async function mockSavingsCenterWithoutOpenSignals(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
    const responses = procedureNames.map((procedureName) => {
      switch (procedureName) {
        case "auth.me":
          return createTrpcSuccessResponse(testUser);
        case "profile.get":
          return createTrpcSuccessResponse({
            maritalStatus: "married",
            numberOfChildren: 2,
            ownsApartment: true,
            hasActiveMortgage: true,
            numberOfVehicles: 0,
            onboardingCompleted: true,
          });
        case "profile.getImageUrl":
          return createTrpcSuccessResponse(null);
        case "savings.getReport":
          return createTrpcSuccessResponse({
            overview: "",
            totalMonthlySaving: 0,
            totalAnnualSaving: 0,
            savedSoFar: 0,
            score: 81,
            totalMonthlySpend: 540,
            policyCount: 2,
            categoriesWithData: ["health", "life"],
            opportunities: [],
            actionItems: [],
          });
        case "actions.list":
          return createTrpcSuccessResponse([]);
        case "monitoring.getMonthlyReport":
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

async function mockSavingsCenterWithActionsFailure(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
    const responses = procedureNames.map((procedureName) => {
      switch (procedureName) {
        case "auth.me":
          return createTrpcSuccessResponse(testUser);
        case "profile.get":
          return createTrpcSuccessResponse({
            maritalStatus: "married",
            numberOfChildren: 2,
            ownsApartment: true,
            hasActiveMortgage: true,
            numberOfVehicles: 1,
            onboardingCompleted: true,
          });
        case "profile.getImageUrl":
          return createTrpcSuccessResponse(null);
        case "savings.getReport":
          return createTrpcSuccessResponse({
            overview: "זוהו 2 הזדמנויות חיסכון עם פוטנציאל חודשי של ₪120.",
            totalMonthlySaving: 120,
            totalAnnualSaving: 1440,
            savedSoFar: 480,
            score: 74,
            totalMonthlySpend: 620,
            policyCount: 2,
            categoriesWithData: ["health", "life"],
            opportunities: [
              {
                id: 11,
                title: "ייתכן כפל כיסוי באמבולטורי",
                description: "יש חפיפה שנראית בין שתי פוליסות בריאות.",
                type: "duplicate",
                priority: "high",
                monthlySaving: 70,
                annualSaving: 840,
                actionSteps: ["לבדוק את שתי הפוליסות", "להחליט אם לצמצם כיסוי כפול"],
                status: "open",
              },
            ],
            actionItems: [
              {
                id: 21,
                title: "בדוק חידוש בהראל",
                description: "נשארו 14 ימים לחידוש.",
                type: "renewal",
                priority: "high",
                potentialSaving: 0,
                instructions: ["לבדוק מחיר מול תנאים קיימים"],
                status: "pending",
              },
            ],
          });
        case "actions.list":
          return createTrpcErrorResponse("actions failed", "actions.list");
        case "monitoring.getMonthlyReport":
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

async function mockOnboarding(page: Page) {
  await page.route("**/api/trpc/**", async (route) => {
    const url = new URL(route.request().url());
    const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
    const responses = procedureNames.map((procedureName) => {
      switch (procedureName) {
        case "auth.me":
          return createTrpcSuccessResponse(testUser);
        case "profile.get":
          return createTrpcSuccessResponse({
            maritalStatus: "married",
            numberOfChildren: 1,
            ownsApartment: false,
            hasActiveMortgage: false,
            numberOfVehicles: 0,
            onboardingCompleted: false,
          });
        case "profile.getImageUrl":
          return createTrpcSuccessResponse(null);
        case "policy.getUserAnalyses":
          return createTrpcSuccessResponse([]);
        case "gmail.getMonthlySummary":
          return createTrpcSuccessResponse([]);
        case "gmail.getInvoices":
          return createTrpcSuccessResponse([]);
        case "family.list":
          return createTrpcSuccessResponse([]);
        case "gmail.connectionStatus":
          return createTrpcSuccessResponse({
            connected: true,
            connections: [
              {
                id: 3,
                email: "michal@gmail.com",
              },
            ],
          });
        case "gmail.getInsuranceDiscoveries":
          return createTrpcSuccessResponse([]);
        case "insuranceScore.getDashboard":
          return createTrpcSuccessResponse({
            score: 62,
            breakdown: {},
            totalMonthlySpend: 0,
            potentialSavings: 180,
            topActions: [],
            recentChanges: [],
            upcomingRenewals: [],
          });
        case "savings.getReport":
          return createTrpcSuccessResponse({
            overview: "זוהו הזדמנויות ראשונות לחיסכון.",
            totalMonthlySaving: 180,
            totalAnnualSaving: 2160,
            savedSoFar: 0,
            score: 62,
            totalMonthlySpend: 0,
            opportunities: [],
            actionItems: [],
          });
        case "monitoring.getMonthlyReport":
          return createTrpcSuccessResponse(null);
        case "gmail.getAuthUrl":
          return createTrpcSuccessResponse({
            url: "https://accounts.google.com/o/oauth2/auth",
          });
        case "gmail.discoverPolicies":
          return createTrpcSuccessResponse([]);
        case "gmail.scan":
          return createTrpcSuccessResponse({
            reusedExistingJob: false,
            job: {
              jobId: "scan-job-1",
              status: "pending",
              clearExisting: false,
            },
          });
        case "profile.update":
          return createTrpcSuccessResponse({
            success: true,
            profile: {
              maritalStatus: "married",
              numberOfChildren: 2,
              ownsApartment: true,
              hasActiveMortgage: true,
              numberOfVehicles: 1,
              onboardingCompleted: false,
            },
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

test.describe("Savings and onboarding", () => {
  test("renders the savings center", async ({ page }) => {
    await mockSavingsCenter(page);
    await page.goto("/savings");

    await expect(page.getByTestId("savings-center-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("savings-center-highlight-card")).toBeVisible();
    await expect(page.getByTestId("savings-center-summary-strip")).toBeVisible();
    await expect(page.getByText("איפה אפשר לחסוך ואיזה צעדים עושים עכשיו")).toBeVisible();
    await expect(
      page.getByTestId("savings-center-highlight-card").getByRole("heading", { name: "ייתכן כפל כיסוי באמבולטורי" })
    ).toBeVisible();
    await page.getByRole("tab", { name: "מעקב פעולות" }).click();
    await expect(page.getByTestId("savings-center-actions-summary")).toBeVisible();
    await expect(page.getByLabel("מעקב פעולות").getByText("בדוק חידוש בהראל")).toBeVisible();
    await expect(page.getByText("זוהו שינויי חיוב ביטוחיים בחודש מרץ.")).toBeVisible();
  });

  test("explains when policies exist but there are no open savings signals", async ({ page }) => {
    await mockSavingsCenterWithoutOpenSignals(page);
    await page.goto("/savings");

    await expect(page.getByTestId("savings-center-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("זוהו כבר 2 פוליסות פעילות. המסך הזה מתמלא רק כשיש כפל, פער, חידוש קרוב או שינוי חיוב שמצריך פעולה.")).toBeVisible();
    await expect(page.getByTestId("savings-center-report-empty-with-policies")).toBeVisible();
    await expect(page.getByText("זיהינו כבר 2 פוליסות, אבל אין כרגע הזדמנויות פתוחות")).toBeVisible();
    await expect(page.getByTestId("savings-center-report-empty-with-policies").getByText("ביטוחי בריאות")).toBeVisible();

    await page.getByRole("tab", { name: "מעקב פעולות" }).click();
    await expect(page.getByTestId("savings-center-actions-empty-with-policies")).toBeVisible();
    await expect(page.getByText("כרגע אין משימות פתוחות על הביטוחים שזוהו")).toBeVisible();
  });

  test("keeps the savings center visible when actions refresh fails", async ({ page }) => {
    await mockSavingsCenterWithActionsFailure(page);
    await page.goto("/savings");

    await expect(page.getByTestId("savings-center-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("לא הצלחנו לרענן כרגע את רשימת הפעולות, אז לומי מציגה כאן את נתוני הגיבוי שכבר הופקו בדוח החיסכון.")).toBeVisible();
    await page.getByRole("tab", { name: "מעקב פעולות" }).click();
    await expect(page.getByLabel("מעקב פעולות").getByText("בדוק חידוש בהראל")).toBeVisible();
  });

  test("shows the onboarding wizard for a new user", async ({ page }) => {
    await mockOnboarding(page);
    await page.goto("/");

    await expect(page.getByTestId("onboarding-wizard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("לומי מנהלת את הביטוח המשפחתי שלך")).toBeVisible();

    await page.getByRole("button", { name: "מתחילים" }).click();
    await expect(page.getByText("חיבור Gmail וגילוי אוטומטי")).toBeVisible();

    await page.getByRole("button", { name: "המשך" }).click();
    await expect(page.getByText("פרופיל מהיר")).toBeVisible();

    await page.locator("#onboarding-children").fill("2");
    await page.locator("#onboarding-vehicles").fill("1");
    await page.getByRole("button", { name: "שמור והמשך" }).click();

    await expect(page.getByText("פוליסות שזוהו ב-Gmail")).toBeVisible();
    await page.getByRole("button", { name: "לציון הראשון" }).click();
    await expect(page.getByText("הציון הראשון שלך מוכן")).toBeVisible();
    await expect(page.getByText("62")).toBeVisible();
  });
});

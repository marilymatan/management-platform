import { expect, test } from "@playwright/test";

function createTrpcSuccessResponse(data: unknown) {
  return {
    result: {
      data: {
        json: data,
      },
    },
  };
}

const testUser = {
  id: 1,
  openId: "test-open-id",
  name: "Dana Tester",
  email: "dana@example.com",
  role: "user",
  loginMethod: "google",
  createdAt: new Date().toISOString(),
  lastSignedIn: new Date().toISOString(),
};

const completedAnalysis = {
  sessionId: "session-bg-1",
  files: [{ name: "policy.pdf", size: 1024, fileKey: "policies/session-bg-1/file.pdf" }],
  status: "completed",
  result: {
    coverages: [
      {
        id: "coverage-1",
        title: "ניתוחים פרטיים",
        category: "ניתוח",
        limit: "עד 300,000 ש\"ח",
        details: "כיסוי לניתוחים פרטיים בארץ",
        eligibility: "לכל המבוטחים",
        copay: "250 ש\"ח",
        maxReimbursement: "300,000 ש\"ח",
        exclusions: "ללא החרגות מיוחדות",
        waitingPeriod: "90 יום",
        sourceFile: "policy.pdf",
      },
      {
        id: "coverage-2",
        title: "תרופות מחוץ לסל",
        category: "תרופות",
        limit: "עד 50,000 ש\"ח",
        details: "כיסוי לתרופות שאינן כלולות בסל",
        eligibility: "בכפוף לאישור",
        copay: "100 ש\"ח",
        maxReimbursement: "50,000 ש\"ח",
        exclusions: "תרופות ניסיוניות",
        waitingPeriod: "30 יום",
        sourceFile: "policy.pdf",
      },
    ],
    generalInfo: {
      policyName: "פוליסת בריאות פרימיום",
      insurerName: "חברת הביטוח הטובה",
      policyNumber: "POL-123",
      policyType: "ביטוח בריאות",
      insuranceCategory: "health",
      monthlyPremium: "180 ש\"ח",
      annualPremium: "2,160 ש\"ח",
      startDate: "01/01/2026",
      endDate: "31/12/2026",
      importantNotes: [],
      fineprint: [],
    },
    summary: "זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.",
    duplicateCoverages: [],
    personalizedInsights: [],
  },
  errorMessage: null,
  insuranceCategory: "health",
};

test.describe("Background policy upload", () => {
  test("uploads a policy, shows pending state, and later renders the completed analysis", async ({ page }) => {
    let analysisCallCount = 0;

    await page.route("**/api/policies/upload", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-bg-1",
          files: [{ name: "policy.pdf", size: 1024, fileKey: "policies/session-bg-1/file.pdf" }],
        }),
      });
    });

    await page.route("**/api/trpc/**", async (route) => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map((procedureName) => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(testUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getAnalysis":
            analysisCallCount += 1;
            if (analysisCallCount < 3) {
              return createTrpcSuccessResponse({
                sessionId: "session-bg-1",
                files: [{ name: "policy.pdf", size: 1024, fileKey: "policies/session-bg-1/file.pdf" }],
                status: analysisCallCount === 1 ? "pending" : "processing",
                result: null,
                errorMessage: null,
                insuranceCategory: null,
              });
            }
            return createTrpcSuccessResponse(completedAnalysis);
          case "policy.getChatHistory":
            return createTrpcSuccessResponse([]);
          case "policy.getUserAnalyses":
            return createTrpcSuccessResponse([]);
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

    await page.goto("/insurance/new");
    await expect(page).toHaveURL(/\/insurance\/new$/);

    await page.setInputFiles("#file-input", {
      name: "policy.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"),
    });

    await page.getByTestId("policy-upload-submit").click();

    await expect(page).toHaveURL(/\/insurance\/session-bg-1$/);
    await expect(page.getByTestId("policy-analysis-pending")).toBeVisible();

    await page.reload();

    await expect(page.getByText("זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.")).toBeVisible();
    await expect(page.getByText("ניתוחים פרטיים")).toBeVisible();
  });
});

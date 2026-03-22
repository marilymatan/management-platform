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

function createAnalysisFiles(count: number, sessionId = "session-bg-1") {
  return Array.from({ length: count }, (_, index) => ({
    name: `policy-${index + 1}.pdf`,
    size: 1024 + index,
    fileKey: `policies/${sessionId}/file-${index + 1}.pdf`,
  }));
}

const completedAnalysis = {
  sessionId: "session-bg-1",
  files: createAnalysisFiles(8),
  status: "completed",
  result: {
    analysisVersion: 2,
    policies: [
      {
        id: "policy-bg-1",
        summary: "זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.",
        sourceFiles: ["policy.pdf"],
        generalInfo: {
          policyName: "פוליסת בריאות פרימיום",
          insurerName: "חברת הביטוח הטובה",
          policyNumber: "POL-123",
          policyType: "ביטוח בריאות",
          insuranceCategory: "health",
          premiumPaymentPeriod: "monthly",
          monthlyPremium: '180 ש"ח',
          annualPremium: '2,160 ש"ח',
          startDate: "01/01/2026",
          endDate: "31/12/2026",
          importantNotes: [],
          fineprint: [],
        },
        coverages: [
          {
            id: "coverage-1",
            policyId: "policy-bg-1",
            title: "ניתוחים פרטיים",
            category: "ניתוח",
            summary: "כיסוי לניתוחים פרטיים בארץ",
            sourceFile: "policy.pdf",
            clauses: [
              {
                id: "coverage-1-clause-limit",
                coverageId: "coverage-1",
                kind: "limit",
                title: "מגבלה",
                text: 'עד 300,000 ש"ח',
              },
              {
                id: "coverage-1-clause-benefit",
                coverageId: "coverage-1",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי לניתוחים פרטיים בארץ",
              },
              {
                id: "coverage-1-clause-eligibility",
                coverageId: "coverage-1",
                kind: "eligibility",
                title: "תנאי זכאות",
                text: "לכל המבוטחים",
              },
              {
                id: "coverage-1-clause-copay",
                coverageId: "coverage-1",
                kind: "copay",
                title: "השתתפות עצמית",
                text: '250 ש"ח',
              },
              {
                id: "coverage-1-clause-max-reimbursement",
                coverageId: "coverage-1",
                kind: "max_reimbursement",
                title: "תקרת החזר",
                text: '300,000 ש"ח',
              },
              {
                id: "coverage-1-clause-exclusion",
                coverageId: "coverage-1",
                kind: "exclusion",
                title: "החרגה",
                text: "ללא החרגות מיוחדות",
              },
              {
                id: "coverage-1-clause-waiting-period",
                coverageId: "coverage-1",
                kind: "waiting_period",
                title: "תקופת אכשרה",
                text: "90 יום",
              },
            ],
          },
          {
            id: "coverage-2",
            policyId: "policy-bg-1",
            title: "תרופות מחוץ לסל",
            category: "תרופות",
            summary: "כיסוי לתרופות שאינן כלולות בסל",
            sourceFile: "policy.pdf",
            clauses: [
              {
                id: "coverage-2-clause-limit",
                coverageId: "coverage-2",
                kind: "limit",
                title: "מגבלה",
                text: 'עד 50,000 ש"ח',
              },
              {
                id: "coverage-2-clause-benefit",
                coverageId: "coverage-2",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי לתרופות שאינן כלולות בסל",
              },
              {
                id: "coverage-2-clause-eligibility",
                coverageId: "coverage-2",
                kind: "eligibility",
                title: "תנאי זכאות",
                text: "בכפוף לאישור",
              },
              {
                id: "coverage-2-clause-copay",
                coverageId: "coverage-2",
                kind: "copay",
                title: "השתתפות עצמית",
                text: '100 ש"ח',
              },
              {
                id: "coverage-2-clause-max-reimbursement",
                coverageId: "coverage-2",
                kind: "max_reimbursement",
                title: "תקרת החזר",
                text: '50,000 ש"ח',
              },
              {
                id: "coverage-2-clause-exclusion",
                coverageId: "coverage-2",
                kind: "exclusion",
                title: "החרגה",
                text: "תרופות ניסיוניות",
              },
              {
                id: "coverage-2-clause-waiting-period",
                coverageId: "coverage-2",
                kind: "waiting_period",
                title: "תקופת אכשרה",
                text: "30 יום",
              },
            ],
          },
        ],
      },
    ],
    coverages: [
      {
        id: "coverage-1",
        title: "ניתוחים פרטיים",
        category: "ניתוח",
        limit: 'עד 300,000 ש"ח',
        details: "כיסוי לניתוחים פרטיים בארץ",
        eligibility: "לכל המבוטחים",
        copay: '250 ש"ח',
        maxReimbursement: '300,000 ש"ח',
        exclusions: "ללא החרגות מיוחדות",
        waitingPeriod: "90 יום",
        sourceFile: "policy.pdf",
        policyId: "policy-bg-1",
        summary: "כיסוי לניתוחים פרטיים בארץ",
        clauseIds: [
          "coverage-1-clause-limit",
          "coverage-1-clause-benefit",
          "coverage-1-clause-eligibility",
          "coverage-1-clause-copay",
          "coverage-1-clause-max-reimbursement",
          "coverage-1-clause-exclusion",
          "coverage-1-clause-waiting-period",
        ],
      },
      {
        id: "coverage-2",
        title: "תרופות מחוץ לסל",
        category: "תרופות",
        limit: 'עד 50,000 ש"ח',
        details: "כיסוי לתרופות שאינן כלולות בסל",
        eligibility: "בכפוף לאישור",
        copay: '100 ש"ח',
        maxReimbursement: '50,000 ש"ח',
        exclusions: "תרופות ניסיוניות",
        waitingPeriod: "30 יום",
        sourceFile: "policy.pdf",
        policyId: "policy-bg-1",
        summary: "כיסוי לתרופות שאינן כלולות בסל",
        clauseIds: [
          "coverage-2-clause-limit",
          "coverage-2-clause-benefit",
          "coverage-2-clause-eligibility",
          "coverage-2-clause-copay",
          "coverage-2-clause-max-reimbursement",
          "coverage-2-clause-exclusion",
          "coverage-2-clause-waiting-period",
        ],
      },
    ],
    generalInfo: {
      policyName: "פוליסת בריאות פרימיום",
      insurerName: "חברת הביטוח הטובה",
      policyNumber: "POL-123",
      policyType: "ביטוח בריאות",
      insuranceCategory: "health",
      premiumPaymentPeriod: "monthly",
      monthlyPremium: '180 ש"ח',
      annualPremium: '2,160 ש"ח',
      startDate: "01/01/2026",
      endDate: "31/12/2026",
      importantNotes: [],
      fineprint: [],
    },
    summary: "זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.",
    coverageOverlapGroups: [],
    policyOverlapGroups: [],
    duplicateCoverages: [],
    personalizedInsights: [],
  },
  errorMessage: null,
  insuranceCategory: "health",
};

const legacyCompletedAnalysis = {
  ...completedAnalysis,
  sessionId: "session-legacy-1",
  result: {
    ...completedAnalysis.result,
    requiresReanalysis: true,
  },
};

const overlapCompletedAnalysis = {
  sessionId: "session-overlap-1",
  files: createAnalysisFiles(2, "session-overlap-1"),
  status: "completed",
  result: {
    analysisVersion: 2,
    summary: "לומי זיהה שתי פוליסות בריאות עם חפיפות רחבות בין הכיסויים.",
    personalizedInsights: [],
    policies: [
      {
        id: "policy-overlap-a",
        summary: "פוליסת בריאות בסיסית.",
        sourceFiles: ["policy-a.pdf"],
        generalInfo: {
          policyName: "בריאות בסיסית",
          insurerName: "הראל",
          policyNumber: "OV-100",
          policyType: "ביטוח בריאות",
          insuranceCategory: "health",
          premiumPaymentPeriod: "monthly",
          monthlyPremium: "100",
          annualPremium: "1200",
          startDate: "01/01/2026",
          endDate: "31/12/2026",
          importantNotes: [],
          fineprint: [],
        },
        coverages: [
          {
            id: "coverage-overlap-a-ambulatory",
            policyId: "policy-overlap-a",
            title: "אמבולטורי",
            category: "בריאות",
            summary: "כיסוי אמבולטורי בפוליסה הראשונה.",
            sourceFile: "policy-a.pdf",
            clauses: [
              {
                id: "clause-overlap-a-ambulatory",
                coverageId: "coverage-overlap-a-ambulatory",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי אמבולטורי בפוליסה הראשונה.",
              },
            ],
          },
          {
            id: "coverage-overlap-a-surgeries",
            policyId: "policy-overlap-a",
            title: "ניתוחים פרטיים",
            category: "ניתוח",
            summary: "כיסוי ניתוחים פרטיים בפוליסה הראשונה.",
            sourceFile: "policy-a.pdf",
            clauses: [
              {
                id: "clause-overlap-a-surgeries",
                coverageId: "coverage-overlap-a-surgeries",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי ניתוחים פרטיים בפוליסה הראשונה.",
              },
            ],
          },
        ],
      },
      {
        id: "policy-overlap-b",
        summary: "פוליסת בריאות משלימה.",
        sourceFiles: ["policy-b.pdf"],
        generalInfo: {
          policyName: "בריאות משלימה",
          insurerName: "מגדל",
          policyNumber: "OV-200",
          policyType: "ביטוח בריאות משלים",
          insuranceCategory: "health",
          premiumPaymentPeriod: "monthly",
          monthlyPremium: "180",
          annualPremium: "2160",
          startDate: "01/01/2026",
          endDate: "31/12/2026",
          importantNotes: [],
          fineprint: [],
        },
        coverages: [
          {
            id: "coverage-overlap-b-ambulatory",
            policyId: "policy-overlap-b",
            title: "אמבולטורי",
            category: "בריאות",
            summary: "כיסוי אמבולטורי בפוליסה השנייה.",
            sourceFile: "policy-b.pdf",
            clauses: [
              {
                id: "clause-overlap-b-ambulatory",
                coverageId: "coverage-overlap-b-ambulatory",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי אמבולטורי בפוליסה השנייה.",
              },
            ],
          },
          {
            id: "coverage-overlap-b-surgeries",
            policyId: "policy-overlap-b",
            title: "ניתוחים פרטיים",
            category: "ניתוח",
            summary: "כיסוי ניתוחים פרטיים בפוליסה השנייה.",
            sourceFile: "policy-b.pdf",
            clauses: [
              {
                id: "clause-overlap-b-surgeries",
                coverageId: "coverage-overlap-b-surgeries",
                kind: "benefit_detail",
                title: "פירוט הכיסוי",
                text: "כיסוי ניתוחים פרטיים בפוליסה השנייה.",
              },
            ],
          },
        ],
      },
    ],
    coverageOverlapGroups: [
      {
        id: "coverage-overlap-ambulatory",
        title: "אמבולטורי",
        coverageRefs: [
          {
            policyId: "policy-overlap-a",
            coverageId: "coverage-overlap-a-ambulatory",
          },
          {
            policyId: "policy-overlap-b",
            coverageId: "coverage-overlap-b-ambulatory",
          },
        ],
        matchedClauseIdsByCoverage: {
          "coverage-overlap-a-ambulatory": ["clause-overlap-a-ambulatory"],
          "coverage-overlap-b-ambulatory": ["clause-overlap-b-ambulatory"],
        },
        explanation: "שני הכיסויים האמבולטוריים נראים דומים מאוד בין שתי הפוליסות.",
        recommendation: "כדאי להשוות בין שני הכיסויים האמבולטוריים לפני שמחליטים אם להשאיר את שניהם.",
      },
      {
        id: "coverage-overlap-surgeries",
        title: "ניתוחים פרטיים",
        coverageRefs: [
          {
            policyId: "policy-overlap-a",
            coverageId: "coverage-overlap-a-surgeries",
          },
          {
            policyId: "policy-overlap-b",
            coverageId: "coverage-overlap-b-surgeries",
          },
        ],
        matchedClauseIdsByCoverage: {
          "coverage-overlap-a-surgeries": ["clause-overlap-a-surgeries"],
          "coverage-overlap-b-surgeries": ["clause-overlap-b-surgeries"],
        },
        explanation: "גם כיסויי הניתוחים נראים חופפים בין שתי הפוליסות.",
        recommendation: "כדאי לבדוק אם שתי הפוליסות נדרשות או שאפשר לאחד את ההגנות.",
      },
    ],
    policyOverlapGroups: [
      {
        id: "policy-overlap-health-pair",
        policyIds: ["policy-overlap-a", "policy-overlap-b"],
        coverageOverlapGroupIds: [
          "coverage-overlap-ambulatory",
          "coverage-overlap-surgeries",
        ],
        overlapRatio: 1,
        explanation: "שני כיסויים חופפים מכסים את כל הפוליסה הקטנה יותר, ולכן נראה שיש חפיפה רחבה בין שתי הפוליסות.",
        recommendation: "כדאי להשוות בין שתי הפוליסות ברמת הכיסויים ולהחליט אם צריך את שתיהן.",
      },
    ],
    generalInfo: {
      policyName: "בריאות בסיסית",
      policyNames: ["בריאות בסיסית", "בריאות משלימה"],
      insurerName: "לא מצוין בפוליסה",
      policyNumber: "לא מצוין בפוליסה",
      policyType: "ביטוח בריאות",
      insuranceCategory: "health",
      premiumPaymentPeriod: "monthly",
      monthlyPremium: "280",
      annualPremium: "3360",
      startDate: "01/01/2026",
      endDate: "31/12/2026",
      importantNotes: [],
      fineprint: [],
    },
    coverages: [
      {
        id: "coverage-overlap-a-ambulatory",
        title: "אמבולטורי",
        category: "בריאות",
        limit: "לא מצוין בפוליסה",
        details: "כיסוי אמבולטורי בפוליסה הראשונה.",
        eligibility: "לא מצוין בפוליסה",
        copay: "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: "לא מצוין בפוליסה",
        waitingPeriod: "לא מצוין בפוליסה",
        sourceFile: "policy-a.pdf",
        policyId: "policy-overlap-a",
        summary: "כיסוי אמבולטורי בפוליסה הראשונה.",
        clauseIds: ["clause-overlap-a-ambulatory"],
      },
      {
        id: "coverage-overlap-a-surgeries",
        title: "ניתוחים פרטיים",
        category: "ניתוח",
        limit: "לא מצוין בפוליסה",
        details: "כיסוי ניתוחים פרטיים בפוליסה הראשונה.",
        eligibility: "לא מצוין בפוליסה",
        copay: "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: "לא מצוין בפוליסה",
        waitingPeriod: "לא מצוין בפוליסה",
        sourceFile: "policy-a.pdf",
        policyId: "policy-overlap-a",
        summary: "כיסוי ניתוחים פרטיים בפוליסה הראשונה.",
        clauseIds: ["clause-overlap-a-surgeries"],
      },
      {
        id: "coverage-overlap-b-ambulatory",
        title: "אמבולטורי",
        category: "בריאות",
        limit: "לא מצוין בפוליסה",
        details: "כיסוי אמבולטורי בפוליסה השנייה.",
        eligibility: "לא מצוין בפוליסה",
        copay: "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: "לא מצוין בפוליסה",
        waitingPeriod: "לא מצוין בפוליסה",
        sourceFile: "policy-b.pdf",
        policyId: "policy-overlap-b",
        summary: "כיסוי אמבולטורי בפוליסה השנייה.",
        clauseIds: ["clause-overlap-b-ambulatory"],
      },
      {
        id: "coverage-overlap-b-surgeries",
        title: "ניתוחים פרטיים",
        category: "ניתוח",
        limit: "לא מצוין בפוליסה",
        details: "כיסוי ניתוחים פרטיים בפוליסה השנייה.",
        eligibility: "לא מצוין בפוליסה",
        copay: "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: "לא מצוין בפוליסה",
        waitingPeriod: "לא מצוין בפוליסה",
        sourceFile: "policy-b.pdf",
        policyId: "policy-overlap-b",
        summary: "כיסוי ניתוחים פרטיים בפוליסה השנייה.",
        clauseIds: ["clause-overlap-b-surgeries"],
      },
    ],
    duplicateCoverages: [
      {
        id: "coverage-overlap-ambulatory",
        title: "אמבולטורי",
        coverageIds: [
          "coverage-overlap-a-ambulatory",
          "coverage-overlap-b-ambulatory",
        ],
        sourceFiles: ["policy-a.pdf", "policy-b.pdf"],
        explanation: "שני הכיסויים האמבולטוריים נראים דומים מאוד בין שתי הפוליסות.",
        recommendation: "כדאי להשוות בין שני הכיסויים האמבולטוריים לפני שמחליטים אם להשאיר את שניהם.",
      },
      {
        id: "coverage-overlap-surgeries",
        title: "ניתוחים פרטיים",
        coverageIds: [
          "coverage-overlap-a-surgeries",
          "coverage-overlap-b-surgeries",
        ],
        sourceFiles: ["policy-a.pdf", "policy-b.pdf"],
        explanation: "גם כיסויי הניתוחים נראים חופפים בין שתי הפוליסות.",
        recommendation: "כדאי לבדוק אם שתי הפוליסות נדרשות או שאפשר לאחד את ההגנות.",
      },
    ],
  },
  errorMessage: null,
  insuranceCategory: "health",
};

test.describe("Background policy upload", () => {
  test("kicks a queued analysis and switches from waiting state to active progress", async ({
    page,
  }) => {
    let analysisCallCount = 0;
    let analyzeKickCount = 0;

    await page.route("**/api/policies/upload", async route => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-queued-1",
          files: [
            {
              name: "policy.pdf",
              size: 1024,
              fileKey: "policies/session-queued-1/file.pdf",
            },
          ],
        }),
      });
    });

    await page.route("**/api/trpc/**", async route => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = await Promise.all(
        procedureNames.map(async procedureName => {
          switch (procedureName) {
            case "auth.me":
              return createTrpcSuccessResponse(testUser);
            case "profile.getImageUrl":
              return createTrpcSuccessResponse(null);
            case "policy.analyze":
              analyzeKickCount += 1;
              await new Promise(resolve => setTimeout(resolve, 250));
              return createTrpcSuccessResponse({
                status: "queued",
                result: null,
              });
            case "policy.getAnalysis":
              analysisCallCount += 1;
              if (analyzeKickCount === 0) {
                return createTrpcSuccessResponse({
                  sessionId: "session-queued-1",
                  files: createAnalysisFiles(10, "session-queued-1"),
                  status: "pending",
                  processedFileCount: 0,
                  activeBatchFileCount: 0,
                  startedAt: null,
                  attemptCount: 0,
                  result: null,
                  errorMessage: null,
                  insuranceCategory: null,
                });
              }
              return createTrpcSuccessResponse({
                sessionId: "session-queued-1",
                files: createAnalysisFiles(10, "session-queued-1"),
                status: "processing",
                processedFileCount: 0,
                activeBatchFileCount: 3,
                startedAt: new Date().toISOString(),
                attemptCount: 1,
                result: null,
                errorMessage: null,
                insuranceCategory: null,
              });
            case "policy.getChatHistory":
              return createTrpcSuccessResponse([]);
            case "policy.getUserAnalyses":
              return createTrpcSuccessResponse([]);
            default:
              return createTrpcSuccessResponse(null);
          }
        })
      );

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          url.searchParams.get("batch") === "1" ? responses : responses[0]
        ),
      });
    });

    await page.goto("/insurance/new");
    await expect(page).toHaveURL(/\/insurance\/new$/);

    await page.setInputFiles("#file-input", {
      name: "policy.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
      ),
    });

    await page.getByTestId("policy-upload-submit").click();

    await expect(page).toHaveURL(/\/insurance\/session-queued-1$/);
    await expect(page.getByTestId("policy-analysis-pending")).toBeVisible();
    await expect(page.getByText("הקבצים בתור לעיבוד")).toBeVisible();
    await expect(
      page.getByTestId("policy-analysis-queued-progress")
    ).toBeVisible();
    await expect.poll(() => analyzeKickCount).toBe(1);
    await expect(
      page
        .getByTestId("policy-analysis-pending")
        .getByText("3/10", { exact: true })
    ).toBeVisible();
    expect(analysisCallCount).toBeGreaterThanOrEqual(2);
  });

  test("uploads a policy, shows pending state, and later renders the completed analysis", async ({
    page,
  }) => {
    let analysisCallCount = 0;

    await page.route("**/api/policies/upload", async route => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-bg-1",
          files: [
            {
              name: "policy.pdf",
              size: 1024,
              fileKey: "policies/session-bg-1/file.pdf",
            },
          ],
        }),
      });
    });

    await page.route("**/api/trpc/**", async route => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map(procedureName => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(testUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getAnalysis":
            analysisCallCount += 1;
            if (analysisCallCount === 1) {
              return createTrpcSuccessResponse({
                sessionId: "session-bg-1",
                files: createAnalysisFiles(8),
                status: "processing",
                processedFileCount: 0,
                activeBatchFileCount: 3,
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
        body: JSON.stringify(
          url.searchParams.get("batch") === "1" ? responses : responses[0]
        ),
      });
    });

    await page.goto("/insurance/new");
    await expect(page).toHaveURL(/\/insurance\/new$/);

    await page.setInputFiles("#file-input", {
      name: "policy.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
      ),
    });

    await page.getByTestId("policy-upload-submit").click();

    await expect(page).toHaveURL(/\/insurance\/session-bg-1$/);
    await expect(page.getByTestId("policy-analysis-pending")).toBeVisible();
    await expect(
      page
        .getByTestId("policy-analysis-pending")
        .getByText("3/8", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("לומי מחלק את הסריקה לקבוצות של עד 3 קבצים")
    ).toBeVisible();

    await page.reload();

    await expect(
      page.getByText("זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.")
    ).toBeVisible();
    await expect(page.getByText("ניתוחים פרטיים")).toBeVisible();
    await page.getByText("ניתוחים פרטיים").click();
    await expect(page.getByRole("dialog")).toContainText("סעיפי הכיסוי");
    await expect(page.getByRole("dialog")).toContainText("תקופת אכשרה");
  });

  test("renders overlap evidence and policy-level overlap panels for hierarchical analyses", async ({
    page,
  }) => {
    await page.route("**/api/trpc/**", async route => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map(procedureName => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(testUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getAnalysis":
            return createTrpcSuccessResponse(overlapCompletedAnalysis);
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
        body: JSON.stringify(
          url.searchParams.get("batch") === "1" ? responses : responses[0]
        ),
      });
    });

    await page.goto("/insurance/session-overlap-1");

    await expect(page.getByTestId("coverage-overlap-panel")).toBeVisible({ timeout: 15_000 });
    await page
      .getByTestId("coverage-overlap-item-coverage-overlap-ambulatory")
      .getByRole("button")
      .click();
    await expect(
      page
        .getByTestId("coverage-overlap-item-coverage-overlap-ambulatory")
        .getByText("סעיפים תומכים")
    ).toHaveCount(2);
    await expect(
      page
        .getByTestId("coverage-overlap-item-coverage-overlap-ambulatory")
        .getByText("פירוט הכיסוי")
    ).toHaveCount(2);
    await expect(
      page
        .getByTestId("coverage-overlap-item-coverage-overlap-ambulatory")
        .getByText("כיסוי אמבולטורי בפוליסה הראשונה.")
    ).toHaveCount(2);
    await expect(
      page
        .getByTestId("coverage-overlap-item-coverage-overlap-ambulatory")
        .getByText("כיסוי אמבולטורי בפוליסה השנייה.")
    ).toHaveCount(2);

    await page
      .getByTestId("policy-overlap-item-policy-overlap-health-pair")
      .getByRole("button")
      .click();
    await expect(
      page
        .getByTestId("policy-overlap-item-policy-overlap-health-pair")
        .getByText("בריאות בסיסית")
    ).toBeVisible();
    await expect(
      page
        .getByTestId("policy-overlap-item-policy-overlap-health-pair")
        .getByText("בריאות משלימה")
    ).toBeVisible();
  });

  test("shows the reanalysis banner for legacy-normalized analyses", async ({ page }) => {
    await page.route("**/api/trpc/**", async route => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map(procedureName => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(testUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getAnalysis":
            return createTrpcSuccessResponse(legacyCompletedAnalysis);
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
        body: JSON.stringify(
          url.searchParams.get("batch") === "1" ? responses : responses[0]
        ),
      });
    });

    await page.goto("/insurance/session-legacy-1");

    await expect(page.getByTestId("legacy-analysis-banner")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("הסריקה הזו נוצרה במודל הישן")).toBeVisible();
    await expect(page.getByText("זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.")).toBeVisible();
  });

  test("adds more files to an existing analysis and reruns the same session", async ({
    page,
  }) => {
    let appendUploadCount = 0;
    let analyzeKickCount = 0;
    let currentAnalysisState: "completed" | "pending" = "completed";

    await page.route("**/api/policies/upload**", async route => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("sessionId") === "session-bg-1") {
        appendUploadCount += 1;
        currentAnalysisState = "pending";
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sessionId: "session-bg-1",
            totalFileCount: 10,
            files: [
              {
                name: "policy-9.pdf",
                size: 1024,
                fileKey: "policies/session-bg-1/file-9.pdf",
              },
              {
                name: "policy-10.pdf",
                size: 1024,
                fileKey: "policies/session-bg-1/file-10.pdf",
              },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          sessionId: "session-bg-1",
          files: [
            {
              name: "policy.pdf",
              size: 1024,
              fileKey: "policies/session-bg-1/file.pdf",
            },
          ],
        }),
      });
    });

    await page.route("**/api/trpc/**", async route => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map(procedureName => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(testUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.analyze":
            analyzeKickCount += 1;
            return createTrpcSuccessResponse({
              status: "queued",
              result: null,
            });
          case "policy.getAnalysis":
            if (currentAnalysisState === "completed") {
              return createTrpcSuccessResponse(completedAnalysis);
            }
            return createTrpcSuccessResponse({
              sessionId: "session-bg-1",
              files: createAnalysisFiles(10),
              status: "pending",
              processedFileCount: 0,
              activeBatchFileCount: 0,
              startedAt: null,
              attemptCount: 0,
              result: null,
              errorMessage: null,
              insuranceCategory: "health",
            });
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
        body: JSON.stringify(
          url.searchParams.get("batch") === "1" ? responses : responses[0]
        ),
      });
    });

    await page.goto("/insurance/session-bg-1");

    await expect(
      page.getByText("זהו סיכום הפוליסה המלא לאחר עיבוד הרקע.")
    ).toBeVisible();
    await expect(page.getByTestId("policy-append-files-button")).toBeVisible();

    await page.setInputFiles("[data-testid='policy-append-input']", [
      {
        name: "policy-9.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        ),
      },
      {
        name: "policy-10.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(
          "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        ),
      },
    ]);

    await expect.poll(() => appendUploadCount).toBe(1);
    await expect(page.getByTestId("policy-analysis-pending")).toBeVisible();
    await expect(page.getByText("10 קבצים בתור")).toBeVisible();
    await expect.poll(() => analyzeKickCount).toBe(1);
    await expect(page).toHaveURL(/\/insurance\/session-bg-1$/);
  });

  test("shows a recovery state when a saved analysis stops receiving updates", async ({
    page,
  }) => {
    await page.route("**/api/trpc/**", async route => {
      const url = new URL(route.request().url());
      const procedureNames = url.pathname.replace("/api/trpc/", "").split(",");
      const responses = procedureNames.map(procedureName => {
        switch (procedureName) {
          case "auth.me":
            return createTrpcSuccessResponse(testUser);
          case "profile.getImageUrl":
            return createTrpcSuccessResponse(null);
          case "policy.getAnalysis":
            return createTrpcSuccessResponse({
              sessionId: "session-stale-1",
              files: [
                {
                  name: "policy.pdf",
                  size: 1024,
                  fileKey: "policies/session-stale-1/file.pdf",
                },
              ],
              status: "processing",
              createdAt: "2026-03-01T09:00:00.000Z",
              startedAt: "2026-03-01T09:05:00.000Z",
              lastHeartbeatAt: "2026-03-01T09:10:00.000Z",
              updatedAt: "2026-03-01T09:10:00.000Z",
              attemptCount: 2,
              result: null,
              errorMessage: null,
              insuranceCategory: null,
            });
          case "policy.getUserAnalyses":
            return createTrpcSuccessResponse([]);
          default:
            return createTrpcSuccessResponse(null);
        }
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          url.searchParams.get("batch") === "1" ? responses : responses[0]
        ),
      });
    });

    await page.goto("/insurance/session-stale-1");

    await expect(page.getByTestId("policy-analysis-stale")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("נראה שהסריקה נתקעה בדרך")).toBeVisible();
    await expect(page.getByTestId("policy-analysis-retry-stale")).toBeVisible();
  });
});

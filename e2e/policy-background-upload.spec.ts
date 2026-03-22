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
    duplicateCoverages: [],
    personalizedInsights: [],
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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const {
  getUserAnalysesMock,
  getUserProfileMock,
  logApiUsageMock,
  invokeLLMMock,
  auditMock,
  getCategorySummaryCacheMock,
  upsertCategorySummaryCacheMock,
} = vi.hoisted(() => ({
  getUserAnalysesMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  logApiUsageMock: vi.fn(),
  invokeLLMMock: vi.fn(),
  auditMock: vi.fn(),
  getCategorySummaryCacheMock: vi.fn(),
  upsertCategorySummaryCacheMock: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    appUrl: "http://localhost:3000",
    cookieSecret: "test-secret",
    databaseUrl: "",
    googleClientId: "",
    googleClientSecret: "",
    adminEmail: "admin@example.com",
    isProduction: false,
    llmApiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    llmApiKey: "test-key",
    llmModel: "gemini-2.5-flash",
    lumiComplexModel: "gemini-2.5-pro",
    llmSupportsFileUrl: true,
    gmailClientId: "",
    gmailClientSecret: "",
    storagePath: "./data/uploads",
  },
}));

vi.mock("./db", () => ({
  createAnalysis: vi.fn(),
  getAnalysisBySessionId: vi.fn(),
  updateAnalysisStatus: vi.fn(),
  addChatMessage: vi.fn(),
  getChatHistory: vi.fn().mockResolvedValue([]),
  getUserAnalyses: getUserAnalysesMock,
  linkAnalysisToUser: vi.fn(),
  deleteAnalysis: vi.fn(),
  logApiUsage: logApiUsageMock,
  getUserUsageStats: vi.fn().mockResolvedValue({
    rows: [],
    totalTokens: 0,
    totalCost: 0,
    analyzeCount: 0,
    chatCount: 0,
  }),
  getAllUsersWithUsage: vi.fn().mockResolvedValue([]),
  getPlatformStats: vi.fn().mockResolvedValue({
    totalUsers: 0,
    totalAnalyses: 0,
    totalTokens: 0,
    totalCost: 0,
    totalCalls: 0,
    activeUsersThisMonth: 0,
    dailyUsage: [],
  }),
  getUserProfile: getUserProfileMock,
  upsertUserProfile: vi.fn(),
  getFamilyMembers: vi.fn().mockResolvedValue([]),
  upsertFamilyMember: vi.fn(),
  deleteFamilyMember: vi.fn(),
  bootstrapFamilyMembersFromProfile: vi.fn().mockResolvedValue([]),
  getDocumentClassifications: vi.fn().mockResolvedValue([]),
  upsertDocumentClassification: vi.fn(),
  bulkUpsertDocumentClassifications: vi.fn(),
  getAdminDashboardStats: vi.fn().mockResolvedValue({}),
  getUserDetailedSummary: vi.fn().mockResolvedValue({}),
  getLLMUsageBreakdown: vi.fn().mockResolvedValue({}),
  getSystemHealth: vi.fn().mockResolvedValue({}),
  getNewUsersOverTime: vi.fn().mockResolvedValue([]),
  getCategoryDistribution: vi.fn().mockResolvedValue([]),
  getCategorySummaryCache: getCategorySummaryCacheMock,
  upsertCategorySummaryCache: upsertCategorySummaryCacheMock,
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./gmail", () => ({
  getGmailAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  saveGmailConnection: vi.fn(),
  getAllGmailConnections: vi.fn().mockResolvedValue([]),
  disconnectGmail: vi.fn(),
  scanGmailForInvoices: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageGet: vi.fn(),
  storageRead: vi.fn(),
  sanitizeFilename: vi.fn((value: string) => value),
  generateSignedFileUrl: vi.fn(),
}));

vi.mock("./auditLog", () => ({
  audit: auditMock,
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  getRecentAuditLogs: vi.fn().mockResolvedValue([]),
  getSecurityEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: invokeLLMMock,
}));

function makeAuthCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "user-open-id",
      email: "user@example.com",
      name: "Test User",
      loginMethod: "oauth",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAnalysis(params: {
  sessionId: string;
  category: "health" | "life" | "car" | "home";
  policyName: string;
  insurerName: string;
  summary: string;
  coverageTitle: string;
}) {
  return {
    sessionId: params.sessionId,
    userId: 1,
    createdAt: new Date("2026-03-20T09:00:00.000Z"),
    updatedAt: new Date("2026-03-20T09:00:00.000Z"),
    status: "completed",
    insuranceCategory: params.category,
    files: [{ name: `${params.policyName}.pdf`, size: 1024 }],
    analysisResult: {
      coverages: [
        {
          id: `${params.sessionId}-coverage`,
          title: params.coverageTitle,
          category: params.category,
          limit: "עד 12 טיפולים בשנה",
          details: `כיסוי עבור ${params.coverageTitle}`,
          eligibility: "כל המבוטחים",
          copay: "20%",
          maxReimbursement: "לא מצוין בפוליסה",
          exclusions: "אין",
          waitingPeriod: "3 חודשים",
          sourceFile: `${params.policyName}.pdf`,
        },
      ],
      generalInfo: {
        policyName: params.policyName,
        insurerName: params.insurerName,
        policyNumber: `${params.sessionId}-001`,
        policyType: params.category,
        insuranceCategory: params.category,
        monthlyPremium: "189 ₪",
        annualPremium: "2,268 ₪",
        startDate: "01/01/2026",
        endDate: "31/12/2026",
        importantNotes: ["כפוף לתנאי הפוליסה"],
        fineprint: ["אין החזר ללא אישור מוקדם"],
      },
      summary: params.summary,
      duplicateCoverages: [],
      personalizedInsights: [
        {
          id: `${params.sessionId}-insight`,
          type: "recommendation",
          title: "בדיקה שוטפת",
          description: "כדאי לבדוק התאמה לצורכי המשפחה.",
          relevantCoverage: params.coverageTitle,
          priority: "high",
        },
      ],
    },
  };
}

beforeEach(() => {
  getUserProfileMock.mockReset();
  getUserAnalysesMock.mockReset();
  logApiUsageMock.mockReset();
  invokeLLMMock.mockReset();
  auditMock.mockReset();
  getCategorySummaryCacheMock.mockReset();
  upsertCategorySummaryCacheMock.mockReset();

  getCategorySummaryCacheMock.mockResolvedValue(null);
  upsertCategorySummaryCacheMock.mockResolvedValue(undefined);

  getUserProfileMock.mockResolvedValue({
    id: 1,
    userId: 1,
    dateOfBirth: new Date("1988-01-10"),
    gender: "female",
    maritalStatus: "married",
    numberOfChildren: 2,
    childrenAges: "5, 8",
    employmentStatus: "salaried",
    incomeRange: "15k_25k",
    ownsApartment: true,
    hasActiveMortgage: true,
    numberOfVehicles: 1,
    hasExtremeSports: false,
    hasSpecialHealthConditions: false,
    healthConditionsDetails: null,
    hasPets: false,
    businessName: null,
    businessTaxId: null,
    businessEmailDomains: null,
  });
});

describe("policy.summarizeCategory", () => {
  it("builds a combined category summary from all analyses in the category", async () => {
    getUserAnalysesMock.mockResolvedValue([
      makeAnalysis({
        sessionId: "health-1",
        category: "health",
        policyName: "בריאות משפחתית",
        insurerName: "לומי בריאות",
        summary: "פוליסת בריאות משפחתית עם כיסוי לרפואה משלימה.",
        coverageTitle: "קלינאית תקשורת",
      }),
      makeAnalysis({
        sessionId: "health-2",
        category: "health",
        policyName: "בריאות מורחבת",
        insurerName: "מגן ישראל",
        summary: "פוליסה משלימה עם כיסוי לאשפוז וניתוחים.",
        coverageTitle: "ניתוחים פרטיים",
      }),
      makeAnalysis({
        sessionId: "car-1",
        category: "car",
        policyName: "רכב משפחתי",
        insurerName: "לומי רכב",
        summary: "פוליסת רכב.",
        coverageTitle: "גרירה וחילוץ",
      }),
    ]);
    invokeLLMMock.mockResolvedValue({
      id: "resp-1",
      created: Date.now(),
      model: "gemini-2.5-flash",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: JSON.stringify({
              overview: "יש כאן שתי פוליסות בריאות שמשלימות זו את זו ונותנות מעטפת רחבה יחסית, אבל כדאי לבדוק אם יש חפיפה בין חלק מהכיסויים.",
              highlights: [
                {
                  id: "highlight-1",
                  title: "כיסוי משלים רחב",
                  description: "יש שילוב בין כיסוי לרפואה משלימה לבין ניתוחים פרטיים, מה שמייצר מעטפת בריאותית רחבה יותר.",
                  tone: "success",
                },
                {
                  id: "highlight-2",
                  title: "כדאי לבדוק חפיפות",
                  description: "כיוון שיש יותר מפוליסה אחת, כדאי לעבור על הכיסויים המקבילים ולוודא שאין תשלום כפול.",
                  tone: "warning",
                },
              ],
              recommendedActions: [
                "לעבור על סעיפי הניתוחים והאשפוז ולבדוק אם יש כפל מול הפוליסה השנייה",
                "לוודא שתקופות האכשרה עדיין מתאימות לצרכים הנוכחיים של המשפחה",
              ],
              recommendedQuestions: [
                "איזה כיסויים חופפים בין שתי פוליסות הבריאות שלי?",
                "מה הכי חשוב לבדוק לפני חידוש פוליסות הבריאות שלי?",
              ],
            }),
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 420,
        completion_tokens: 90,
        total_tokens: 510,
      },
    });

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.policy.summarizeCategory({ category: "health" });

    expect(result.category).toBe("health");
    expect(result.highlights).toHaveLength(2);
    expect(result.recommendedActions).toHaveLength(2);
    expect(result.recommendedQuestions[0]).toContain("כיסויים חופפים");

    const llmCall = invokeLLMMock.mock.calls[0][0];
    const userPrompt = llmCall.messages[1].content as string;

    expect(userPrompt).toContain("בריאות משפחתית");
    expect(userPrompt).toContain("בריאות מורחבת");
    expect(userPrompt).not.toContain("רכב משפחתי");
    expect(logApiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        sessionId: "category-summary-1-health",
        action: "chat",
        model: "gemini-2.5-flash",
      })
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        action: "summarize_category",
        resourceId: "health",
      })
    );
  });

  it("throws NOT_FOUND when the user has no analyses in the requested category", async () => {
    getUserAnalysesMock.mockResolvedValue([
      makeAnalysis({
        sessionId: "car-1",
        category: "car",
        policyName: "רכב משפחתי",
        insurerName: "לומי רכב",
        summary: "פוליסת רכב.",
        coverageTitle: "גרירה וחילוץ",
      }),
    ]);

    const caller = appRouter.createCaller(makeAuthCtx());

    await expect(
      caller.policy.summarizeCategory({ category: "health" })
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(invokeLLMMock).not.toHaveBeenCalled();
  });
});

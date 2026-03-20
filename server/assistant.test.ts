import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

let mockAnalyses: any[] = [];
let mockProfile: any = null;
let mockFamilyMembers: any[] = [];
let mockDocumentClassifications: any[] = [];
let mockHistory: any[] = [];

const { invokeLLMMock, logApiUsageMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
  logApiUsageMock: vi.fn(),
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
  getChatHistory: vi.fn().mockImplementation(() => mockHistory),
  getUserAnalyses: vi.fn().mockImplementation(() => mockAnalyses),
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
  getUserProfile: vi.fn().mockImplementation(() => mockProfile),
  upsertUserProfile: vi.fn(),
  getFamilyMembers: vi.fn().mockImplementation(() => mockFamilyMembers),
  upsertFamilyMember: vi.fn(),
  deleteFamilyMember: vi.fn(),
  bootstrapFamilyMembersFromProfile: vi.fn().mockResolvedValue([]),
  getDocumentClassifications: vi.fn().mockImplementation(() => mockDocumentClassifications),
  upsertDocumentClassification: vi.fn(),
  bulkUpsertDocumentClassifications: vi.fn(),
  getAdminDashboardStats: vi.fn(),
  getUserDetailedSummary: vi.fn(),
  getLLMUsageBreakdown: vi.fn(),
  getSystemHealth: vi.fn(),
  getNewUsersOverTime: vi.fn(),
  getCategoryDistribution: vi.fn(),
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
  audit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  getRecentAuditLogs: vi.fn().mockResolvedValue([]),
  getSecurityEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: invokeLLMMock,
}));

function makeAnalysis(params: {
  sessionId: string;
  createdAt: string;
  policyName: string;
  insurerName: string;
  category: "health" | "life" | "car" | "home";
  summary: string;
  coverages: Array<{
    title: string;
    details: string;
    copay?: string;
    waitingPeriod?: string;
    exclusions?: string;
    limit?: string;
  }>;
}) {
  return {
    sessionId: params.sessionId,
    createdAt: new Date(params.createdAt),
    status: "completed",
    insuranceCategory: params.category,
    files: [{ name: `${params.policyName}.pdf`, size: 1024 }],
    analysisResult: {
      coverages: params.coverages.map((coverage, index) => ({
        id: `${params.sessionId}-${index + 1}`,
        title: coverage.title,
        category: params.category === "health" ? "בריאות" : params.category,
        limit: coverage.limit ?? "לא מצוין בפוליסה",
        details: coverage.details,
        eligibility: "כל המבוטחים",
        copay: coverage.copay ?? "לא מצוין בפוליסה",
        maxReimbursement: "לא מצוין בפוליסה",
        exclusions: coverage.exclusions ?? "לא מצוין בפוליסה",
        waitingPeriod: coverage.waitingPeriod ?? "לא מצוין בפוליסה",
      })),
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
      personalizedInsights: [
        {
          id: `${params.sessionId}-insight`,
          type: "recommendation",
          title: "התאמה למשפחה",
          description: "כדאי לבדוק את הכיסוי מול צורכי הילדים במשפחה.",
          relevantCoverage: params.coverages[0]?.title,
          priority: "high",
        },
      ],
      duplicateCoverages: [],
    },
  };
}

function makeHistory(length: number) {
  return Array.from({ length }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `הודעה ${index + 1}`,
  }));
}

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

beforeEach(() => {
  mockProfile = {
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
  };
  mockFamilyMembers = [
    {
      id: 10,
      fullName: "אורי",
      relation: "child",
      ageLabel: "בן 5",
      birthDate: new Date("2021-01-01"),
      allergies: null,
      medicalNotes: "עיכוב שפתי קל",
      activities: "גן חובה",
      insuranceNotes: "צריך לבדוק זכאות להתפתחות הילד",
      notes: null,
    },
  ];
  mockDocumentClassifications = [
    {
      id: 1,
      documentKey: "policy-health-2026.pdf",
      sourceType: "analysis_file",
      sourceId: "health-1",
      manualType: "health",
      updatedAt: new Date("2026-03-15"),
    },
  ];
  mockAnalyses = [
    makeAnalysis({
      sessionId: "car-1",
      createdAt: "2026-03-18T10:00:00.000Z",
      policyName: "רכב משפחתי מקיף",
      insurerName: "לומי רכב",
      category: "car",
      summary: "פוליסת רכב עם כיסוי לנזקי תאונה וגרירה.",
      coverages: [
        {
          title: "גרירה וחילוץ",
          details: "שירות גרירה עד פעמיים בשנה.",
          limit: "2 פעמים בשנה",
        },
      ],
    }),
    makeAnalysis({
      sessionId: "health-1",
      createdAt: "2026-03-20T09:00:00.000Z",
      policyName: "לומי בריאות לילדים",
      insurerName: "לומי בריאות",
      category: "health",
      summary: "פוליסת בריאות עם כיסוי להתפתחות הילד ולטיפולים פרא-רפואיים.",
      coverages: [
        {
          title: "קלינאית תקשורת",
          details: "החזר עבור אבחון וטיפול בקלינאית תקשורת לילדים במסגרת התפתחות הילד.",
          copay: "20% מהעלות ועד 200 ₪ לטיפול",
          waitingPeriod: "3 חודשים",
          exclusions: "אין כיסוי אם מדובר באבחון קודם להצטרפות",
          limit: "עד 12 טיפולים בשנה",
        },
        {
          title: "ריפוי בעיסוק",
          details: "כיסוי לטיפולי ריפוי בעיסוק לילדים.",
          copay: "15%",
          waitingPeriod: "2 חודשים",
          exclusions: "לא מצוין בפוליסה",
          limit: "עד 10 טיפולים בשנה",
        },
      ],
    }),
  ];
  mockHistory = [];
  invokeLLMMock.mockReset();
  logApiUsageMock.mockReset();
});

describe("assistant.chat", () => {
  it("uses deep relevant health context and stronger model for complex insurance-family questions", async () => {
    mockHistory = makeHistory(30);
    invokeLLMMock.mockResolvedValue({
      id: "resp-1",
      created: Date.now(),
      model: "gemini-2.5-pro",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "יש כיסוי רלוונטי לקלינאית תקשורת בכפוף לתנאי הפוליסה.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 220,
        completion_tokens: 60,
        total_tokens: 280,
      },
    });

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.assistant.chat({
      message: "האם הילד בן 5 שלי מכוסה לקלינאית תקשורת ואם כן יש השתתפות עצמית?",
    });

    expect(result.response).toContain("קלינאית תקשורת");

    const llmCall = invokeLLMMock.mock.calls[0][0];
    expect(llmCall.model).toBe("gemini-2.5-pro");
    expect(llmCall.messages).toHaveLength(21);

    const systemPrompt = llmCall.messages[0].content as string;
    const relevantPoliciesSection = systemPrompt.split("פוליסות רלוונטיות לשאלה:\n")[1]?.split("\n\nכסף:")[0] ?? "";

    expect(systemPrompt).toContain("אורי");
    expect(systemPrompt).toContain("עיכוב שפתי קל");
    expect(relevantPoliciesSection).toContain("לומי בריאות לילדים");
    expect(relevantPoliciesSection).toContain("קלינאית תקשורת");
    expect(relevantPoliciesSection).toContain("20% מהעלות ועד 200 ₪ לטיפול");
    expect(relevantPoliciesSection).toContain("3 חודשים");
    expect(relevantPoliciesSection).not.toContain("רכב משפחתי מקיף");

    expect(logApiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "chat",
        model: "gemini-2.5-pro",
      })
    );
  });

  it("keeps simple assistant questions on the default model and shorter history window", async () => {
    mockHistory = makeHistory(30);
    invokeLLMMock.mockResolvedValue({
      id: "resp-2",
      created: Date.now(),
      model: "gemini-2.5-flash",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "הפרמיה החודשית היא 189 ₪.",
          },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 140,
        completion_tokens: 24,
        total_tokens: 164,
      },
    });

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.assistant.chat({
      message: "מה הפרמיה החודשית של לומי בריאות לילדים?",
    });

    expect(result.response).toContain("189");

    const llmCall = invokeLLMMock.mock.calls[0][0];
    expect(llmCall.model).toBe("gemini-2.5-flash");
    expect(llmCall.messages).toHaveLength(13);

    const systemPrompt = llmCall.messages[0].content as string;
    const relevantPoliciesSection = systemPrompt.split("פוליסות רלוונטיות לשאלה:\n")[1]?.split("\n\nכסף:")[0] ?? "";

    expect(relevantPoliciesSection).toContain("לומי בריאות לילדים");
    expect(logApiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "chat",
        model: "gemini-2.5-flash",
      })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const {
  getUserAnalysesMock,
  getUserProfileMock,
  getFamilyMembersMock,
  auditMock,
} = vi.hoisted(() => ({
  getUserAnalysesMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getFamilyMembersMock: vi.fn(),
  auditMock: vi.fn(),
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
  logApiUsage: vi.fn(),
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
  getFamilyMembers: getFamilyMembersMock,
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
  getCategorySummaryCache: vi.fn().mockResolvedValue(null),
  resetAnalysisForRetry: vi.fn(),
  upsertCategorySummaryCache: vi.fn(),
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("./gmail", () => ({
  getGmailAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  saveGmailConnection: vi.fn(),
  discoverPolicyPdfs: vi.fn(),
  getAllGmailConnections: vi.fn().mockResolvedValue([]),
  disconnectGmail: vi.fn(),
  getInsuranceDiscoveries: vi.fn().mockResolvedValue([]),
  importPolicyPdfFromGmail: vi.fn(),
  scanGmailForInvoices: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageGet: vi.fn(),
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
  invokeLLM: vi.fn(),
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

function makeCompletedHealthAnalysis() {
  return {
    sessionId: "health-1",
    userId: 1,
    createdAt: new Date("2026-03-20T09:00:00.000Z"),
    updatedAt: new Date("2026-03-20T09:00:00.000Z"),
    status: "completed",
    insuranceCategory: "health" as const,
    files: [{ name: "health.pdf", size: 1024 }],
    analysisResult: {
      generalInfo: {
        policyName: "בריאות משפחתית",
        insurerName: "מגדל",
        monthlyPremium: "189 ₪",
        annualPremium: "2,268 ₪",
        insuranceCategory: "health" as const,
        endDate: "31/12/2026",
      },
      coverages: [{ id: "coverage-1", title: "אמבולטורי", category: "בריאות" }],
      duplicateCoverages: [],
      personalizedInsights: [],
      summary: "פוליסת בריאות פעילה",
    },
  };
}

beforeEach(() => {
  getUserAnalysesMock.mockReset();
  getUserProfileMock.mockReset();
  getFamilyMembersMock.mockReset();
  auditMock.mockReset();

  getUserAnalysesMock.mockResolvedValue([makeCompletedHealthAnalysis()]);
  getUserProfileMock.mockResolvedValue(null);
  getFamilyMembersMock.mockResolvedValue([]);
});

describe("insuranceMap.get", () => {
  it("returns a snapshot even when optional profile and family queries fail", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getUserProfileMock.mockRejectedValue(new Error("profile decrypt failed"));
    getFamilyMembersMock.mockRejectedValue(new Error("family decrypt failed"));

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.insuranceMap.get();

    expect(result.householdSize).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.categoriesWithData).toBe(1);
    expect(result.rows[0].cells.find((cell) => cell.category === "health")?.status).toBe("household_covered");
    expect(warnSpy).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
  });

  it("still fails when the analyses query itself fails", async () => {
    getUserAnalysesMock.mockRejectedValue(new Error("analyses unavailable"));

    const caller = appRouter.createCaller(makeAuthCtx());

    await expect(caller.insuranceMap.get()).rejects.toThrow("analyses unavailable");
  });
});

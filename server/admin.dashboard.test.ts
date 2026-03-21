import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  createAnalysis: vi.fn(),
  getAnalysisBySessionId: vi.fn(),
  updateAnalysisStatus: vi.fn(),
  addChatMessage: vi.fn(),
  getChatHistory: vi.fn(),
  getUserAnalyses: vi.fn().mockResolvedValue([]),
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
    totalUsers: 5,
    totalAnalyses: 12,
    totalTokens: 150000,
    totalCost: 0.375,
    totalCalls: 20,
    activeUsersThisMonth: 3,
    dailyUsage: [],
  }),
  getUserProfile: vi.fn().mockResolvedValue(null),
  upsertUserProfile: vi.fn(),
  getDb: vi.fn().mockResolvedValue(null),
  getAdminDashboardStats: vi.fn().mockResolvedValue({
    totalUsers: 10,
    totalAnalyses: 25,
    totalChats: 150,
    totalGmailConnections: 3,
    totalInvoices: 42,
    totalTokens: 500000,
    totalPromptTokens: 350000,
    totalCompletionTokens: 150000,
    totalCost: 1.25,
    totalCalls: 40,
    activeUsersThisMonth: 5,
    currentMonthCost: 0.35,
    projectedMonthlyCost: 0.7,
    successRate: 92,
    completedAnalyses: 23,
    errorAnalyses: 2,
    dailyUsage: [
      { date: "2026-03-15", calls: 5, tokens: 10000, cost: 0.025 },
      { date: "2026-03-16", calls: 8, tokens: 15000, cost: 0.0375 },
    ],
  }),
  getUserDetailedSummary: vi.fn().mockResolvedValue({
    user: {
      id: 1,
      name: "Test User",
      email: "test@example.com",
      role: "user",
      createdAt: new Date(),
      lastSignedIn: new Date(),
    },
    analyses: [
      { sessionId: "abc123", status: "completed", insuranceCategory: "health", createdAt: new Date() },
    ],
    usage: {
      totalTokens: 10000,
      totalCost: 0.025,
      analyzeCount: 1,
      chatCount: 3,
      totalCalls: 4,
    },
    gmail: [],
    invoices: { count: 0, totalAmount: 0 },
    recentAudit: [],
  }),
  getLLMUsageBreakdown: vi.fn().mockResolvedValue({
    costByUser: [
      { userId: 1, userName: "User 1", userEmail: "u1@test.com", totalCost: 0.5, totalTokens: 200000, callCount: 10 },
    ],
    costByAction: [
      { action: "analyze", totalCost: 0.8, totalTokens: 320000, promptTokens: 250000, completionTokens: 70000, callCount: 15 },
      { action: "chat", totalCost: 0.45, totalTokens: 180000, promptTokens: 140000, completionTokens: 40000, callCount: 25 },
    ],
    dailyCost: [
      { date: "2026-03-15", cost: 0.03, tokens: 12000, calls: 4 },
    ],
    weeklyCost: [
      { week: "2026-03-10", cost: 0.15, tokens: 60000, calls: 20 },
    ],
    avgCostPerAnalysis: 0.053,
    avgCostPerChat: 0.018,
  }),
  getSystemHealth: vi.fn().mockResolvedValue({
    analysisStatusDistribution: [
      { status: "completed", count: 23 },
      { status: "error", count: 2 },
    ],
    gmailSyncStatus: { totalConnections: 3, recentSyncs24h: 1 },
    avgAnalysisDurationMs: 15000,
    recentErrors: [],
    categoryDistribution: [
      { category: "health", count: 10 },
      { category: "car", count: 8 },
    ],
  }),
  getNewUsersOverTime: vi.fn().mockResolvedValue([
    { date: "2026-03-15", count: 2 },
    { date: "2026-03-16", count: 1 },
  ]),
  getCategoryDistribution: vi.fn().mockResolvedValue([
    { category: "health", count: 10 },
    { category: "car", count: 8 },
    { category: "life", count: 5 },
    { category: "home", count: 2 },
  ]),
}));

vi.mock("./auditLog", () => ({
  audit: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  getRecentAuditLogs: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, action: "login", resource: "auth", status: "allowed", createdAt: new Date() },
    { id: 2, userId: 1, action: "create_analysis", resource: "analysis", status: "allowed", createdAt: new Date() },
  ]),
  getSecurityEvents: vi.fn().mockResolvedValue([
    { id: 10, userId: null, action: "geo_blocked", resource: "security", status: "blocked", createdAt: new Date(), ipAddress: "1.2.3.4" },
  ]),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageGet: vi.fn(),
  storageRead: vi.fn(),
  sanitizeFilename: vi.fn((n: string) => n),
  generateSignedFileUrl: vi.fn().mockReturnValue("https://signed-url"),
}));

vi.mock("./gmail", () => ({
  getGmailAuthUrl: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  saveGmailConnection: vi.fn(),
  getAllGmailConnections: vi.fn().mockResolvedValue([]),
  disconnectGmail: vi.fn(),
  scanGmailForInvoices: vi.fn(),
  getInsuranceDiscoveries: vi.fn().mockResolvedValue([]),
}));

vi.mock("./encryption", () => ({
  encryptField: vi.fn((v: string) => v),
  decryptField: vi.fn((v: string) => v),
  encryptJson: vi.fn((v: unknown) => JSON.stringify(v)),
  decryptJson: vi.fn((v: string) => JSON.parse(v)),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(role: "user" | "admin" = "user"): TrpcContext {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 99 : 1,
    openId: role === "admin" ? "admin-open-id" : "user-open-id",
    email: role === "admin" ? "admin@example.com" : "user@example.com",
    name: role === "admin" ? "Admin User" : "Regular User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeAnonCtx(): TrpcContext {
  return {
    user: undefined,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("admin.dashboardStats", () => {
  it("returns comprehensive stats for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.dashboardStats();
    expect(result).toMatchObject({
      totalUsers: 10,
      totalAnalyses: 25,
      totalChats: 150,
      totalGmailConnections: 3,
      totalInvoices: 42,
      totalTokens: 500000,
      totalCost: 1.25,
      activeUsersThisMonth: 5,
      successRate: 92,
    });
    expect(result.dailyUsage).toHaveLength(2);
    expect(result.projectedMonthlyCost).toBeGreaterThan(0);
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.dashboardStats()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.admin.dashboardStats()).rejects.toThrow();
  });
});

describe("admin.recentActivity", () => {
  it("returns audit logs with user info for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.recentActivity({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("action");
    expect(result[0]).toHaveProperty("userName");
    expect(result[0]).toHaveProperty("userEmail");
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.recentActivity({ limit: 50 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.securityEvents", () => {
  it("returns security events for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.securityEvents({ limit: 50 });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("action");
    expect(result[0]).toHaveProperty("status");
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.securityEvents({ limit: 50 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.userSummary", () => {
  it("returns detailed user summary for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.userSummary({ userId: 1 });
    expect(result.user).toMatchObject({
      id: 1,
      name: "Test User",
      email: "test@example.com",
    });
    expect(result.analyses).toHaveLength(1);
    expect(result.usage).toMatchObject({
      analyzeCount: 1,
      chatCount: 3,
    });
    expect(result.invoices).toMatchObject({ count: 0 });
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.userSummary({ userId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.llmBreakdown", () => {
  it("returns LLM usage breakdown for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.llmBreakdown();
    expect(result.costByUser).toHaveLength(1);
    expect(result.costByAction).toHaveLength(2);
    expect(result.dailyCost).toHaveLength(1);
    expect(result.weeklyCost).toHaveLength(1);
    expect(result.avgCostPerAnalysis).toBeGreaterThan(0);
    expect(result.avgCostPerChat).toBeGreaterThan(0);
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.llmBreakdown()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.systemHealth", () => {
  it("returns system health for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.systemHealth();
    expect(result.analysisStatusDistribution).toHaveLength(2);
    expect(result.gmailSyncStatus).toMatchObject({
      totalConnections: 3,
      recentSyncs24h: 1,
    });
    expect(result.avgAnalysisDurationMs).toBe(15000);
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.systemHealth()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.newUsersOverTime", () => {
  it("returns new users data for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.newUsersOverTime();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("date");
    expect(result[0]).toHaveProperty("count");
  });

  it("accepts custom days parameter", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.newUsersOverTime({ days: 7 });
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.newUsersOverTime()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("admin.categoryDistribution", () => {
  it("returns category distribution for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.categoryDistribution();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(4);
    expect(result[0]).toHaveProperty("category");
    expect(result[0]).toHaveProperty("count");
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.categoryDistribution()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.admin.categoryDistribution()).rejects.toThrow();
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// Mock the db module so tests don't need a real database
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

describe("admin.platformStats", () => {
  it("returns stats for admin users", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.platformStats();
    expect(result).toMatchObject({
      totalUsers: 5,
      totalAnalyses: 12,
      totalCalls: 20,
    });
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.platformStats()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.admin.platformStats()).rejects.toThrow();
  });
});

describe("admin.allUsers", () => {
  it("returns user list for admin", async () => {
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.admin.allUsers();
    expect(Array.isArray(result)).toBe(true);
  });

  it("throws FORBIDDEN for regular users", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.admin.allUsers()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("policy.myUsage", () => {
  it("returns usage stats for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    const result = await caller.policy.myUsage();
    expect(result).toMatchObject({
      totalTokens: 0,
      totalCost: 0,
      analyzeCount: 0,
      chatCount: 0,
    });
  });

  it("throws for unauthenticated users", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.policy.myUsage()).rejects.toThrow();
  });
});

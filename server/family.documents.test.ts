import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageGet: vi.fn(),
  storageRead: vi.fn(),
  sanitizeFilename: vi.fn((name: string) => name),
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

let mockProfile: any = null;
let mockFamilyMembers: any[] = [];
let mockDocumentClassifications: any[] = [];

vi.mock("./db", () => {
  const upsertDocumentClassification = vi.fn().mockImplementation(
    async (
      userId: number,
      input: {
        documentKey: string;
        sourceType: "analysis_file" | "invoice_pdf";
        sourceId?: string | null;
        manualType: "insurance" | "money" | "health" | "education" | "family" | "other";
      }
    ) => {
      const existingIndex = mockDocumentClassifications.findIndex(
        (item) => item.userId === userId && item.documentKey === input.documentKey
      );
      const nextValue = {
        id: existingIndex >= 0 ? mockDocumentClassifications[existingIndex].id : mockDocumentClassifications.length + 1,
        userId,
        documentKey: input.documentKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        manualType: input.manualType,
        createdAt: existingIndex >= 0 ? mockDocumentClassifications[existingIndex].createdAt : new Date(),
        updatedAt: new Date(),
      };
      if (existingIndex >= 0) {
        mockDocumentClassifications[existingIndex] = nextValue;
      } else {
        mockDocumentClassifications.push(nextValue);
      }
      return nextValue;
    }
  );

  return {
    createAnalysis: vi.fn(),
    getAnalysisBySessionId: vi.fn(),
    updateAnalysisStatus: vi.fn(),
    addChatMessage: vi.fn(),
    getChatHistory: vi.fn().mockResolvedValue([]),
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
      totalUsers: 0,
      totalAnalyses: 0,
      totalTokens: 0,
      totalCost: 0,
      totalCalls: 0,
      activeUsersThisMonth: 0,
      dailyUsage: [],
    }),
    getUserProfile: vi.fn().mockImplementation(() => mockProfile),
    upsertUserProfile: vi.fn().mockImplementation(async (userId: number, input: any) => {
      mockProfile = {
        ...mockProfile,
        id: mockProfile?.id ?? 1,
        userId,
        ...input,
        updatedAt: new Date(),
      };
      return mockProfile;
    }),
    getFamilyMembers: vi.fn().mockImplementation(async () => mockFamilyMembers),
    upsertFamilyMember: vi.fn().mockImplementation(async (_userId: number, input: any) => {
      const existingIndex = input.id
        ? mockFamilyMembers.findIndex((member) => member.id === input.id)
        : -1;
      const nextValue = {
        id: existingIndex >= 0 ? mockFamilyMembers[existingIndex].id : mockFamilyMembers.length + 1,
        fullName: input.fullName,
        relation: input.relation,
        birthDate: input.birthDate ?? null,
        ageLabel: input.ageLabel ?? null,
        gender: input.gender ?? null,
        allergies: input.allergies ?? null,
        medicalNotes: input.medicalNotes ?? null,
        activities: input.activities ?? null,
        insuranceNotes: input.insuranceNotes ?? null,
        notes: input.notes ?? null,
        createdAt: existingIndex >= 0 ? mockFamilyMembers[existingIndex].createdAt : new Date(),
        updatedAt: new Date(),
      };
      if (existingIndex >= 0) {
        mockFamilyMembers[existingIndex] = nextValue;
      } else {
        mockFamilyMembers.push(nextValue);
      }
      return nextValue;
    }),
    deleteFamilyMember: vi.fn().mockImplementation(async (_userId: number, memberId: number) => {
      mockFamilyMembers = mockFamilyMembers.filter((member) => member.id !== memberId);
    }),
    bootstrapFamilyMembersFromProfile: vi.fn().mockImplementation(async () => {
      if (mockFamilyMembers.length > 0) {
        return mockFamilyMembers;
      }
      const nextMembers = [];
      if (mockProfile?.maritalStatus === "married") {
        nextMembers.push({
          id: 1,
          fullName: "בן/בת זוג",
          relation: "spouse",
          birthDate: null,
          ageLabel: null,
          gender: null,
          allergies: null,
          medicalNotes: null,
          activities: null,
          insuranceNotes: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      for (let index = 0; index < (mockProfile?.numberOfChildren ?? 0); index += 1) {
        nextMembers.push({
          id: nextMembers.length + 1,
          fullName: `ילד ${index + 1}`,
          relation: "child",
          birthDate: null,
          ageLabel: (mockProfile?.childrenAges ?? "").split(",")[index]?.trim() || null,
          gender: null,
          allergies: null,
          medicalNotes: null,
          activities: null,
          insuranceNotes: null,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      mockFamilyMembers = nextMembers;
      return mockFamilyMembers;
    }),
    getDocumentClassifications: vi.fn().mockImplementation(async () => mockDocumentClassifications),
    upsertDocumentClassification,
    bulkUpsertDocumentClassifications: vi.fn().mockImplementation(
      async (userId: number, items: any[]) =>
        Promise.all(items.map((item) => upsertDocumentClassification(userId, item)))
    ),
    getAdminDashboardStats: vi.fn(),
    getUserDetailedSummary: vi.fn(),
    getLLMUsageBreakdown: vi.fn(),
    getSystemHealth: vi.fn(),
    getNewUsersOverTime: vi.fn(),
    getCategoryDistribution: vi.fn(),
    getDb: vi.fn().mockResolvedValue(null),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeAuthCtx(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "oauth",
    role: "user" as const,
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
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  mockProfile = {
    id: 1,
    userId: 1,
    maritalStatus: "married",
    numberOfChildren: 2,
    childrenAges: "4, 7",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockFamilyMembers = [];
  mockDocumentClassifications = [];
});

describe("family router", () => {
  it("returns an empty list before members are created", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.family.list();
    expect(result).toEqual([]);
  });

  it("creates and returns a new family member", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.family.upsert({
      fullName: "נועה",
      relation: "child",
      birthDate: "2020-03-20",
      ageLabel: "גן",
      gender: "female",
      allergies: "בוטנים",
      medicalNotes: "מעקב שנתי",
      activities: "ריקוד",
      insuranceNotes: "לבדוק כיסוי שיניים",
      notes: "רגישה לשעות מאוחרות",
    });

    expect(result.success).toBe(true);
    expect(result.member?.fullName).toBe("נועה");
    expect(result.member?.relation).toBe("child");
    expect(result.member?.allergies).toBe("בוטנים");

    const members = await caller.family.list();
    expect(members).toHaveLength(1);
  });

  it("deletes an existing family member", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const created = await caller.family.upsert({
      fullName: "אורי",
      relation: "child",
      birthDate: null,
      ageLabel: "כיתה א׳",
      gender: null,
      allergies: null,
      medicalNotes: null,
      activities: null,
      insuranceNotes: null,
      notes: null,
    });

    await caller.family.delete({ memberId: created.member!.id });
    const members = await caller.family.list();
    expect(members).toHaveLength(0);
  });

  it("bootstraps family members from the legacy profile", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.family.bootstrapFromProfile();
    expect(result.success).toBe(true);
    expect(result.createdCount).toBe(3);
    expect(result.members.some((member) => member.relation === "spouse")).toBe(true);
    expect(result.members.filter((member) => member.relation === "child")).toHaveLength(2);
  });

  it("rejects unauthenticated access", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.family.list()).rejects.toThrow();
  });
});

describe("documents router", () => {
  it("stores a single document classification", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.documents.upsertClassification({
      documentKey: "policy-abc-0",
      sourceType: "analysis_file",
      sourceId: "abc",
      manualType: "health",
    });

    expect(result.success).toBe(true);
    expect(result.classification?.manualType).toBe("health");

    const items = await caller.documents.getClassifications();
    expect(items).toHaveLength(1);
    expect(items[0].documentKey).toBe("policy-abc-0");
  });

  it("migrates multiple legacy document classifications", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.documents.migrateLegacyClassifications({
      items: [
        {
          documentKey: "policy-abc-0",
          sourceType: "analysis_file",
          sourceId: "abc",
          manualType: "insurance",
        },
        {
          documentKey: "invoice-55",
          sourceType: "invoice_pdf",
          sourceId: "55",
          manualType: "family",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);

    const items = await caller.documents.getClassifications();
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.documentKey === "invoice-55")?.manualType).toBe("family");
  });

  it("rejects unauthenticated document classification access", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.documents.getClassifications()).rejects.toThrow();
  });
});

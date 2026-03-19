import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "avatars/1/test.jpg", url: "/api/files/avatars/1/test.jpg" }),
  sanitizeFilename: vi.fn().mockImplementation((name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_")),
  generateSignedFileUrl: vi.fn().mockReturnValue("/api/files/avatars/1/test.jpg?token=abc&exp=999"),
}));

let mockProfile: any = null;

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
  getUserUsageStats: vi.fn().mockResolvedValue({ rows: [], totalTokens: 0, totalCost: 0, analyzeCount: 0, chatCount: 0 }),
  getAllUsersWithUsage: vi.fn().mockResolvedValue([]),
  getPlatformStats: vi.fn().mockResolvedValue({ totalUsers: 0, totalAnalyses: 0, totalTokens: 0, totalCost: 0, totalCalls: 0, activeUsersThisMonth: 0, dailyUsage: [] }),
  getUserProfile: vi.fn().mockImplementation(() => mockProfile),
  upsertUserProfile: vi.fn().mockImplementation((_userId: number, data: any) => {
    mockProfile = {
      ...mockProfile,
      id: 1,
      userId: _userId,
      dateOfBirth: data.dateOfBirth ?? mockProfile?.dateOfBirth ?? null,
      gender: data.gender ?? mockProfile?.gender ?? null,
      maritalStatus: data.maritalStatus ?? mockProfile?.maritalStatus ?? null,
      numberOfChildren: data.numberOfChildren ?? mockProfile?.numberOfChildren ?? 0,
      childrenAges: data.childrenAges ?? mockProfile?.childrenAges ?? null,
      employmentStatus: data.employmentStatus ?? mockProfile?.employmentStatus ?? null,
      incomeRange: data.incomeRange ?? mockProfile?.incomeRange ?? null,
      ownsApartment: data.ownsApartment ?? mockProfile?.ownsApartment ?? false,
      hasActiveMortgage: data.hasActiveMortgage ?? mockProfile?.hasActiveMortgage ?? false,
      numberOfVehicles: data.numberOfVehicles ?? mockProfile?.numberOfVehicles ?? 0,
      hasExtremeSports: data.hasExtremeSports ?? mockProfile?.hasExtremeSports ?? false,
      hasSpecialHealthConditions: data.hasSpecialHealthConditions ?? mockProfile?.hasSpecialHealthConditions ?? false,
      healthConditionsDetails: data.healthConditionsDetails ?? mockProfile?.healthConditionsDetails ?? null,
      hasPets: data.hasPets ?? mockProfile?.hasPets ?? false,
      profileImageKey: data.profileImageKey ?? mockProfile?.profileImageKey ?? null,
      createdAt: mockProfile?.createdAt ?? new Date(),
      updatedAt: new Date(),
    };
    return mockProfile;
  }),
}));

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
  mockProfile = null;
});

describe("profile.get", () => {
  it("returns null when no profile exists", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.get();
    expect(result).toBeNull();
  });

  it("returns profile data when profile exists", async () => {
    mockProfile = {
      id: 1,
      userId: 1,
      dateOfBirth: new Date("1990-05-15"),
      gender: "male",
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
      hasPets: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.get();

    expect(result).not.toBeNull();
    expect(result!.gender).toBe("male");
    expect(result!.maritalStatus).toBe("married");
    expect(result!.numberOfChildren).toBe(2);
    expect(result!.childrenAges).toBe("5, 8");
    expect(result!.employmentStatus).toBe("salaried");
    expect(result!.incomeRange).toBe("15k_25k");
    expect(result!.ownsApartment).toBe(true);
    expect(result!.hasActiveMortgage).toBe(true);
    expect(result!.numberOfVehicles).toBe(1);
    expect(result!.hasExtremeSports).toBe(false);
    expect(result!.hasPets).toBe(true);
    expect(result!.dateOfBirth).toContain("1990-05-15");
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.profile.get()).rejects.toThrow();
  });
});

describe("profile.update", () => {
  it("creates a new profile", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.update({
      dateOfBirth: "1990-05-15",
      gender: "male",
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
      hasPets: true,
    });

    expect(result.success).toBe(true);
    expect(result.profile).toBeDefined();
  });

  it("updates an existing profile", async () => {
    mockProfile = {
      id: 1,
      userId: 1,
      dateOfBirth: new Date("1990-05-15"),
      gender: "male",
      maritalStatus: "single",
      numberOfChildren: 0,
      childrenAges: null,
      employmentStatus: "student",
      incomeRange: "below_5k",
      ownsApartment: false,
      hasActiveMortgage: false,
      numberOfVehicles: 0,
      hasExtremeSports: false,
      hasSpecialHealthConditions: false,
      healthConditionsDetails: null,
      hasPets: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.update({
      maritalStatus: "married",
      numberOfChildren: 3,
      childrenAges: "2, 5, 9",
    });

    expect(result.success).toBe(true);
  });

  it("accepts all enum values for maritalStatus", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    for (const status of ["single", "married", "divorced", "widowed"] as const) {
      const result = await caller.profile.update({ maritalStatus: status });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all enum values for employmentStatus", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    for (const status of ["salaried", "self_employed", "business_owner", "student", "retired", "unemployed"] as const) {
      const result = await caller.profile.update({ employmentStatus: status });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all enum values for incomeRange", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    for (const range of ["below_5k", "5k_10k", "10k_15k", "15k_25k", "25k_40k", "above_40k"] as const) {
      const result = await caller.profile.update({ incomeRange: range });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all enum values for gender", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    for (const g of ["male", "female", "other"] as const) {
      const result = await caller.profile.update({ gender: g });
      expect(result.success).toBe(true);
    }
  });

  it("validates numberOfChildren range", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    await expect(caller.profile.update({ numberOfChildren: -1 })).rejects.toThrow();
    await expect(caller.profile.update({ numberOfChildren: 21 })).rejects.toThrow();
  });

  it("validates numberOfVehicles range", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    await expect(caller.profile.update({ numberOfVehicles: -1 })).rejects.toThrow();
    await expect(caller.profile.update({ numberOfVehicles: 11 })).rejects.toThrow();
  });

  it("rejects invalid enum values", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    await expect(caller.profile.update({ gender: "invalid" as any })).rejects.toThrow();
    await expect(caller.profile.update({ maritalStatus: "complicated" as any })).rejects.toThrow();
    await expect(caller.profile.update({ employmentStatus: "freelancer" as any })).rejects.toThrow();
    await expect(caller.profile.update({ incomeRange: "million" as any })).rejects.toThrow();
  });

  it("handles null values for optional fields", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.update({
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      childrenAges: null,
      employmentStatus: null,
      incomeRange: null,
      healthConditionsDetails: null,
    });
    expect(result.success).toBe(true);
  });

  it("handles boolean toggles", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.update({
      ownsApartment: true,
      hasActiveMortgage: true,
      hasExtremeSports: true,
      hasSpecialHealthConditions: true,
      hasPets: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.profile.update({ maritalStatus: "single" })
    ).rejects.toThrow();
  });
});

describe("profile.uploadImage", () => {
  const tinyJpegBase64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//";

  it("uploads a valid jpeg image", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.uploadImage({
      name: "photo.jpg",
      base64: tinyJpegBase64,
    });
    expect(result.fileKey).toContain("avatars/1/");
    expect(result.fileKey).toContain("photo.jpg");
  });

  it("uploads a valid png image", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.uploadImage({
      name: "avatar.png",
      base64: tinyJpegBase64,
    });
    expect(result.fileKey).toContain("avatars/1/");
  });

  it("uploads a valid webp image", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.uploadImage({
      name: "pic.webp",
      base64: tinyJpegBase64,
    });
    expect(result.fileKey).toContain("avatars/1/");
  });

  it("rejects non-image files", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    await expect(
      caller.profile.uploadImage({ name: "document.pdf", base64: tinyJpegBase64 })
    ).rejects.toThrow("Only jpg, png, webp images are allowed");
  });

  it("rejects exe files", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    await expect(
      caller.profile.uploadImage({ name: "malware.exe", base64: tinyJpegBase64 })
    ).rejects.toThrow("Only jpg, png, webp images are allowed");
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.profile.uploadImage({ name: "photo.jpg", base64: tinyJpegBase64 })
    ).rejects.toThrow();
  });
});

describe("profile.getImageUrl", () => {
  it("returns null when no profile image exists", async () => {
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.getImageUrl();
    expect(result).toBeNull();
  });

  it("returns signed URL when profile image exists", async () => {
    mockProfile = {
      id: 1,
      userId: 1,
      profileImageKey: "avatars/1/test.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.getImageUrl();
    expect(result).toContain("/api/files/avatars/1/test.jpg");
  });

  it("rejects unauthenticated requests", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.profile.getImageUrl()).rejects.toThrow();
  });
});

describe("profile.get with profileImageKey", () => {
  it("returns profileImageKey when set", async () => {
    mockProfile = {
      id: 1,
      userId: 1,
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      numberOfChildren: 0,
      childrenAges: null,
      employmentStatus: null,
      incomeRange: null,
      ownsApartment: false,
      hasActiveMortgage: false,
      numberOfVehicles: 0,
      hasExtremeSports: false,
      hasSpecialHealthConditions: false,
      healthConditionsDetails: null,
      hasPets: false,
      profileImageKey: "avatars/1/photo.jpg",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.get();
    expect(result!.profileImageKey).toBe("avatars/1/photo.jpg");
  });

  it("returns null profileImageKey when not set", async () => {
    mockProfile = {
      id: 1,
      userId: 1,
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      numberOfChildren: 0,
      childrenAges: null,
      employmentStatus: null,
      incomeRange: null,
      ownsApartment: false,
      hasActiveMortgage: false,
      numberOfVehicles: 0,
      hasExtremeSports: false,
      hasSpecialHealthConditions: false,
      healthConditionsDetails: null,
      hasPets: false,
      profileImageKey: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const caller = appRouter.createCaller(makeAuthCtx());
    const result = await caller.profile.get();
    expect(result!.profileImageKey).toBeNull();
  });
});

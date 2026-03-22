import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  appendFilesToAnalysis,
  createAnalysis,
  resetAnalysisForRetry,
  deleteInFlightAnalysesForUser,
} from "./db";
import { policyAnalysisWorker } from "./policyAnalysisWorker";

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "policies/test/file.pdf",
    url: "https://storage.example.com/policies/test/file.pdf",
  }),
  storageGet: vi.fn().mockImplementation(async (fileKey: string) => ({
    key: fileKey,
    url: `https://storage.example.com/${fileKey}?token=signed`,
  })),
  storageDelete: vi.fn().mockResolvedValue(undefined),
  sanitizeFilename: vi
    .fn()
    .mockImplementation((name: string) =>
      name.replace(/[^a-zA-Z0-9._-]/g, "_")
    ),
  verifyFileSignature: vi.fn().mockReturnValue(false),
}));

// Mock db
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  createAnalysis: vi.fn().mockResolvedValue("test-session"),
  getAnalysisBySessionId: vi.fn().mockImplementation((sessionId: string) => {
    if (sessionId === "existing-session") {
      return {
        sessionId: "existing-session",
        userId: 1,
        files: [
          {
            name: "test.pdf",
            size: 1024,
            fileKey: "policies/existing-session/test.pdf",
          },
        ],
        status: "completed",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        startedAt: new Date("2026-03-01T08:01:00.000Z"),
        lastHeartbeatAt: new Date("2026-03-01T08:02:00.000Z"),
        updatedAt: new Date("2026-03-01T08:03:00.000Z"),
        attemptCount: 1,
        analysisResult: {
          coverages: [
            {
              id: "1",
              title: "ביקור רופא מומחה",
              category: "רפואה משלימה",
              limit: "3 פעמים בשנה",
              details: "ביקור אצל רופא מומחה",
              eligibility: "כל המבוטחים",
              copay: '50 ש"ח',
              maxReimbursement: '500 ש"ח',
              exclusions: "אין",
              waitingPeriod: "3 חודשים",
            },
          ],
          generalInfo: {
            policyName: "פוליסת בריאות כללית",
            insurerName: "חברת ביטוח לדוגמה",
            policyNumber: "12345",
            policyType: "ביטוח בריאות",
            premiumPaymentPeriod: "monthly",
            monthlyPremium: '150 ש"ח',
            annualPremium: '1,800 ש"ח',
            startDate: "01/01/2025",
            endDate: "31/12/2025",
            importantNotes: ["תקופת אכשרה 3 חודשים"],
            fineprint: ["הפוליסה כפופה לתנאים כלליים"],
          },
          summary: "פוליסת בריאות כללית עם כיסוי לרפואה משלימה",
        },
        errorMessage: null,
      };
    }
    if (sessionId === "no-analysis") {
      return {
        sessionId: "no-analysis",
        userId: 1,
        files: [
          {
            name: "test.pdf",
            size: 1024,
            fileKey: "policies/no-analysis/test.pdf",
          },
        ],
        status: "pending",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        startedAt: null,
        lastHeartbeatAt: null,
        updatedAt: new Date("2026-03-01T08:00:00.000Z"),
        attemptCount: 0,
        analysisResult: null,
        errorMessage: null,
      };
    }
    if (sessionId === "processing-session") {
      return {
        sessionId: "processing-session",
        userId: 1,
        files: [
          {
            name: "processing.pdf",
            size: 1024,
            fileKey: "policies/processing-session/test.pdf",
          },
        ],
        status: "processing",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        startedAt: new Date("2026-03-01T08:01:00.000Z"),
        lastHeartbeatAt: new Date("2026-03-01T08:02:00.000Z"),
        updatedAt: new Date("2026-03-01T08:03:00.000Z"),
        attemptCount: 2,
        analysisResult: null,
        errorMessage: null,
      };
    }
    if (sessionId === "error-session") {
      return {
        sessionId: "error-session",
        userId: 1,
        files: [
          {
            name: "error.pdf",
            size: 1024,
            fileKey: "policies/error-session/test.pdf",
          },
        ],
        status: "error",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        startedAt: new Date("2026-03-01T08:01:00.000Z"),
        lastHeartbeatAt: new Date("2026-03-01T08:02:00.000Z"),
        updatedAt: new Date("2026-03-01T08:03:00.000Z"),
        attemptCount: 3,
        analysisResult: null,
        errorMessage: "Processing failed",
      };
    }
    return null;
  }),
  appendFilesToAnalysis: vi.fn().mockResolvedValue([
    {
      name: "test.pdf",
      size: 1024,
      fileKey: "policies/existing-session/test.pdf",
    },
    {
      name: "extra.pdf",
      size: 2048,
      fileKey: "policies/existing-session/extra.pdf",
    },
  ]),
  updateAnalysisStatus: vi.fn(),
  resetAnalysisForRetry: vi.fn().mockResolvedValue(undefined),
  addChatMessage: vi.fn(),
  getChatHistory: vi.fn().mockResolvedValue([]),
  deleteInFlightAnalysesForUser: vi
    .fn()
    .mockResolvedValue({ deletedSessionIds: [] }),
}));

vi.mock("./policyAnalysisWorker", () => ({
  policyAnalysisWorker: {
    nudge: vi.fn(),
  },
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      role: "user" as const,
      loginMethod: "oauth",
      lastSignedIn: new Date(),
      createdAt: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.mocked(createAnalysis).mockClear();
  vi.mocked(appendFilesToAnalysis).mockClear();
  vi.mocked(policyAnalysisWorker.nudge).mockClear();
  vi.mocked(resetAnalysisForRetry).mockClear();
  vi.mocked(deleteInFlightAnalysesForUser).mockClear();
  vi.mocked(deleteInFlightAnalysesForUser).mockResolvedValue({
    deletedSessionIds: [],
  });
});

describe("policy.upload", () => {
  it("rejects unauthenticated requests", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.policy.upload({
        files: [
          {
            name: "test.pdf",
            size: 1024,
            base64: Buffer.from("test").toString("base64"),
          },
        ],
      })
    ).rejects.toThrow();
  });

  it("accepts files and returns a sessionId", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.upload({
      files: [
        {
          name: "test-policy.pdf",
          size: 1024,
          base64: Buffer.from("fake pdf content").toString("base64"),
        },
      ],
    });

    expect(result.sessionId).toBeDefined();
    expect(typeof result.sessionId).toBe("string");
    expect(result.sessionId.length).toBeGreaterThan(0);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].name).toBe("test-policy.pdf");
    expect(result.files[0].fileKey).toBeDefined();
    expect(createAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        status: "pending",
      })
    );
    expect(policyAnalysisWorker.nudge).toHaveBeenCalled();
  });

  it("handles multiple files", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.upload({
      files: [
        {
          name: "policy1.pdf",
          size: 1024,
          base64: Buffer.from("pdf1").toString("base64"),
        },
        {
          name: "policy2.pdf",
          size: 2048,
          base64: Buffer.from("pdf2").toString("base64"),
        },
      ],
    });

    expect(result.files).toHaveLength(2);
  });

  it("adds files to an existing session when sessionId is provided", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.upload({
      sessionId: "existing-session",
      files: [
        {
          name: "extra.pdf",
          size: 2048,
          base64: Buffer.from("extra pdf content").toString("base64"),
        },
      ],
    });

    expect(result.sessionId).toBe("existing-session");
    expect(result.totalFileCount).toBe(2);
    expect(createAnalysis).not.toHaveBeenCalled();
    expect(appendFilesToAnalysis).toHaveBeenCalledWith(
      "existing-session",
      1,
      expect.arrayContaining([
        expect.objectContaining({
          name: "extra.pdf",
        }),
      ])
    );
    expect(policyAnalysisWorker.nudge).toHaveBeenCalled();
  });

  it("rejects adding files while the existing session is processing", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.policy.upload({
        sessionId: "processing-session",
        files: [
          {
            name: "extra.pdf",
            size: 2048,
            base64: Buffer.from("extra pdf content").toString("base64"),
          },
        ],
      })
    ).rejects.toThrow("אי אפשר להוסיף קבצים בזמן שהסריקה בעיבוד");

    expect(appendFilesToAnalysis).not.toHaveBeenCalled();
    expect(createAnalysis).not.toHaveBeenCalled();
  });
});

describe("policy.analyze", () => {
  it("returns completed analysis immediately when already ready", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.analyze({
      sessionId: "existing-session",
    });

    expect(result.status).toBe("completed");
    expect(result.result?.generalInfo.policyName).toBe("פוליסת בריאות כללית");
    expect(policyAnalysisWorker.nudge).not.toHaveBeenCalled();
  });

  it("nudges the worker for pending sessions", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.analyze({ sessionId: "no-analysis" });

    expect(result.status).toBe("queued");
    expect(result.result).toBeNull();
    expect(policyAnalysisWorker.nudge).toHaveBeenCalled();
  });

  it("resets failed sessions before requeueing", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.analyze({ sessionId: "error-session" });

    expect(result.status).toBe("queued");
    expect(resetAnalysisForRetry).toHaveBeenCalledWith("error-session");
    expect(policyAnalysisWorker.nudge).toHaveBeenCalled();
  });
});

describe("policy.clearInFlightQueue", () => {
  it("rejects unauthenticated requests", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.policy.clearInFlightQueue()).rejects.toThrow();
  });

  it("deletes in-flight analyses for the user", async () => {
    vi.mocked(deleteInFlightAnalysesForUser).mockResolvedValueOnce({
      deletedSessionIds: ["s1", "s2"],
    });
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.policy.clearInFlightQueue();
    expect(result.deletedCount).toBe(2);
    expect(result.deletedSessionIds).toEqual(["s1", "s2"]);
    expect(deleteInFlightAnalysesForUser).toHaveBeenCalledWith(1);
  });
});

describe("policy.getAnalysis", () => {
  it("returns analysis for existing session", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getAnalysis({
      sessionId: "existing-session",
    });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("existing-session");
    expect(result!.status).toBe("completed");
    expect(result!.attemptCount).toBe(1);
    expect(result!.startedAt).toEqual(new Date("2026-03-01T08:01:00.000Z"));
    expect(result!.lastHeartbeatAt).toEqual(
      new Date("2026-03-01T08:02:00.000Z")
    );
    expect(result!.result).not.toBeNull();
    expect(result!.result!.coverages).toHaveLength(1);
    expect(result!.result!.coverages[0].title).toBe("ביקור רופא מומחה");
    expect(result!.result!.generalInfo.policyName).toBe("פוליסת בריאות כללית");
  });

  it("returns null for non-existing session", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getAnalysis({
      sessionId: "non-existing",
    });
    expect(result).toBeNull();
  });
});

describe("policy.getSecureFileUrl", () => {
  it("returns a signed file URL for a file in the user's analysis", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getSecureFileUrl({
      sessionId: "existing-session",
      fileKey: "policies/existing-session/test.pdf",
    });

    expect(result.url).toBe(
      "https://storage.example.com/policies/existing-session/test.pdf?token=signed"
    );
  });
});

describe("policy.getChatHistory", () => {
  it("returns empty array for new session", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getChatHistory({
      sessionId: "existing-session",
    });
    expect(result).toEqual([]);
  });
});

describe("policy.chat", () => {
  it("rejects unauthenticated chat requests", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.policy.chat({ sessionId: "non-existing", message: "שאלה" })
    ).rejects.toThrow();
  });

  it("throws error when no analysis exists (authenticated)", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.policy.chat({ sessionId: "non-existing", message: "שאלה" })
    ).rejects.toThrow();
  });

  it("throws error when analysis has no result (authenticated)", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.policy.chat({ sessionId: "no-analysis", message: "שאלה" })
    ).rejects.toThrow("No analysis found for this session");
  });
});

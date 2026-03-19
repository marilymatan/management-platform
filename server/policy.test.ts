import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "policies/test/file.pdf",
    url: "https://storage.example.com/policies/test/file.pdf",
  }),
}));

// Mock db
vi.mock("./db", () => ({
  createAnalysis: vi.fn().mockResolvedValue("test-session"),
  getAnalysisBySessionId: vi.fn().mockImplementation((sessionId: string) => {
    if (sessionId === "existing-session") {
      return {
        sessionId: "existing-session",
        files: [{ name: "test.pdf", size: 1024, url: "https://storage.example.com/test.pdf" }],
        status: "completed",
        analysisResult: {
          coverages: [
            {
              id: "1",
              title: "ביקור רופא מומחה",
              category: "רפואה משלימה",
              limit: "3 פעמים בשנה",
              details: "ביקור אצל רופא מומחה",
              eligibility: "כל המבוטחים",
              copay: "50 ש\"ח",
              maxReimbursement: "500 ש\"ח",
              exclusions: "אין",
              waitingPeriod: "3 חודשים",
            },
          ],
          generalInfo: {
            policyName: "פוליסת בריאות כללית",
            insurerName: "חברת ביטוח לדוגמה",
            policyNumber: "12345",
            policyType: "ביטוח בריאות",
            monthlyPremium: "150 ש\"ח",
            annualPremium: "1,800 ש\"ח",
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
        files: [{ name: "test.pdf", size: 1024, url: "https://storage.example.com/test.pdf" }],
        status: "pending",
        analysisResult: null,
        errorMessage: null,
      };
    }
    return null;
  }),
  updateAnalysisStatus: vi.fn(),
  addChatMessage: vi.fn(),
  getChatHistory: vi.fn().mockResolvedValue([]),
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

describe("policy.upload", () => {
  it("rejects unauthenticated requests", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.policy.upload({
        files: [{ name: "test.pdf", size: 1024, base64: Buffer.from("test").toString("base64") }],
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
  });

  it("handles multiple files", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.upload({
      files: [
        { name: "policy1.pdf", size: 1024, base64: Buffer.from("pdf1").toString("base64") },
        { name: "policy2.pdf", size: 2048, base64: Buffer.from("pdf2").toString("base64") },
      ],
    });

    expect(result.files).toHaveLength(2);
  });
});

describe("policy.getAnalysis", () => {
  it("returns analysis for existing session", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getAnalysis({ sessionId: "existing-session" });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("existing-session");
    expect(result!.status).toBe("completed");
    expect(result!.result).not.toBeNull();
    expect(result!.result!.coverages).toHaveLength(1);
    expect(result!.result!.coverages[0].title).toBe("ביקור רופא מומחה");
    expect(result!.result!.generalInfo.policyName).toBe("פוליסת בריאות כללית");
  });

  it("returns null for non-existing session", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getAnalysis({ sessionId: "non-existing" });
    expect(result).toBeNull();
  });
});

describe("policy.getChatHistory", () => {
  it("returns empty array for new session", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.policy.getChatHistory({ sessionId: "existing-session" });
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

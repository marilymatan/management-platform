import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audit } from "./auditLog";
import {
  claimNextPendingAnalysis,
  completeAnalysis,
  failAnalysis,
  heartbeatAnalysis,
  requeueAnalysis,
} from "./db";
import { analyzePolicySession } from "./policyAnalysisService";
import { policyAnalysisWorker } from "./policyAnalysisWorker";

vi.mock("./db", () => ({
  claimNextPendingAnalysis: vi.fn(),
  completeAnalysis: vi.fn().mockResolvedValue(undefined),
  failAnalysis: vi.fn().mockResolvedValue(undefined),
  heartbeatAnalysis: vi.fn().mockResolvedValue(undefined),
  requeueAnalysis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./policyAnalysisService", () => ({
  analyzePolicySession: vi.fn(),
}));

vi.mock("./auditLog", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

const queuedAnalysis = {
  sessionId: "worker-session",
  userId: 42,
  attemptCount: 1,
  files: [{ name: "policy.pdf", fileKey: "policies/worker-session/file.pdf" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  policyAnalysisWorker.stop();
});

afterEach(() => {
  policyAnalysisWorker.stop();
});

describe("policyAnalysisWorker", () => {
  it("completes queued analyses and audits the result", async () => {
    vi.mocked(claimNextPendingAnalysis)
      .mockResolvedValueOnce(queuedAnalysis as any)
      .mockResolvedValueOnce(null);
    vi.mocked(analyzePolicySession).mockResolvedValue({
      analysisResult: {
        coverages: [],
        generalInfo: {
          policyName: "פוליסה",
          insurerName: "מבטח",
          policyNumber: "123",
          policyType: "בריאות",
          insuranceCategory: "health",
          monthlyPremium: "100",
          annualPremium: "1200",
          startDate: "01/01/2026",
          endDate: "31/12/2026",
          importantNotes: [],
          fineprint: [],
        },
        summary: "סיכום",
        duplicateCoverages: [],
      },
      insuranceCategory: "health",
    } as any);

    policyAnalysisWorker.start();

    await vi.waitFor(() => {
      expect(completeAnalysis).toHaveBeenCalledWith(
        "worker-session",
        expect.stringContaining("policy-worker-"),
        expect.objectContaining({ insuranceCategory: "health" })
      );
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: "create_analysis",
        resourceId: "worker-session",
      })
    );
  });

  it("requeues retryable failures below the max attempts", async () => {
    vi.mocked(claimNextPendingAnalysis)
      .mockResolvedValueOnce(queuedAnalysis as any)
      .mockResolvedValueOnce(null);
    vi.mocked(analyzePolicySession).mockRejectedValue(new Error("Transient network issue"));

    policyAnalysisWorker.start();

    await vi.waitFor(() => {
      expect(requeueAnalysis).toHaveBeenCalledWith(
        "worker-session",
        expect.stringContaining("policy-worker-"),
        expect.any(Date)
      );
    });
    expect(failAnalysis).not.toHaveBeenCalled();
  });

  it("fails non-retryable analyses immediately", async () => {
    vi.mocked(claimNextPendingAnalysis)
      .mockResolvedValueOnce({ ...queuedAnalysis, attemptCount: 3 } as any)
      .mockResolvedValueOnce(null);
    vi.mocked(analyzePolicySession).mockRejectedValue(new Error("לא נמצאו קבצים לעיבוד"));

    policyAnalysisWorker.start();

    await vi.waitFor(() => {
      expect(failAnalysis).toHaveBeenCalledWith(
        "worker-session",
        expect.stringContaining("policy-worker-"),
        "לא נמצאו קבצים לעיבוד"
      );
    });
    expect(requeueAnalysis).not.toHaveBeenCalled();
  });
});

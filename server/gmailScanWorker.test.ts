import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audit } from "./auditLog";
import { clearUserGmailScanResults, scanGmailForInvoices } from "./gmail";
import {
  claimNextPendingGmailScanJob,
  completeGmailScanJob,
  failGmailScanJob,
  requeueGmailScanJob,
} from "./gmailScanQueue";
import { gmailScanWorker } from "./gmailScanWorker";

vi.mock("./gmailScanQueue", () => ({
  claimNextPendingGmailScanJob: vi.fn(),
  completeGmailScanJob: vi.fn().mockResolvedValue(undefined),
  failGmailScanJob: vi.fn().mockResolvedValue(undefined),
  heartbeatGmailScanJob: vi.fn().mockResolvedValue(undefined),
  requeueGmailScanJob: vi.fn().mockResolvedValue(undefined),
  summarizeGmailScanResult: vi.fn((result) => ({
    scanned: result.scanned,
    found: result.found,
    saved: result.saved,
    discoveriesFound: result.discoveriesFound,
    discoveriesSaved: result.discoveriesSaved,
  })),
}));

vi.mock("./gmail", () => ({
  clearUserGmailScanResults: vi.fn().mockResolvedValue(undefined),
  scanGmailForInvoices: vi.fn(),
}));

vi.mock("./auditLog", () => ({
  audit: vi.fn().mockResolvedValue(undefined),
}));

const queuedJob = {
  jobId: "gmail-job-1",
  userId: 42,
  daysBack: 30,
  clearExisting: false,
  attemptCount: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  gmailScanWorker.stop();
});

afterEach(() => {
  gmailScanWorker.stop();
});

describe("gmailScanWorker", () => {
  it("completes queued scans and audits the result", async () => {
    vi.mocked(claimNextPendingGmailScanJob)
      .mockResolvedValueOnce(queuedJob as any)
      .mockResolvedValueOnce(null);
    vi.mocked(scanGmailForInvoices).mockResolvedValue({
      scanned: 12,
      found: 4,
      saved: 3,
      discoveriesFound: 2,
      discoveriesSaved: 2,
      invoices: [],
      discoveries: [],
    });

    gmailScanWorker.start();

    await vi.waitFor(() => {
      expect(completeGmailScanJob).toHaveBeenCalledWith(
        "gmail-job-1",
        expect.stringContaining("gmail-scan-worker-"),
        {
          scanned: 12,
          found: 4,
          saved: 3,
          discoveriesFound: 2,
          discoveriesSaved: 2,
        },
      );
    });

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: "scan_gmail",
        resourceId: "gmail-job-1",
      }),
    );
  });

  it("clears existing results before processing a rescan job", async () => {
    vi.mocked(claimNextPendingGmailScanJob)
      .mockResolvedValueOnce({ ...queuedJob, clearExisting: true } as any)
      .mockResolvedValueOnce(null);
    vi.mocked(scanGmailForInvoices).mockResolvedValue({
      scanned: 3,
      found: 1,
      saved: 1,
      discoveriesFound: 1,
      discoveriesSaved: 1,
      invoices: [],
      discoveries: [],
    });

    gmailScanWorker.start();

    await vi.waitFor(() => {
      expect(clearUserGmailScanResults).toHaveBeenCalledWith(42);
    });

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: "clear_invoices",
        resourceId: "gmail-job-1",
      }),
    );
  });

  it("requeues retryable failures below the max attempts", async () => {
    vi.mocked(claimNextPendingGmailScanJob)
      .mockResolvedValueOnce(queuedJob as any)
      .mockResolvedValueOnce(null);
    vi.mocked(scanGmailForInvoices).mockRejectedValue(
      new Error("Transient Gmail API failure"),
    );

    gmailScanWorker.start();

    await vi.waitFor(() => {
      expect(requeueGmailScanJob).toHaveBeenCalledWith(
        "gmail-job-1",
        expect.stringContaining("gmail-scan-worker-"),
        expect.any(Date),
      );
    });

    expect(failGmailScanJob).not.toHaveBeenCalled();
  });

  it("fails non-retryable scans immediately", async () => {
    vi.mocked(claimNextPendingGmailScanJob)
      .mockResolvedValueOnce({ ...queuedJob, attemptCount: 3 } as any)
      .mockResolvedValueOnce(null);
    vi.mocked(scanGmailForInvoices).mockRejectedValue(
      new Error("No Gmail accounts connected"),
    );

    gmailScanWorker.start();

    await vi.waitFor(() => {
      expect(failGmailScanJob).toHaveBeenCalledWith(
        "gmail-job-1",
        expect.stringContaining("gmail-scan-worker-"),
        "No Gmail accounts connected",
      );
    });

    expect(requeueGmailScanJob).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: "scan_gmail",
        resourceId: "gmail-job-1",
        status: "error",
      }),
    );
  });
});

import { nanoid } from "nanoid";
import { audit } from "./auditLog";
import { clearUserGmailScanResults, scanGmailForInvoices } from "./gmail";
import {
  claimNextPendingGmailScanJob,
  completeGmailScanJob,
  failGmailScanJob,
  heartbeatGmailScanJob,
  requeueGmailScanJob,
  summarizeGmailScanResult,
} from "./gmailScanQueue";

const GMAIL_SCAN_WORKER_POLL_MS = 3000;
const GMAIL_SCAN_WORKER_HEARTBEAT_MS = 5000;
const GMAIL_SCAN_WORKER_STALE_MS = 60_000;
const GMAIL_SCAN_WORKER_MAX_ATTEMPTS = 3;

function getRetryDelayMs(attemptCount: number) {
  return Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, attemptCount - 1));
}

function isRetryableGmailScanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ![
    "No Gmail accounts connected",
    "Database not available",
  ].some((pattern) => message.includes(pattern));
}

class GmailScanWorker {
  private readonly workerId = `gmail-scan-worker-${process.pid}-${nanoid(8)}`;
  private started = false;
  private isDrainingQueue = false;
  private pollTimer: NodeJS.Timeout | null = null;

  start() {
    if (this.started) {
      return;
    }
    this.started = true;
    this.pollTimer = setInterval(() => {
      void this.drainQueue();
    }, GMAIL_SCAN_WORKER_POLL_MS);
    void this.drainQueue();
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.started = false;
  }

  nudge() {
    if (!this.started) {
      return;
    }
    void this.drainQueue();
  }

  private async drainQueue() {
    if (!this.started || this.isDrainingQueue) {
      return;
    }

    this.isDrainingQueue = true;
    try {
      while (true) {
        const job = await claimNextPendingGmailScanJob(
          this.workerId,
          new Date(Date.now() - GMAIL_SCAN_WORKER_STALE_MS),
        );
        if (!job) {
          break;
        }
        await this.processJob(job);
      }
    } catch (error) {
      console.error("[GmailScanWorker] Failed to drain queue:", error);
    } finally {
      this.isDrainingQueue = false;
    }
  }

  private async processJob(job: {
    jobId: string;
    userId: number;
    daysBack: number;
    clearExisting: boolean;
    attemptCount: number;
  }) {
    const heartbeatTimer = setInterval(() => {
      void heartbeatGmailScanJob(job.jobId, this.workerId).catch((error) => {
        console.error("[GmailScanWorker] Heartbeat failed:", error);
      });
    }, GMAIL_SCAN_WORKER_HEARTBEAT_MS);

    try {
      if (job.clearExisting) {
        await clearUserGmailScanResults(job.userId);
        await audit({
          userId: job.userId,
          action: "clear_invoices",
          resource: "invoice",
          resourceId: job.jobId,
          details: JSON.stringify({ source: "gmail_scan_worker" }),
        });
      }

      const result = await scanGmailForInvoices(job.userId, job.daysBack);
      const summary = summarizeGmailScanResult(result);

      await completeGmailScanJob(job.jobId, this.workerId, summary);
      await audit({
        userId: job.userId,
        action: "scan_gmail",
        resource: "gmail",
        resourceId: job.jobId,
        details: JSON.stringify({
          daysBack: job.daysBack,
          clearExisting: job.clearExisting,
          ...summary,
        }),
      });
    } catch (error) {
      const retryable =
        job.attemptCount < GMAIL_SCAN_WORKER_MAX_ATTEMPTS &&
        isRetryableGmailScanError(error);

      if (retryable) {
        await requeueGmailScanJob(
          job.jobId,
          this.workerId,
          new Date(Date.now() + getRetryDelayMs(job.attemptCount)),
        );
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        await failGmailScanJob(job.jobId, this.workerId, message);
        await audit({
          userId: job.userId,
          action: "scan_gmail",
          resource: "gmail",
          resourceId: job.jobId,
          details: JSON.stringify({
            daysBack: job.daysBack,
            clearExisting: job.clearExisting,
          }),
          status: "error",
        });
      }
    } finally {
      clearInterval(heartbeatTimer);
    }
  }
}

export const gmailScanWorker = new GmailScanWorker();

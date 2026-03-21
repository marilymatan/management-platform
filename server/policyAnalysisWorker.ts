import { nanoid } from "nanoid";
import { audit } from "./auditLog";
import {
  claimNextPendingAnalysis,
  completeAnalysis,
  failAnalysis,
  heartbeatAnalysis,
  requeueAnalysis,
} from "./db";
import { analyzePolicySession } from "./policyAnalysisService";

const ANALYSIS_WORKER_POLL_MS = 3000;
const ANALYSIS_WORKER_HEARTBEAT_MS = 5000;
const ANALYSIS_WORKER_STALE_MS = 60_000;
const ANALYSIS_WORKER_MAX_ATTEMPTS = 3;

function getRetryDelayMs(attemptCount: number) {
  return Math.min(5 * 60_000, 15_000 * 2 ** Math.max(0, attemptCount - 1));
}

function isRetryableAnalysisError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ![
    "לא נמצאו קבצים לעיבוד",
    "Path traversal detected",
    "Database not available",
  ].some((pattern) => message.includes(pattern));
}

class PolicyAnalysisWorker {
  private readonly workerId = `policy-worker-${process.pid}-${nanoid(8)}`;
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
    }, ANALYSIS_WORKER_POLL_MS);
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
        const analysis = await claimNextPendingAnalysis(
          this.workerId,
          new Date(Date.now() - ANALYSIS_WORKER_STALE_MS)
        );
        if (!analysis) {
          break;
        }
        const typed = analysis as {
          sessionId: string;
          userId?: number | null;
          attemptCount: number;
          files: Array<{ name: string; fileKey?: string; url?: string }>;
        };
        if (!typed.sessionId) {
          console.error("[PolicyWorker] Claimed analysis missing sessionId, skipping:", Object.keys(analysis));
          break;
        }
        if (typed.attemptCount > ANALYSIS_WORKER_MAX_ATTEMPTS * 2) {
          console.error("[PolicyWorker] Analysis exceeded safety limit:", typed.sessionId, "attempts:", typed.attemptCount);
          try {
            await failAnalysis(typed.sessionId, this.workerId, "Exceeded maximum retry attempts");
          } catch { /* already broken, move on */ }
          continue;
        }
        try {
          await this.processAnalysis(typed);
        } catch (error) {
          console.error("[PolicyWorker] processAnalysis error:", error);
        }
      }
    } catch (error) {
      console.error("[PolicyWorker] Failed to drain queue:", error);
    } finally {
      this.isDrainingQueue = false;
    }
  }

  private async processAnalysis(analysis: {
    sessionId: string;
    userId?: number | null;
    attemptCount: number;
    files: Array<{ name: string; fileKey?: string; url?: string }>;
  }) {
    const heartbeatTimer = setInterval(() => {
      void heartbeatAnalysis(analysis.sessionId, this.workerId).catch((error) => {
        console.error("[PolicyWorker] Heartbeat failed:", error);
      });
    }, ANALYSIS_WORKER_HEARTBEAT_MS);

    try {
      const result = await analyzePolicySession({
        ...analysis,
        workerId: this.workerId,
      });
      await completeAnalysis(analysis.sessionId, this.workerId, {
        analysisResult: result.analysisResult,
        insuranceCategory: result.insuranceCategory,
      });
      if (analysis.userId) {
        await audit({
          userId: analysis.userId,
          action: "create_analysis",
          resource: "analysis",
          resourceId: analysis.sessionId,
        });
      }
    } catch (error) {
      try {
        const retryable = analysis.attemptCount < ANALYSIS_WORKER_MAX_ATTEMPTS && isRetryableAnalysisError(error);
        if (retryable) {
          await requeueAnalysis(
            analysis.sessionId,
            this.workerId,
            new Date(Date.now() + getRetryDelayMs(analysis.attemptCount))
          );
        } else {
          const message = error instanceof Error ? error.message : "Unknown error";
          await failAnalysis(analysis.sessionId, this.workerId, message);
        }
      } catch (statusError) {
        console.error("[PolicyWorker] Failed to update analysis status:", analysis.sessionId, statusError);
      }
    } finally {
      clearInterval(heartbeatTimer);
    }
  }
}

export const policyAnalysisWorker = new PolicyAnalysisWorker();

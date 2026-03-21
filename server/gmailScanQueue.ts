import { nanoid } from "nanoid";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { gmailScanJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { decryptField, decryptJson, encryptField, encryptJson } from "./encryption";
import type { ScanResult } from "./gmail";

export type GmailScanJobStatus = "pending" | "processing" | "completed" | "error";

export type GmailScanJobSummary = Pick<
  ScanResult,
  "scanned" | "found" | "saved" | "discoveriesFound" | "discoveriesSaved"
>;

export type GmailScanJobRecord = Omit<
  typeof gmailScanJobs.$inferSelect,
  "result" | "errorMessage"
> & {
  result: GmailScanJobSummary | null;
  errorMessage: string | null;
};

function decryptGmailScanJob(
  row: typeof gmailScanJobs.$inferSelect | null | undefined,
): GmailScanJobRecord | null {
  if (!row) return null;
  return {
    ...row,
    result: row.result ? decryptJson<GmailScanJobSummary>(row.result) : null,
    errorMessage: row.errorMessage ? decryptField(row.errorMessage) : null,
  };
}

export function summarizeGmailScanResult(
  result: ScanResult,
): GmailScanJobSummary {
  return {
    scanned: result.scanned,
    found: result.found,
    saved: result.saved,
    discoveriesFound: result.discoveriesFound,
    discoveriesSaved: result.discoveriesSaved,
  };
}

export async function createGmailScanJob(params: {
  userId: number;
  daysBack: number;
  clearExisting?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const jobId = nanoid(16);
  await db.insert(gmailScanJobs).values({
    jobId,
    userId: params.userId,
    daysBack: params.daysBack,
    clearExisting: params.clearExisting ?? false,
    status: "pending",
  });

  return getGmailScanJobByJobId(params.userId, jobId);
}

export async function getActiveGmailScanJob(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [job] = await db
    .select()
    .from(gmailScanJobs)
    .where(
      and(
        eq(gmailScanJobs.userId, userId),
        or(
          eq(gmailScanJobs.status, "pending"),
          eq(gmailScanJobs.status, "processing"),
        ),
      ),
    )
    .orderBy(desc(gmailScanJobs.createdAt))
    .limit(1);

  return decryptGmailScanJob(job);
}

export async function getLatestGmailScanJob(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [job] = await db
    .select()
    .from(gmailScanJobs)
    .where(eq(gmailScanJobs.userId, userId))
    .orderBy(desc(gmailScanJobs.createdAt))
    .limit(1);

  return decryptGmailScanJob(job);
}

export async function getGmailScanJobByJobId(userId: number, jobId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [job] = await db
    .select()
    .from(gmailScanJobs)
    .where(
      and(
        eq(gmailScanJobs.userId, userId),
        eq(gmailScanJobs.jobId, jobId),
      ),
    )
    .limit(1);

  return decryptGmailScanJob(job);
}

export function buildClaimNextPendingGmailScanJobCandidateQuery(
  now: Date,
  staleBefore: Date,
) {
  return sql`
    SELECT ${gmailScanJobs.id}
    FROM ${gmailScanJobs}
    WHERE (
      ${gmailScanJobs.status} = ${"pending"}
      AND (${gmailScanJobs.nextRetryAt} IS NULL OR ${gmailScanJobs.nextRetryAt} <= ${now})
    ) OR (
      ${gmailScanJobs.status} = ${"processing"}
      AND (${gmailScanJobs.lastHeartbeatAt} IS NULL OR ${gmailScanJobs.lastHeartbeatAt} <= ${staleBefore})
    )
    ORDER BY ${gmailScanJobs.createdAt} ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `;
}

export function buildClaimNextPendingGmailScanJobUpdateQuery(
  candidateId: number,
  workerId: string,
  now: Date,
) {
  return sql`
    UPDATE ${gmailScanJobs}
    SET
      "status" = ${"processing"},
      "attempt_count" = "attempt_count" + 1,
      "locked_by" = ${workerId},
      "last_heartbeat_at" = ${now},
      "started_at" = COALESCE("started_at", ${now}),
      "completed_at" = NULL,
      "next_retry_at" = NULL,
      "error_message" = NULL,
      "updated_at" = ${now}
    WHERE ${gmailScanJobs.id} = ${candidateId}
    RETURNING *
  `;
}

export async function claimNextPendingGmailScanJob(
  workerId: string,
  staleBefore: Date,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  const row = await db.transaction(async (tx) => {
    const candidateResult = await tx.execute(
      buildClaimNextPendingGmailScanJobCandidateQuery(now, staleBefore),
    );
    const candidate = candidateResult.rows[0] as { id: number } | undefined;
    if (!candidate) {
      return null;
    }
    const updateResult = await tx.execute(
      buildClaimNextPendingGmailScanJobUpdateQuery(candidate.id, workerId, now),
    );
    return updateResult.rows[0] as typeof gmailScanJobs.$inferSelect | undefined;
  });
  return decryptGmailScanJob(row ?? null);
}

export async function heartbeatGmailScanJob(jobId: string, workerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(gmailScanJobs)
    .set({
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gmailScanJobs.jobId, jobId),
        eq(gmailScanJobs.lockedBy, workerId),
        eq(gmailScanJobs.status, "processing"),
      ),
    );
}

export async function completeGmailScanJob(
  jobId: string,
  workerId: string,
  resultSummary: GmailScanJobSummary,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  await db
    .update(gmailScanJobs)
    .set({
      status: "completed",
      result: encryptJson(resultSummary),
      errorMessage: null,
      lockedBy: null,
      lastHeartbeatAt: now,
      completedAt: now,
      nextRetryAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(gmailScanJobs.jobId, jobId),
        eq(gmailScanJobs.lockedBy, workerId),
      ),
    );
}

export async function requeueGmailScanJob(
  jobId: string,
  workerId: string,
  nextRetryAt: Date,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(gmailScanJobs)
    .set({
      status: "pending",
      lockedBy: null,
      lastHeartbeatAt: null,
      nextRetryAt,
      errorMessage: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gmailScanJobs.jobId, jobId),
        eq(gmailScanJobs.lockedBy, workerId),
      ),
    );
}

export async function failGmailScanJob(
  jobId: string,
  workerId: string,
  errorMessage: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const now = new Date();
  await db
    .update(gmailScanJobs)
    .set({
      status: "error",
      errorMessage: encryptField(errorMessage),
      lockedBy: null,
      lastHeartbeatAt: now,
      nextRetryAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(gmailScanJobs.jobId, jobId),
        eq(gmailScanJobs.lockedBy, workerId),
      ),
    );
}

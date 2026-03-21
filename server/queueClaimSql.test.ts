import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildClaimNextPendingAnalysisCandidateQuery,
  buildClaimNextPendingAnalysisUpdateQuery,
} from "./db";
import {
  buildClaimNextPendingGmailScanJobCandidateQuery,
  buildClaimNextPendingGmailScanJobUpdateQuery,
} from "./gmailScanQueue";

function normalizeSql(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

describe("queue claim SQL", () => {
  const dialect = new PgDialect();
  const now = new Date("2026-03-21T21:37:12.931Z");
  const staleBefore = new Date("2026-03-21T21:36:12.931Z");

  it("parameterizes policy analysis candidate statuses", () => {
    const rendered = dialect.sqlToQuery(
      buildClaimNextPendingAnalysisCandidateQuery(now, staleBefore),
    );
    const sqlText = normalizeSql(rendered.sql);

    expect(sqlText).toContain('"analyses"."attempt_count" < $1');
    expect(sqlText).toContain('"analyses"."status" = $2');
    expect(sqlText).toContain('"analyses"."status" = $4');
    expect(rendered.params).toEqual([
      10,
      "pending",
      now,
      "processing",
      staleBefore,
    ]);
  });

  it("keeps policy analysis update expressions unqualified", () => {
    const rendered = dialect.sqlToQuery(
      buildClaimNextPendingAnalysisUpdateQuery(42, "policy-worker-1", now),
    );
    const sqlText = normalizeSql(rendered.sql);

    expect(sqlText).toContain('"attempt_count" = "attempt_count" + 1');
    expect(sqlText).toContain('"started_at" = COALESCE("started_at", $4)');
    expect(sqlText).not.toContain('"analyses"."attempt_count"');
    expect(sqlText).not.toContain('"analyses"."started_at"');
    expect(rendered.params).toEqual([
      "processing",
      "policy-worker-1",
      now,
      now,
      now,
      42,
    ]);
  });

  it("parameterizes Gmail candidate statuses", () => {
    const rendered = dialect.sqlToQuery(
      buildClaimNextPendingGmailScanJobCandidateQuery(now, staleBefore),
    );
    const sqlText = normalizeSql(rendered.sql);

    expect(sqlText).toContain('"gmail_scan_jobs"."status" = $1');
    expect(sqlText).toContain('"gmail_scan_jobs"."status" = $3');
    expect(rendered.params).toEqual([
      "pending",
      now,
      "processing",
      staleBefore,
    ]);
  });

  it("keeps Gmail update expressions unqualified", () => {
    const rendered = dialect.sqlToQuery(
      buildClaimNextPendingGmailScanJobUpdateQuery(84, "gmail-worker-1", now),
    );
    const sqlText = normalizeSql(rendered.sql);

    expect(sqlText).toContain('"attempt_count" = "attempt_count" + 1');
    expect(sqlText).toContain('"started_at" = COALESCE("started_at", $4)');
    expect(sqlText).not.toContain('"gmail_scan_jobs"."attempt_count"');
    expect(sqlText).not.toContain('"gmail_scan_jobs"."started_at"');
    expect(rendered.params).toEqual([
      "processing",
      "gmail-worker-1",
      now,
      now,
      now,
      84,
    ]);
  });
});

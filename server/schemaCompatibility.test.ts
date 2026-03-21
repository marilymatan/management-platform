import { describe, expect, it, vi } from "vitest";
import {
  ensureAnalysisQueueCompatibility,
  ensureGmailScanJobsCompatibility,
  ensureInsuranceArtifactsCompatibility,
  ensureInsuranceCategoryCompatibility,
  ensureSavingsHubCompatibility,
  ensureUserProfileCompatibility,
  getAppliedMigrationTags,
  getMissingMigrationTrackingEntries,
  shouldSyncMigrationTracking,
  type SchemaCompatibilityDb,
} from "./schemaCompatibility";

function countResult(cnt: number) {
  return { rows: [{ cnt }] };
}

function queryText(query: any) {
  return (query?.queryChunks ?? [])
    .flat(Infinity)
    .map((chunk: unknown) => {
      if (typeof chunk === "string") return chunk;
      if (chunk && typeof chunk === "object" && "value" in chunk) {
        return String((chunk as { value: unknown }).value);
      }
      return String(chunk ?? "");
    })
    .join("");
}

function createDb() {
  return {
    execute: vi.fn(),
  } satisfies SchemaCompatibilityDb;
}

describe("schemaCompatibility", () => {
  it("syncs migration tracking only for pre-existing schemas with an empty tracker", () => {
    expect(shouldSyncMigrationTracking(0, true)).toBe(true);
    expect(shouldSyncMigrationTracking(0, false)).toBe(false);
    expect(shouldSyncMigrationTracking(3, true)).toBe(false);
  });

  it("selects only applied migrations missing from tracking", () => {
    expect(
      getMissingMigrationTrackingEntries(
        [
          { tag: "0013_whole_darwin", hash: "hash-13", when: 13 },
          { tag: "0014_clean_stature", hash: "hash-14", when: 14 },
          { tag: "0015_parallel_pet_avengers", hash: "hash-15", when: 15 },
        ],
        new Set(["0013_whole_darwin", "0014_clean_stature"]),
        new Set(["hash-13"]),
      ),
    ).toEqual([
      { tag: "0014_clean_stature", hash: "hash-14", when: 14 },
    ]);
  });

  it("adds missing analysis queue columns and index when the schema is behind", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValue({ rows: [] });

    await ensureAnalysisQueueCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "processed_file_count" integer DEFAULT 0 NOT NULL',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "active_batch_file_count" integer DEFAULT 0 NOT NULL',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "locked_by" varchar(128)',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "started_at" timestamp',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "completed_at" timestamp',
    );
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp',
    );
    expect(statements).toContain(
      'CREATE INDEX IF NOT EXISTS "analyses_status_idx" ON "analyses" USING btree ("status","next_retry_at","created_at")',
    );
  });

  it("skips queue schema DDL when analyses already has the required columns and index", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1));

    await ensureAnalysisQueueCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(
      statements.some((statement) => statement.includes('ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS')),
    ).toBe(false);
    expect(
      statements.some((statement) => statement.includes('CREATE INDEX IF NOT EXISTS "analyses_status_idx"')),
    ).toBe(false);
  });

  it("adds insurance_category only when analyses is missing it", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValue({ rows: [] });

    await ensureInsuranceCategoryCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(
      statements.some((statement) => statement.includes('CREATE TYPE "public"."insurance_category_type"')),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "insurance_category" "insurance_category_type"'),
      ),
    ).toBe(true);
  });

  it("creates insurance_artifacts and its indexes when the schema is behind", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValue({ rows: [] });

    await ensureInsuranceArtifactsCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(
      statements.some((statement) => statement.includes('CREATE TYPE "public"."insurance_artifact_type"')),
    ).toBe(true);
    expect(
      statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "insurance_artifacts"')),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "insurance_artifacts_user_id_idx" ON "insurance_artifacts"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "insurance_artifacts_category_idx" ON "insurance_artifacts"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "insurance_artifacts_type_idx" ON "insurance_artifacts"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "insurance_artifacts_document_date_idx" ON "insurance_artifacts"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE UNIQUE INDEX IF NOT EXISTS "insurance_artifacts_user_message_uniq" ON "insurance_artifacts"'),
      ),
    ).toBe(true);
  });

  it("creates gmail_scan_jobs and its indexes when the schema is behind", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValue({ rows: [] });

    await ensureGmailScanJobsCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(
      statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "gmail_scan_jobs"')),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "gmail_scan_jobs_user_id_idx" ON "gmail_scan_jobs"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "gmail_scan_jobs_status_idx" ON "gmail_scan_jobs"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE INDEX IF NOT EXISTS "gmail_scan_jobs_user_status_idx" ON "gmail_scan_jobs"'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE UNIQUE INDEX IF NOT EXISTS "gmail_scan_jobs_job_id_uniq" ON "gmail_scan_jobs"'),
      ),
    ).toBe(true);
  });

  it("creates savings hub tables and indexes when the schema is behind", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValue({ rows: [] });

    await ensureSavingsHubCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(
      statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "action_items"')),
    ).toBe(true);
    expect(
      statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "monthly_reports"')),
    ).toBe(true);
    expect(
      statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "savings_opportunities"')),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false NOT NULL'),
      ),
    ).toBe(true);
    expect(
      statements.some((statement) =>
        statement.includes('CREATE UNIQUE INDEX IF NOT EXISTS "savings_opportunities_user_key_uniq" ON "savings_opportunities"'),
      ),
    ).toBe(true);
  });

  it("adds missing user profile columns when the schema is behind", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValue({ rows: [] });

    await ensureUserProfileCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(statements).toContain(
      'ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "profile_image_key" text',
    );
    expect(statements).toContain(
      'ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "business_name" text',
    );
    expect(statements).toContain(
      'ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "business_tax_id" text',
    );
    expect(statements).toContain(
      'ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "business_email_domains" text',
    );
    expect(statements).toContain(
      'ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "email_scan_senders" text',
    );
    expect(statements).toContain(
      'ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "email_scan_keywords" text',
    );
  });

  it("skips user profile schema DDL when the required columns already exist", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1));

    await ensureUserProfileCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(
      statements.some((statement) => statement.includes('ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS')),
    ).toBe(false);
  });

  it("syncs only migrations whose schema is already present", async () => {
    const db = createDb();
    db.execute
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(1))
      .mockResolvedValueOnce(countResult(0))
      .mockResolvedValueOnce(countResult(1));

    const applied = await getAppliedMigrationTags(db, [
      "0011_hesitant_emma_frost",
      "0012_previous_proemial_gods",
      "0013_whole_darwin",
    ]);

    expect([...applied]).toEqual([
      "0011_hesitant_emma_frost",
      "0012_previous_proemial_gods",
    ]);
  });
});

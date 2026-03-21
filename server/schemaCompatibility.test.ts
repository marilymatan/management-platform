import { describe, expect, it, vi } from "vitest";
import {
  ensureAnalysisQueueCompatibility,
  ensureInsuranceCategoryCompatibility,
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
      .mockResolvedValue({ rows: [] });

    await ensureAnalysisQueueCompatibility(db);

    const statements = db.execute.mock.calls.map(([query]) => queryText(query));
    expect(statements).toContain(
      'ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL',
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
});

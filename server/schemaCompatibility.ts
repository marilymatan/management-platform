import { sql } from "drizzle-orm";

export type SchemaCompatibilityDb = {
  execute: (query: any) => Promise<{ rows: unknown[] }>;
};

type ColumnSpec = {
  columnName: string;
  ddl: string;
};

const analysisQueueColumns: ColumnSpec[] = [
  {
    columnName: "attempt_count",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL`,
  },
  {
    columnName: "locked_by",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "locked_by" varchar(128)`,
  },
  {
    columnName: "last_heartbeat_at",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "last_heartbeat_at" timestamp`,
  },
  {
    columnName: "started_at",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "started_at" timestamp`,
  },
  {
    columnName: "completed_at",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "completed_at" timestamp`,
  },
  {
    columnName: "next_retry_at",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp`,
  },
];

async function getCount(db: SchemaCompatibilityDb, query: any) {
  const result = await db.execute(query);
  return Number((result.rows[0] as { cnt?: number | string } | undefined)?.cnt ?? 0);
}

async function hasTable(db: SchemaCompatibilityDb, tableName: string) {
  return (
    await getCount(
      db,
      sql`
        SELECT count(*)::int as cnt
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ${tableName}
      `,
    )
  ) > 0;
}

async function hasColumn(db: SchemaCompatibilityDb, tableName: string, columnName: string) {
  return (
    await getCount(
      db,
      sql`
        SELECT count(*)::int as cnt
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${columnName}
      `,
    )
  ) > 0;
}

async function hasIndex(db: SchemaCompatibilityDb, indexName: string) {
  return (
    await getCount(
      db,
      sql`
        SELECT count(*)::int as cnt
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ${indexName}
      `,
    )
  ) > 0;
}

export async function hasExistingCoreSchema(db: SchemaCompatibilityDb) {
  const [hasUsersTable, hasAnalysesTable] = await Promise.all([
    hasTable(db, "users"),
    hasTable(db, "analyses"),
  ]);
  return hasUsersTable && hasAnalysesTable;
}

export function shouldSyncMigrationTracking(trackedCount: number, existingCoreSchema: boolean) {
  return trackedCount === 0 && existingCoreSchema;
}

export async function ensureInsuranceCategoryCompatibility(db: SchemaCompatibilityDb) {
  const hasAnalysesTable = await hasTable(db, "analyses");
  if (!hasAnalysesTable) return;

  const hasInsuranceCategory = await hasColumn(db, "analyses", "insurance_category");
  if (hasInsuranceCategory) return;

  console.log("[Migrate] Applying missing migration 0002 (insurance_category)...");
  await db.execute(
    sql`DO $$ BEGIN CREATE TYPE "public"."insurance_category_type" AS ENUM('health', 'life', 'car', 'home'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  );
  await db.execute(sql`ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "insurance_category" "insurance_category_type"`);
  console.log("[Migrate] Migration 0002 applied");
}

export async function ensureAnalysisQueueCompatibility(db: SchemaCompatibilityDb) {
  const hasAnalysesTable = await hasTable(db, "analyses");
  if (!hasAnalysesTable) return;

  const missingColumns: ColumnSpec[] = [];
  for (const column of analysisQueueColumns) {
    if (!(await hasColumn(db, "analyses", column.columnName))) {
      missingColumns.push(column);
    }
  }

  const hasStatusIndex = await hasIndex(db, "analyses_status_idx");
  if (missingColumns.length === 0 && hasStatusIndex) {
    return;
  }

  console.log("[Migrate] Ensuring analyses queue schema compatibility...");
  for (const column of missingColumns) {
    await db.execute(sql.raw(column.ddl));
  }

  if (!hasStatusIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "analyses_status_idx" ON "analyses" USING btree ("status","next_retry_at","created_at")`,
    );
  }
  console.log("[Migrate] Analyses queue schema compatibility ensured");
}

export async function ensureLegacySchemaCompatibility(db: SchemaCompatibilityDb) {
  await ensureInsuranceCategoryCompatibility(db);
  await ensureAnalysisQueueCompatibility(db);
}

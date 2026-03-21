import { sql } from "drizzle-orm";

export type SchemaCompatibilityDb = {
  execute: (query: any) => Promise<{ rows: unknown[] }>;
};

type ColumnSpec = {
  columnName: string;
  ddl: string;
};

const userProfileColumns: ColumnSpec[] = [
  {
    columnName: "profile_image_key",
    ddl: `ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "profile_image_key" text`,
  },
  {
    columnName: "business_name",
    ddl: `ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "business_name" text`,
  },
  {
    columnName: "business_tax_id",
    ddl: `ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "business_tax_id" text`,
  },
  {
    columnName: "business_email_domains",
    ddl: `ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "business_email_domains" text`,
  },
];

const analysisQueueColumns: ColumnSpec[] = [
  {
    columnName: "attempt_count",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL`,
  },
  {
    columnName: "processed_file_count",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "processed_file_count" integer DEFAULT 0 NOT NULL`,
  },
  {
    columnName: "active_batch_file_count",
    ddl: `ALTER TABLE "analyses" ADD COLUMN IF NOT EXISTS "active_batch_file_count" integer DEFAULT 0 NOT NULL`,
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

async function hasColumnDataType(db: SchemaCompatibilityDb, tableName: string, columnName: string, dataType: string) {
  return (
    await getCount(
      db,
      sql`
        SELECT count(*)::int as cnt
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${tableName}
          AND column_name = ${columnName}
          AND data_type = ${dataType}
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

export async function getAppliedMigrationTags(db: SchemaCompatibilityDb, tags: string[]) {
  const applied = new Set<string>();

  for (const tag of tags) {
    if (tag === "0000_keen_franklin_storm") {
      const checks = await Promise.all([
        hasTable(db, "users"),
        hasTable(db, "analyses"),
        hasTable(db, "api_usage_logs"),
        hasTable(db, "audit_logs"),
        hasTable(db, "chat_messages"),
        hasTable(db, "gmail_connections"),
        hasTable(db, "smart_invoices"),
        hasIndex(db, "invoice_created_at_idx"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0001_wet_smasher") {
      const checks = await Promise.all([
        hasTable(db, "user_profiles"),
        hasIndex(db, "profile_user_id_idx"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0002_clever_argent") {
      if (await hasColumn(db, "analyses", "insurance_category")) {
        applied.add(tag);
      }
      continue;
    }

    if (tag === "0003_fresh_firebrand") {
      if (await hasColumn(db, "user_profiles", "profile_image_key")) {
        applied.add(tag);
      }
      continue;
    }

    if (tag === "0004_grey_infant_terrible") {
      const checks = await Promise.all([
        hasColumnDataType(db, "analyses", "files", "text"),
        hasColumnDataType(db, "analyses", "analysis_result", "text"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0005_watery_justin_hammer") {
      const checks = await Promise.all([
        hasTable(db, "category_mappings"),
        hasColumn(db, "smart_invoices", "custom_category"),
        hasIndex(db, "category_mapping_user_provider_uniq"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0006_charming_rockslide") {
      const checks = await Promise.all([
        hasColumn(db, "smart_invoices", "flow_direction"),
        hasColumn(db, "user_profiles", "business_name"),
        hasColumn(db, "user_profiles", "business_tax_id"),
        hasColumn(db, "user_profiles", "business_email_domains"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0007_lame_virginia_dare") {
      const checks = await Promise.all([
        hasTable(db, "document_classifications"),
        hasTable(db, "family_members"),
        hasIndex(db, "document_classifications_user_document_uniq"),
        hasIndex(db, "family_members_relation_idx"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0008_funny_nomad") {
      if (await hasColumn(db, "api_usage_logs", "model")) {
        applied.add(tag);
      }
      continue;
    }

    if (tag === "0009_crazy_shinobi_shaw") {
      const checks = await Promise.all([
        hasTable(db, "category_summary_cache"),
        hasIndex(db, "category_summary_cache_user_category_uniq"),
        hasIndex(db, "category_summary_cache_user_id_idx"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0010_nervous_tattoo") {
      const checks = await Promise.all([
        hasColumn(db, "analyses", "attempt_count"),
        hasColumn(db, "analyses", "locked_by"),
        hasColumn(db, "analyses", "last_heartbeat_at"),
        hasColumn(db, "analyses", "started_at"),
        hasColumn(db, "analyses", "completed_at"),
        hasColumn(db, "analyses", "next_retry_at"),
        hasIndex(db, "analyses_status_idx"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0011_hesitant_emma_frost") {
      const checks = await Promise.all([
        hasTable(db, "insurance_artifacts"),
        hasIndex(db, "insurance_artifacts_user_id_idx"),
        hasIndex(db, "insurance_artifacts_category_idx"),
        hasIndex(db, "insurance_artifacts_type_idx"),
        hasIndex(db, "insurance_artifacts_document_date_idx"),
        hasIndex(db, "insurance_artifacts_user_message_uniq"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0012_previous_proemial_gods") {
      const checks = await Promise.all([
        hasTable(db, "action_items"),
        hasTable(db, "insurance_score_history"),
        hasTable(db, "monthly_reports"),
        hasTable(db, "savings_opportunities"),
        hasColumn(db, "user_profiles", "onboarding_completed"),
        hasIndex(db, "action_items_user_key_uniq"),
        hasIndex(db, "insurance_score_history_user_id_idx"),
        hasIndex(db, "monthly_reports_user_month_uniq"),
        hasIndex(db, "savings_opportunities_user_key_uniq"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
      continue;
    }

    if (tag === "0013_whole_darwin") {
      const checks = await Promise.all([
        hasColumn(db, "document_classifications", "family_member_id"),
        hasIndex(db, "document_classifications_family_member_idx"),
      ]);
      if (checks.every(Boolean)) applied.add(tag);
    }
  }

  return applied;
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

export async function ensureUserProfileCompatibility(db: SchemaCompatibilityDb) {
  const hasUserProfilesTable = await hasTable(db, "user_profiles");
  if (!hasUserProfilesTable) return;

  const missingColumns: ColumnSpec[] = [];
  for (const column of userProfileColumns) {
    if (!(await hasColumn(db, "user_profiles", column.columnName))) {
      missingColumns.push(column);
    }
  }

  if (missingColumns.length === 0) {
    return;
  }

  console.log("[Migrate] Ensuring user_profiles schema compatibility...");
  for (const column of missingColumns) {
    await db.execute(sql.raw(column.ddl));
  }
  console.log("[Migrate] user_profiles schema compatibility ensured");
}

export async function ensureSavingsHubCompatibility(db: SchemaCompatibilityDb) {
  const hasUserProfilesTable = await hasTable(db, "user_profiles");
  if (!hasUserProfilesTable) return;

  const hasActionItemsTable = await hasTable(db, "action_items");
  const hasInsuranceScoreHistoryTable = await hasTable(db, "insurance_score_history");
  const hasMonthlyReportsTable = await hasTable(db, "monthly_reports");
  const hasSavingsOpportunitiesTable = await hasTable(db, "savings_opportunities");
  const hasOnboardingCompleted = await hasColumn(db, "user_profiles", "onboarding_completed");

  if (!hasActionItemsTable || !hasInsuranceScoreHistoryTable || !hasMonthlyReportsTable || !hasSavingsOpportunitiesTable) {
    console.log("[Migrate] Ensuring savings hub schema compatibility...");
    await db.execute(
      sql`DO $$ BEGIN CREATE TYPE "public"."action_item_status" AS ENUM('pending', 'completed', 'dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await db.execute(
      sql`DO $$ BEGIN CREATE TYPE "public"."action_item_type" AS ENUM('savings', 'renewal', 'gap', 'monitoring'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await db.execute(
      sql`DO $$ BEGIN CREATE TYPE "public"."priority_level" AS ENUM('high', 'medium', 'low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await db.execute(
      sql`DO $$ BEGIN CREATE TYPE "public"."savings_opportunity_status" AS ENUM('open', 'completed', 'dismissed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await db.execute(
      sql`DO $$ BEGIN CREATE TYPE "public"."savings_opportunity_type" AS ENUM('duplicate', 'overpriced', 'unnecessary', 'gap'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
  }

  if (!hasActionItemsTable) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "action_items" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "action_key" varchar(160) NOT NULL,
        "savings_opportunity_id" integer,
        "type" "action_item_type" NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "instructions" jsonb NOT NULL,
        "potential_saving" numeric(10, 2) DEFAULT '0' NOT NULL,
        "priority" "priority_level" DEFAULT 'medium' NOT NULL,
        "status" "action_item_status" DEFAULT 'pending' NOT NULL,
        "due_date" timestamp,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp
      )
    `);
  }

  if (!hasInsuranceScoreHistoryTable) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "insurance_score_history" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "score" integer NOT NULL,
        "breakdown" jsonb NOT NULL,
        "total_monthly_spend" numeric(10, 2) DEFAULT '0' NOT NULL,
        "potential_savings" numeric(10, 2) DEFAULT '0' NOT NULL,
        "calculated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
  }

  if (!hasMonthlyReportsTable) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "monthly_reports" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "month" varchar(7) NOT NULL,
        "score_at_time" integer NOT NULL,
        "score_change" integer DEFAULT 0 NOT NULL,
        "changes" jsonb NOT NULL,
        "new_actions" jsonb NOT NULL,
        "summary" text NOT NULL,
        "data_hash" varchar(128) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
  }

  if (!hasSavingsOpportunitiesTable) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "savings_opportunities" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "opportunity_key" varchar(160) NOT NULL,
        "type" "savings_opportunity_type" NOT NULL,
        "title" text NOT NULL,
        "description" text NOT NULL,
        "monthly_saving" numeric(10, 2) DEFAULT '0' NOT NULL,
        "annual_saving" numeric(10, 2) DEFAULT '0' NOT NULL,
        "priority" "priority_level" DEFAULT 'medium' NOT NULL,
        "action_steps" jsonb NOT NULL,
        "related_session_ids" jsonb NOT NULL,
        "status" "savings_opportunity_status" DEFAULT 'open' NOT NULL,
        "data_hash" varchar(128) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "completed_at" timestamp
      )
    `);
  }

  if (!hasOnboardingCompleted) {
    await db.execute(
      sql`ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "onboarding_completed" boolean DEFAULT false NOT NULL`,
    );
  }

  const hasActionItemsUserIdIndex = await hasIndex(db, "action_items_user_id_idx");
  const hasActionItemsUserKeyIndex = await hasIndex(db, "action_items_user_key_uniq");
  const hasInsuranceScoreHistoryUserIdIndex = await hasIndex(db, "insurance_score_history_user_id_idx");
  const hasMonthlyReportsUserIdIndex = await hasIndex(db, "monthly_reports_user_id_idx");
  const hasMonthlyReportsUserMonthIndex = await hasIndex(db, "monthly_reports_user_month_uniq");
  const hasSavingsOpportunitiesUserIdIndex = await hasIndex(db, "savings_opportunities_user_id_idx");
  const hasSavingsOpportunitiesUserKeyIndex = await hasIndex(db, "savings_opportunities_user_key_uniq");

  if (!hasActionItemsUserIdIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "action_items_user_id_idx" ON "action_items" USING btree ("user_id","status","priority")`,
    );
  }
  if (!hasActionItemsUserKeyIndex) {
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS "action_items_user_key_uniq" ON "action_items" USING btree ("user_id","action_key")`,
    );
  }
  if (!hasInsuranceScoreHistoryUserIdIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "insurance_score_history_user_id_idx" ON "insurance_score_history" USING btree ("user_id","calculated_at")`,
    );
  }
  if (!hasMonthlyReportsUserIdIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "monthly_reports_user_id_idx" ON "monthly_reports" USING btree ("user_id","month")`,
    );
  }
  if (!hasMonthlyReportsUserMonthIndex) {
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS "monthly_reports_user_month_uniq" ON "monthly_reports" USING btree ("user_id","month")`,
    );
  }
  if (!hasSavingsOpportunitiesUserIdIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "savings_opportunities_user_id_idx" ON "savings_opportunities" USING btree ("user_id","status")`,
    );
  }
  if (!hasSavingsOpportunitiesUserKeyIndex) {
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS "savings_opportunities_user_key_uniq" ON "savings_opportunities" USING btree ("user_id","opportunity_key")`,
    );
  }
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

export async function ensureInsuranceArtifactsCompatibility(db: SchemaCompatibilityDb) {
  const hasInsuranceArtifactsTable = await hasTable(db, "insurance_artifacts");

  if (!hasInsuranceArtifactsTable) {
    console.log("[Migrate] Ensuring insurance_artifacts schema compatibility...");
    await db.execute(
      sql`DO $$ BEGIN CREATE TYPE "public"."insurance_artifact_type" AS ENUM('policy_document', 'renewal_notice', 'premium_notice', 'coverage_update', 'claim_update', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "insurance_artifacts" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "gmail_connection_id" integer,
        "source_email" varchar(320),
        "gmail_message_id" varchar(128) NOT NULL,
        "provider" varchar(128),
        "insurance_category" "insurance_category_type",
        "artifact_type" "insurance_artifact_type" DEFAULT 'other' NOT NULL,
        "confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
        "premium_amount" numeric(10, 2),
        "policy_number" text,
        "document_date" timestamp,
        "subject" text,
        "summary" text,
        "action_hint" text,
        "attachment_filename" varchar(255),
        "attachment_file_key" text,
        "extracted_data" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
  }

  const hasUserIdIndex = await hasIndex(db, "insurance_artifacts_user_id_idx");
  const hasCategoryIndex = await hasIndex(db, "insurance_artifacts_category_idx");
  const hasTypeIndex = await hasIndex(db, "insurance_artifacts_type_idx");
  const hasDocumentDateIndex = await hasIndex(db, "insurance_artifacts_document_date_idx");
  const hasUserMessageUniqueIndex = await hasIndex(db, "insurance_artifacts_user_message_uniq");

  if (!hasUserIdIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "insurance_artifacts_user_id_idx" ON "insurance_artifacts" USING btree ("user_id")`,
    );
  }
  if (!hasCategoryIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "insurance_artifacts_category_idx" ON "insurance_artifacts" USING btree ("user_id","insurance_category")`,
    );
  }
  if (!hasTypeIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "insurance_artifacts_type_idx" ON "insurance_artifacts" USING btree ("user_id","artifact_type")`,
    );
  }
  if (!hasDocumentDateIndex) {
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "insurance_artifacts_document_date_idx" ON "insurance_artifacts" USING btree ("document_date","created_at")`,
    );
  }
  if (!hasUserMessageUniqueIndex) {
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS "insurance_artifacts_user_message_uniq" ON "insurance_artifacts" USING btree ("user_id","gmail_message_id")`,
    );
  }
}

export async function ensureLegacySchemaCompatibility(db: SchemaCompatibilityDb) {
  await ensureInsuranceCategoryCompatibility(db);
  await ensureUserProfileCompatibility(db);
  await ensureAnalysisQueueCompatibility(db);
  await ensureInsuranceArtifactsCompatibility(db);
  await ensureSavingsHubCompatibility(db);
}

import { serial, pgTable, pgEnum, text, timestamp, varchar, jsonb, index, numeric, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const analysisStatusEnum = pgEnum("analysis_status", ["pending", "processing", "completed", "error"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);
export const usageActionEnum = pgEnum("usage_action", ["analyze", "chat"]);
export const invoiceCategoryEnum = pgEnum("invoice_category", ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "paid", "overdue", "unknown"]);
export const invoiceFlowDirectionEnum = pgEnum("invoice_flow_direction", ["expense", "income", "unknown"]);
export const auditStatusEnum = pgEnum("audit_status", ["allowed", "blocked", "error"]);
export const maritalStatusEnum = pgEnum("marital_status", ["single", "married", "divorced", "widowed"]);
export const employmentStatusEnum = pgEnum("employment_status", ["salaried", "self_employed", "business_owner", "student", "retired", "unemployed"]);
export const incomeRangeEnum = pgEnum("income_range", ["below_5k", "5k_10k", "10k_15k", "15k_25k", "25k_40k", "above_40k"]);
export const genderEnum = pgEnum("gender", ["male", "female", "other"]);
export const insuranceCategoryEnum = pgEnum("insurance_category_type", ["health", "life", "car", "home"]);
export const insuranceArtifactTypeEnum = pgEnum("insurance_artifact_type", ["policy_document", "renewal_notice", "premium_notice", "coverage_update", "claim_update", "other"]);
export const savingsOpportunityTypeEnum = pgEnum("savings_opportunity_type", ["duplicate", "overpriced", "unnecessary", "gap"]);
export const savingsOpportunityStatusEnum = pgEnum("savings_opportunity_status", ["open", "completed", "dismissed"]);
export const actionItemTypeEnum = pgEnum("action_item_type", ["savings", "renewal", "gap", "monitoring"]);
export const actionItemStatusEnum = pgEnum("action_item_status", ["pending", "completed", "dismissed"]);
export const priorityLevelEnum = pgEnum("priority_level", ["high", "medium", "low"]);
export const familyMemberRelationEnum = pgEnum("family_member_relation", ["spouse", "child", "parent", "dependent", "other"]);
export const documentSourceTypeEnum = pgEnum("document_source_type", ["analysis_file", "invoice_pdf"]);
export const documentManualTypeEnum = pgEnum("document_manual_type", ["insurance", "money", "health", "education", "family", "other"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type UserWithPassword = User & { password?: string };

export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull().unique(),
  userId: integer("user_id"),
  files: text("files").notNull(),
  extractedText: text("extracted_text"),
  analysisResult: text("analysis_result"),
  status: analysisStatusEnum("status").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  processedFileCount: integer("processed_file_count").default(0).notNull(),
  activeBatchFileCount: integer("active_batch_file_count").default(0).notNull(),
  lockedBy: varchar("locked_by", { length: 128 }),
  lastHeartbeatAt: timestamp("last_heartbeat_at"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  nextRetryAt: timestamp("next_retry_at"),
  insuranceCategory: insuranceCategoryEnum("insurance_category"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("analyses_user_id_idx").on(table.userId),
  statusIdx: index("analyses_status_idx").on(table.status, table.nextRetryAt, table.createdAt),
}));

export type Analysis = typeof analyses.$inferSelect;
export type InsertAnalysis = typeof analyses.$inferInsert;

export type AnalysisWithUser = Analysis & { user?: User | null };

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

export const apiUsageLogs = pgTable("api_usage_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  sessionId: varchar("session_id", { length: 64 }),
  action: usageActionEnum("action").notNull(),
  model: varchar("model", { length: 120 }).notNull().default("unknown"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("usage_user_id_idx").on(table.userId),
  sessionIdIdx: index("usage_session_id_idx").on(table.sessionId),
  createdAtIdx: index("usage_created_at_idx").on(table.createdAt),
}));

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;
export type InsertApiUsageLog = typeof apiUsageLogs.$inferInsert;

export const gmailConnections = pgTable("gmail_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  email: varchar("email", { length: 320 }),
  expiresAt: timestamp("expires_at"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastSyncCount: integer("last_sync_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("gmail_user_id_idx").on(table.userId),
  userEmailUniq: uniqueIndex("gmail_user_email_uniq").on(table.userId, table.email),
}));

export type GmailConnection = typeof gmailConnections.$inferSelect;
export type InsertGmailConnection = typeof gmailConnections.$inferInsert;

export const smartInvoices = pgTable("smart_invoices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  gmailConnectionId: integer("gmail_connection_id"),
  sourceEmail: varchar("source_email", { length: 320 }),
  gmailMessageId: varchar("gmail_message_id", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 128 }),
  category: invoiceCategoryEnum("category").default("אחר"),
  customCategory: varchar("custom_category", { length: 128 }),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  invoiceDate: timestamp("invoice_date"),
  dueDate: timestamp("due_date"),
  status: invoiceStatusEnum("status").default("unknown"),
  flowDirection: invoiceFlowDirectionEnum("flow_direction").default("expense").notNull(),
  subject: text("subject"),
  rawText: text("raw_text"),
  extractedData: jsonb("extracted_data"),
  parsed: boolean("parsed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("invoice_user_id_idx").on(table.userId),
  gmailConnIdx: index("invoice_gmail_conn_idx").on(table.gmailConnectionId),
  gmailMsgIdx: index("invoice_gmail_msg_idx").on(table.gmailMessageId),
  createdAtIdx: index("invoice_created_at_idx").on(table.createdAt),
}));

export type SmartInvoice = typeof smartInvoices.$inferSelect;
export type InsertSmartInvoice = typeof smartInvoices.$inferInsert;

export const insuranceArtifacts = pgTable("insurance_artifacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  gmailConnectionId: integer("gmail_connection_id"),
  sourceEmail: varchar("source_email", { length: 320 }),
  gmailMessageId: varchar("gmail_message_id", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 128 }),
  insuranceCategory: insuranceCategoryEnum("insurance_category"),
  artifactType: insuranceArtifactTypeEnum("artifact_type").default("other").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).default("0").notNull(),
  premiumAmount: numeric("premium_amount", { precision: 10, scale: 2 }),
  policyNumber: text("policy_number"),
  documentDate: timestamp("document_date"),
  subject: text("subject"),
  summary: text("summary"),
  actionHint: text("action_hint"),
  attachmentFilename: varchar("attachment_filename", { length: 255 }),
  attachmentFileKey: text("attachment_file_key"),
  extractedData: text("extracted_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("insurance_artifacts_user_id_idx").on(table.userId),
  categoryIdx: index("insurance_artifacts_category_idx").on(table.userId, table.insuranceCategory),
  artifactTypeIdx: index("insurance_artifacts_type_idx").on(table.userId, table.artifactType),
  messageDateIdx: index("insurance_artifacts_document_date_idx").on(table.documentDate, table.createdAt),
  userMessageUniq: uniqueIndex("insurance_artifacts_user_message_uniq").on(table.userId, table.gmailMessageId),
}));

export type InsuranceArtifact = typeof insuranceArtifacts.$inferSelect;
export type InsertInsuranceArtifact = typeof insuranceArtifacts.$inferInsert;

export const categoryMappings = pgTable("category_mappings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  providerPattern: varchar("provider_pattern", { length: 128 }).notNull(),
  customCategory: varchar("custom_category", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userProviderUniq: uniqueIndex("category_mapping_user_provider_uniq").on(table.userId, table.providerPattern),
}));

export type CategoryMapping = typeof categoryMappings.$inferSelect;
export type InsertCategoryMapping = typeof categoryMappings.$inferInsert;

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  action: varchar("action", { length: 64 }).notNull(),
  resource: varchar("resource", { length: 64 }).notNull(),
  resourceId: varchar("resource_id", { length: 128 }),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgent: text("user_agent"),
  details: text("details"),
  status: auditStatusEnum("status").default("allowed").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("audit_user_id_idx").on(table.userId),
  actionIdx: index("audit_action_idx").on(table.action),
  createdAtIdx: index("audit_created_at_idx").on(table.createdAt),
}));

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  dateOfBirth: timestamp("date_of_birth"),
  gender: genderEnum("gender"),
  maritalStatus: maritalStatusEnum("marital_status"),
  numberOfChildren: integer("number_of_children").default(0),
  childrenAges: text("children_ages"),
  employmentStatus: employmentStatusEnum("employment_status"),
  incomeRange: incomeRangeEnum("income_range"),
  ownsApartment: boolean("owns_apartment").default(false),
  hasActiveMortgage: boolean("has_active_mortgage").default(false),
  numberOfVehicles: integer("number_of_vehicles").default(0),
  hasExtremeSports: boolean("has_extreme_sports").default(false),
  hasSpecialHealthConditions: boolean("has_special_health_conditions").default(false),
  healthConditionsDetails: text("health_conditions_details"),
  hasPets: boolean("has_pets").default(false),
  businessName: text("business_name"),
  businessTaxId: text("business_tax_id"),
  businessEmailDomains: text("business_email_domains"),
  profileImageKey: text("profile_image_key"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("profile_user_id_idx").on(table.userId),
}));

export type UserProfileRow = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

export const familyMembers = pgTable("family_members", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fullName: text("full_name").notNull(),
  relation: familyMemberRelationEnum("relation").notNull(),
  birthDate: timestamp("birth_date"),
  ageLabel: text("age_label"),
  gender: genderEnum("gender"),
  allergies: text("allergies"),
  medicalNotes: text("medical_notes"),
  activities: text("activities"),
  insuranceNotes: text("insurance_notes"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("family_members_user_id_idx").on(table.userId),
  relationIdx: index("family_members_relation_idx").on(table.relation),
}));

export type FamilyMember = typeof familyMembers.$inferSelect;
export type InsertFamilyMember = typeof familyMembers.$inferInsert;

export const documentClassifications = pgTable("document_classifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  documentKey: varchar("document_key", { length: 191 }).notNull(),
  sourceType: documentSourceTypeEnum("source_type").notNull(),
  sourceId: varchar("source_id", { length: 128 }),
  manualType: documentManualTypeEnum("manual_type").notNull(),
  familyMemberId: integer("family_member_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("document_classifications_user_id_idx").on(table.userId),
  sourceIdx: index("document_classifications_source_idx").on(table.userId, table.sourceType, table.sourceId),
  familyMemberIdx: index("document_classifications_family_member_idx").on(table.userId, table.familyMemberId),
  userDocumentUniq: uniqueIndex("document_classifications_user_document_uniq").on(table.userId, table.documentKey),
}));

export type DocumentClassification = typeof documentClassifications.$inferSelect;
export type InsertDocumentClassification = typeof documentClassifications.$inferInsert;

export const categorySummaryCache = pgTable("category_summary_cache", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  category: insuranceCategoryEnum("category").notNull(),
  summaryData: text("summary_data").notNull(),
  dataHash: varchar("data_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userCategoryUniq: uniqueIndex("category_summary_cache_user_category_uniq").on(table.userId, table.category),
  userIdIdx: index("category_summary_cache_user_id_idx").on(table.userId),
}));

export type CategorySummaryCache = typeof categorySummaryCache.$inferSelect;
export type InsertCategorySummaryCache = typeof categorySummaryCache.$inferInsert;

export const insuranceScoreHistory = pgTable("insurance_score_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  score: integer("score").notNull(),
  breakdown: jsonb("breakdown").notNull(),
  totalMonthlySpend: numeric("total_monthly_spend", { precision: 10, scale: 2 }).default("0").notNull(),
  potentialSavings: numeric("potential_savings", { precision: 10, scale: 2 }).default("0").notNull(),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("insurance_score_history_user_id_idx").on(table.userId, table.calculatedAt),
}));

export type InsuranceScoreHistory = typeof insuranceScoreHistory.$inferSelect;
export type InsertInsuranceScoreHistory = typeof insuranceScoreHistory.$inferInsert;

export const savingsOpportunities = pgTable("savings_opportunities", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  opportunityKey: varchar("opportunity_key", { length: 160 }).notNull(),
  type: savingsOpportunityTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  monthlySaving: numeric("monthly_saving", { precision: 10, scale: 2 }).default("0").notNull(),
  annualSaving: numeric("annual_saving", { precision: 10, scale: 2 }).default("0").notNull(),
  priority: priorityLevelEnum("priority").default("medium").notNull(),
  actionSteps: jsonb("action_steps").notNull(),
  relatedSessionIds: jsonb("related_session_ids").notNull(),
  status: savingsOpportunityStatusEnum("status").default("open").notNull(),
  dataHash: varchar("data_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdIdx: index("savings_opportunities_user_id_idx").on(table.userId, table.status),
  userKeyUniq: uniqueIndex("savings_opportunities_user_key_uniq").on(table.userId, table.opportunityKey),
}));

export type SavingsOpportunity = typeof savingsOpportunities.$inferSelect;
export type InsertSavingsOpportunity = typeof savingsOpportunities.$inferInsert;

export const actionItems = pgTable("action_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  actionKey: varchar("action_key", { length: 160 }).notNull(),
  savingsOpportunityId: integer("savings_opportunity_id"),
  type: actionItemTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  instructions: jsonb("instructions").notNull(),
  potentialSaving: numeric("potential_saving", { precision: 10, scale: 2 }).default("0").notNull(),
  priority: priorityLevelEnum("priority").default("medium").notNull(),
  status: actionItemStatusEnum("status").default("pending").notNull(),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  userIdIdx: index("action_items_user_id_idx").on(table.userId, table.status, table.priority),
  userKeyUniq: uniqueIndex("action_items_user_key_uniq").on(table.userId, table.actionKey),
}));

export type ActionItem = typeof actionItems.$inferSelect;
export type InsertActionItem = typeof actionItems.$inferInsert;

export const monthlyReports = pgTable("monthly_reports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  scoreAtTime: integer("score_at_time").notNull(),
  scoreChange: integer("score_change").default(0).notNull(),
  changes: jsonb("changes").notNull(),
  newActions: jsonb("new_actions").notNull(),
  summary: text("summary").notNull(),
  dataHash: varchar("data_hash", { length: 128 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("monthly_reports_user_id_idx").on(table.userId, table.month),
  userMonthUniq: uniqueIndex("monthly_reports_user_month_uniq").on(table.userId, table.month),
}));

export type MonthlyReport = typeof monthlyReports.$inferSelect;
export type InsertMonthlyReport = typeof monthlyReports.$inferInsert;

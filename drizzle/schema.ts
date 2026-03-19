import { serial, pgTable, pgEnum, text, timestamp, varchar, jsonb, index, numeric, boolean, integer } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const analysisStatusEnum = pgEnum("analysis_status", ["pending", "processing", "completed", "error"]);
export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);
export const usageActionEnum = pgEnum("usage_action", ["analyze", "chat"]);
export const invoiceCategoryEnum = pgEnum("invoice_category", ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "paid", "overdue", "unknown"]);
export const auditStatusEnum = pgEnum("audit_status", ["allowed", "blocked", "error"]);

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
  files: jsonb("files").$type<Array<{ name: string; size: number; fileKey?: string; url?: string }>>().notNull(),
  extractedText: text("extracted_text"),
  analysisResult: jsonb("analysis_result").$type<import("@shared/insurance").PolicyAnalysis | null>(),
  status: analysisStatusEnum("status").default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
}, (table) => ({
  userIdIdx: index("analyses_user_id_idx").on(table.userId),
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
  userId: integer("user_id").notNull().unique(),
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
}));

export type GmailConnection = typeof gmailConnections.$inferSelect;
export type InsertGmailConnection = typeof gmailConnections.$inferInsert;

export const smartInvoices = pgTable("smart_invoices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  gmailMessageId: varchar("gmail_message_id", { length: 128 }).notNull(),
  provider: varchar("provider", { length: 128 }),
  category: invoiceCategoryEnum("category").default("אחר"),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  invoiceDate: timestamp("invoice_date"),
  dueDate: timestamp("due_date"),
  status: invoiceStatusEnum("status").default("unknown"),
  subject: text("subject"),
  rawText: text("raw_text"),
  extractedData: jsonb("extracted_data"),
  parsed: boolean("parsed").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("invoice_user_id_idx").on(table.userId),
  gmailMsgIdx: index("invoice_gmail_msg_idx").on(table.gmailMessageId),
  createdAtIdx: index("invoice_created_at_idx").on(table.createdAt),
}));

export type SmartInvoice = typeof smartInvoices.$inferSelect;
export type InsertSmartInvoice = typeof smartInvoices.$inferInsert;

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

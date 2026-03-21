/**
 * Security Audit Logging Module
 * 
 * Records all sensitive operations for security monitoring and compliance.
 * Every login, data access, file download, Gmail connection, and admin action
 * is logged with user, IP, and timestamp information.
 */

import { getDb } from "./db";
import { auditLogs, type InsertAuditLog } from "../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";

// ─── Action Types ──────────────────────────────────────────────────────────

export type AuditAction =
  // Auth actions
  | "login"
  | "logout"
  | "login_failed"
  // Data access
  | "view_analysis"
  | "create_analysis"
  | "delete_analysis"
  | "clear_inflight_analysis_queue"
  | "view_chat"
  | "send_chat"
  // File operations
  | "upload_file"
  | "download_file"
  | "access_file"
  // Gmail operations
  | "connect_gmail"
  | "disconnect_gmail"
  | "queue_gmail_scan"
  | "scan_gmail"
  | "clear_invoices"
  | "import_policy_from_gmail"
  | "add_manual_expense"
  | "update_invoice_category"
  | "summarize_category"
  | "complete_savings_opportunity"
  | "dismiss_savings_opportunity"
  | "complete_action_item"
  | "dismiss_action_item"
  | "monitor_insurance_changes"
  | "create_manual_policy"
  | "manage_family_member"
  | "delete_family_member"
  | "update_document_classification"
  // Admin operations
  | "admin_view_users"
  | "admin_view_stats"
  // Security events
  | "geo_blocked"
  | "rate_limited"
  | "unauthorized_access";

export type AuditResource =
  | "auth"
  | "analysis"
  | "chat"
  | "file"
  | "gmail"
  | "invoice"
  | "savings"
  | "action"
  | "monitoring"
  | "analysis_category"
  | "family"
  | "document"
  | "admin"
  | "security";

export type AuditStatus = "allowed" | "blocked" | "error";

// ─── Logging Function ──────────────────────────────────────────────────────

interface AuditEntry {
  userId?: number | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: string | null;
  status?: AuditStatus;
}

/**
 * Record an audit log entry.
 * Non-blocking — errors are caught and logged to console, never thrown.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Audit] Database not available, skipping audit log");
      return;
    }
    const record: InsertAuditLog = {
      userId: entry.userId ?? null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      details: entry.details ?? null,
      status: entry.status ?? "allowed",
    };
    await db.insert(auditLogs).values(record);
  } catch (err) {
    // Never throw from audit — it should not break the main flow
    console.error("[Audit] Failed to write audit log:", err);
  }
}

/**
 * Helper to extract IP from Express request.
 * Handles X-Forwarded-For, X-Real-IP, and direct connection.
 */
export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string") {
    return cfIp.trim();
  }
  const xff = req.headers["x-forwarded-for"];
  if (xff) {
    const ip = Array.isArray(xff) ? xff[0] : xff.split(",")[0].trim();
    return ip;
  }
  const xri = req.headers["x-real-ip"];
  if (xri) {
    return Array.isArray(xri) ? xri[0] : xri;
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

// ─── Query Helpers (for admin dashboard) ────────────────────────────────────

/**
 * Get recent audit logs for admin viewing.
 */
export async function getRecentAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Get audit logs for a specific user.
 */
export async function getUserAuditLogs(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Get security events (blocked, errors).
 */
export async function getSecurityEvents(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(auditLogs)
    .where(
      sql`${auditLogs.status} IN ('blocked', 'error')`
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { InsertUser, users, analyses, chatMessages, apiUsageLogs, type InsertAnalysis, type InsertChatMessage, type InsertApiUsageLog } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { PolicyAnalysis } from "@shared/insurance";
import { encryptField, decryptField, encryptJson, decryptJson } from "./encryption";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.adminEmail) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    updateSet.updatedAt = new Date();

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

function encryptAnalysisData(data: InsertAnalysis): InsertAnalysis {
  const encrypted = { ...data };
  if (encrypted.files) {
    encrypted.files = encryptJson(encrypted.files) as any;
  }
  if (encrypted.extractedText) {
    encrypted.extractedText = encryptField(encrypted.extractedText);
  }
  if (encrypted.analysisResult) {
    encrypted.analysisResult = encryptJson(encrypted.analysisResult) as any;
  }
  if (encrypted.errorMessage) {
    encrypted.errorMessage = encryptField(encrypted.errorMessage);
  }
  return encrypted;
}

function decryptAnalysisData(row: any): any {
  if (!row) return row;
  const decrypted = { ...row };
  if (decrypted.files && typeof decrypted.files === "string") {
    decrypted.files = decryptJson(decrypted.files) ?? [];
  }
  if (decrypted.extractedText && typeof decrypted.extractedText === "string") {
    decrypted.extractedText = decryptField(decrypted.extractedText);
  }
  if (decrypted.analysisResult && typeof decrypted.analysisResult === "string") {
    decrypted.analysisResult = decryptJson(decrypted.analysisResult);
  }
  if (decrypted.errorMessage && typeof decrypted.errorMessage === "string") {
    decrypted.errorMessage = decryptField(decrypted.errorMessage);
  }
  return decrypted;
}

export async function createAnalysis(data: InsertAnalysis) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encrypted = encryptAnalysisData(data);
  await db.insert(analyses).values(encrypted);
  return data.sessionId;
}

export async function getAnalysisBySessionId(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(analyses).where(eq(analyses.sessionId, sessionId)).limit(1);
  return result.length > 0 ? decryptAnalysisData(result[0]) : null;
}

export async function updateAnalysisStatus(
  sessionId: string,
  status: "pending" | "processing" | "completed" | "error",
  data?: { extractedText?: string; analysisResult?: PolicyAnalysis; errorMessage?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Partial<InsertAnalysis> = {
    status,
    updatedAt: new Date(),
  };
  if (data?.extractedText !== undefined) {
    updateData.extractedText = encryptField(data.extractedText);
  }
  if (data?.analysisResult !== undefined) {
    updateData.analysisResult = encryptJson(data.analysisResult) as any;
  }
  if (data?.errorMessage !== undefined) {
    updateData.errorMessage = encryptField(data.errorMessage);
  }
  await db.update(analyses).set(updateData).where(eq(analyses.sessionId, sessionId));
}

export async function addChatMessage(data: InsertChatMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encrypted = { ...data };
  if (encrypted.content) {
    encrypted.content = encryptField(encrypted.content);
  }
  await db.insert(chatMessages).values(encrypted);
}

export async function getChatHistory(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt);
  return result.map(row => ({
    ...row,
    content: decryptField(row.content),
  }));
}

export async function getUserAnalyses(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(analyses)
    .where(eq(analyses.userId, userId))
    .orderBy(analyses.createdAt);
  return result.map(decryptAnalysisData);
}

export async function linkAnalysisToUser(sessionId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(analyses)
    .set({ userId })
    .where(eq(analyses.sessionId, sessionId));
}

export async function deleteAnalysis(sessionId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const analysis = await getAnalysisBySessionId(sessionId);
  if (!analysis || analysis.userId !== userId) {
    throw new Error("Unauthorized");
  }
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  await db.delete(analyses).where(eq(analyses.sessionId, sessionId));
}

const COST_PER_1K_TOKENS = 0.0025;

export async function logApiUsage(data: {
  userId?: number | null;
  sessionId?: string | null;
  action: "analyze" | "chat";
  promptTokens: number;
  completionTokens: number;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Usage] Database not available, skipping usage log");
    return;
  }
  const totalTokens = data.promptTokens + data.completionTokens;
  const costUsd = ((totalTokens / 1000) * COST_PER_1K_TOKENS).toFixed(6);
  const entry: InsertApiUsageLog = {
    userId: data.userId ?? null,
    sessionId: data.sessionId ?? null,
    action: data.action,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    totalTokens,
    costUsd,
  };
  try {
    await db.insert(apiUsageLogs).values(entry);
  } catch (err) {
    console.error("[Usage] Failed to log usage:", err);
  }
}

export async function getUserUsageStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(apiUsageLogs)
    .where(eq(apiUsageLogs.userId, userId))
    .orderBy(desc(apiUsageLogs.createdAt));
  const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = rows.reduce((s, r) => s + parseFloat(r.costUsd as string), 0);
  const analyzeCount = rows.filter(r => r.action === "analyze").length;
  const chatCount = rows.filter(r => r.action === "chat").length;
  return { rows, totalTokens, totalCost, analyzeCount, chatCount };
}

export async function getAllUsersWithUsage() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
  const usageRows = await db
    .select({
      userId: apiUsageLogs.userId,
      totalTokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
      totalCost: sql<string>`SUM(${apiUsageLogs.costUsd})`,
      callCount: sql<number>`COUNT(*)`,
    })
    .from(apiUsageLogs)
    .groupBy(apiUsageLogs.userId);
  const usageMap = new Map(usageRows.map(r => [r.userId, r]));
  return allUsers.map(u => ({
    ...u,
    totalTokens: usageMap.get(u.id)?.totalTokens ?? 0,
    totalCost: parseFloat(usageMap.get(u.id)?.totalCost ?? "0"),
    callCount: usageMap.get(u.id)?.callCount ?? 0,
  }));
}

export async function getPlatformStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  const [analysisCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(analyses);
  const [usageTotals] = await db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(${apiUsageLogs.totalTokens}), 0)`,
      totalCost: sql<string>`COALESCE(SUM(${apiUsageLogs.costUsd}), '0')`,
      totalCalls: sql<number>`COUNT(*)`,
    })
    .from(apiUsageLogs);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [activeThisMonth] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${apiUsageLogs.userId})` })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= ${startOfMonth}`);
  const dailyUsageRaw = await db
    .select({
      dateBucket: sql<string>`DATE(${apiUsageLogs.createdAt})`,
      calls: sql<number>`COUNT(*)`,
      tokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
    })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= NOW() - INTERVAL '30 days'`)
    .groupBy(sql`DATE(${apiUsageLogs.createdAt})`)
    .orderBy(sql`DATE(${apiUsageLogs.createdAt})`);
  const dailyUsage = dailyUsageRaw.map(r => ({
    date: r.dateBucket,
    calls: Number(r.calls),
    tokens: Number(r.tokens),
  }));
  return {
    totalUsers: userCount?.count ?? 0,
    totalAnalyses: analysisCount?.count ?? 0,
    totalTokens: usageTotals?.totalTokens ?? 0,
    totalCost: parseFloat(usageTotals?.totalCost ?? "0"),
    totalCalls: usageTotals?.totalCalls ?? 0,
    activeUsersThisMonth: activeThisMonth?.count ?? 0,
    dailyUsage,
  };
}

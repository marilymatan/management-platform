import { eq, desc, sql, and, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { InsertUser, users, analyses, chatMessages, apiUsageLogs, userProfiles, gmailConnections, smartInvoices, auditLogs, familyMembers, documentClassifications, categorySummaryCache, type InsertAnalysis, type InsertChatMessage, type InsertApiUsageLog, type InsertUserProfile, type InsertFamilyMember, type InsertDocumentClassification, type InsertCategorySummaryCache } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { PolicyAnalysis } from "@shared/insurance";
import { encryptField, decryptField, encryptJson, decryptJson } from "./encryption";
import { storageDelete } from "./storage";
import { deleteAnalysisArtifacts } from "./analysisCleanup";

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getPool(): pg.Pool {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    _pool.on("error", (err) => {
      console.error("[Database] Pool error:", err.message);
    });
  }
  return _pool!;
}

export function getSharedPool(): pg.Pool {
  return getPool();
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle({ client: getPool() });
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
    } else if (user.email && user.email === ENV.adminEmail) {
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

interface CreateAnalysisInput {
  sessionId: string;
  userId?: number | null;
  files: Array<{
    name: string;
    size: number;
    fileKey?: string;
    url?: string;
    mimeType?: string;
  }>;
  status?: "pending" | "processing" | "completed" | "error";
  insuranceCategory?: "health" | "life" | "car" | "home" | null;
}

type AnalysisStatus = "pending" | "processing" | "completed" | "error";

type AnalysisStatusUpdate = {
  extractedText?: string | null;
  analysisResult?: PolicyAnalysis | null;
  errorMessage?: string | null;
  insuranceCategory?: string | null;
  attemptCount?: number;
  lockedBy?: string | null;
  lastHeartbeatAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  nextRetryAt?: Date | null;
};

type EncryptedAnalysisJsonEnvelope = {
  __encrypted: true;
  ciphertext: string;
};

function isEncryptedAnalysisJsonEnvelope(value: unknown): value is EncryptedAnalysisJsonEnvelope {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.__encrypted === true && typeof record.ciphertext === "string";
}

export function serializeAnalysisJsonCompat(value: unknown): string {
  return JSON.stringify({
    __encrypted: true,
    ciphertext: encryptJson(value),
  } satisfies EncryptedAnalysisJsonEnvelope);
}

export function decodeAnalysisJsonCompat<T = unknown>(value: unknown): T | null {
  if (value == null) {
    return null;
  }

  if (isEncryptedAnalysisJsonEnvelope(value)) {
    return decryptJson<T>(value.ciphertext);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isEncryptedAnalysisJsonEnvelope(parsed)) {
        return decryptJson<T>(parsed.ciphertext);
      }
      return parsed as T;
    } catch {
      return decryptJson<T>(value);
    }
  }

  return value as T;
}

function decryptAnalysisData(row: any): any {
  if (!row) return row;
  const decrypted = { ...row };
  if (decrypted.files !== undefined && decrypted.files !== null) {
    const parsed = decodeAnalysisJsonCompat(decrypted.files);
    decrypted.files = parsed ?? decrypted.files;
  }
  if (decrypted.extractedText && typeof decrypted.extractedText === "string") {
    decrypted.extractedText = decryptField(decrypted.extractedText);
  }
  if (decrypted.analysisResult !== undefined && decrypted.analysisResult !== null) {
    decrypted.analysisResult = decodeAnalysisJsonCompat(decrypted.analysisResult);
  }
  if (decrypted.errorMessage && typeof decrypted.errorMessage === "string") {
    decrypted.errorMessage = decryptField(decrypted.errorMessage);
  }
  return decrypted;
}

function normalizeAnalysisFile(file: CreateAnalysisInput["files"][number]) {
  const name = typeof file.name === "string" && file.name.trim() ? file.name.trim() : "file";
  const size = typeof file.size === "number" && Number.isFinite(file.size) && file.size >= 0
    ? Math.floor(file.size)
    : 0;
  const normalized: {
    name: string;
    size: number;
    fileKey?: string;
    url?: string;
    mimeType?: string;
  } = { name, size };

  const fileKey = typeof file.fileKey === "string" && file.fileKey.trim() ? file.fileKey.trim() : "";
  if (fileKey) {
    normalized.fileKey = fileKey;
  }

  const url = typeof file.url === "string" && file.url.trim() ? file.url.trim() : "";
  if (url) {
    normalized.url = url;
  }

  const mimeType = typeof file.mimeType === "string" && file.mimeType.trim() ? file.mimeType.trim() : "";
  if (mimeType) {
    normalized.mimeType = mimeType;
  }

  return normalized;
}

export function normalizeAnalysisFiles(files: CreateAnalysisInput["files"]) {
  return (files ?? []).map(normalizeAnalysisFile);
}

export async function createAnalysis(data: CreateAnalysisInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const normalizedFiles = normalizeAnalysisFiles(data.files);
  const row: InsertAnalysis = {
    sessionId: data.sessionId,
    files: serializeAnalysisJsonCompat(normalizedFiles),
    status: data.status ?? "pending",
  };
  if (data.userId != null) row.userId = data.userId;
  if (data.insuranceCategory) row.insuranceCategory = data.insuranceCategory;
  await db.insert(analyses).values(row);
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
  status: AnalysisStatus,
  data?: AnalysisStatusUpdate
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const updateData: Partial<InsertAnalysis> = {
    status,
    updatedAt: new Date(),
  };
  if (data?.extractedText !== undefined) {
    updateData.extractedText = data.extractedText == null ? null : encryptField(data.extractedText);
  }
  if (data?.analysisResult !== undefined) {
    updateData.analysisResult = data.analysisResult == null ? null : serializeAnalysisJsonCompat(data.analysisResult);
  }
  if (data?.errorMessage !== undefined) {
    updateData.errorMessage = data.errorMessage == null ? null : encryptField(data.errorMessage);
  }
  if (data?.insuranceCategory !== undefined) {
    updateData.insuranceCategory = data.insuranceCategory as InsertAnalysis["insuranceCategory"];
  }
  if (data?.attemptCount !== undefined) {
    updateData.attemptCount = data.attemptCount;
  }
  if (data?.lockedBy !== undefined) {
    updateData.lockedBy = data.lockedBy;
  }
  if (data?.lastHeartbeatAt !== undefined) {
    updateData.lastHeartbeatAt = data.lastHeartbeatAt;
  }
  if (data?.startedAt !== undefined) {
    updateData.startedAt = data.startedAt;
  }
  if (data?.completedAt !== undefined) {
    updateData.completedAt = data.completedAt;
  }
  if (data?.nextRetryAt !== undefined) {
    updateData.nextRetryAt = data.nextRetryAt;
  }
  await db.update(analyses).set(updateData).where(eq(analyses.sessionId, sessionId));
}

export async function claimNextPendingAnalysis(workerId: string, staleBefore: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT ${analyses.id}
      FROM ${analyses}
      WHERE (
        ${analyses.status} = 'pending'
        AND (${analyses.nextRetryAt} IS NULL OR ${analyses.nextRetryAt} <= ${now})
      ) OR (
        ${analyses.status} = 'processing'
        AND (${analyses.lastHeartbeatAt} IS NULL OR ${analyses.lastHeartbeatAt} <= ${staleBefore})
      )
      ORDER BY ${analyses.createdAt} ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE ${analyses}
    SET
      ${analyses.status} = 'processing',
      ${analyses.attemptCount} = ${analyses.attemptCount} + 1,
      ${analyses.lockedBy} = ${workerId},
      ${analyses.lastHeartbeatAt} = ${now},
      ${analyses.startedAt} = COALESCE(${analyses.startedAt}, ${now}),
      ${analyses.completedAt} = NULL,
      ${analyses.nextRetryAt} = NULL,
      ${analyses.errorMessage} = NULL,
      ${analyses.updatedAt} = ${now}
    FROM candidate
    WHERE ${analyses.id} = candidate.id
    RETURNING *
  `);
  const row = result.rows[0];
  return row ? decryptAnalysisData(row) : null;
}

export async function heartbeatAnalysis(sessionId: string, workerId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(analyses)
    .set({
      lastHeartbeatAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(analyses.sessionId, sessionId), eq(analyses.lockedBy, workerId), eq(analyses.status, "processing")));
}

export async function completeAnalysis(sessionId: string, workerId: string, data: {
  analysisResult: PolicyAnalysis;
  insuranceCategory?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  await db
    .update(analyses)
    .set({
      status: "completed",
      analysisResult: serializeAnalysisJsonCompat(data.analysisResult),
      insuranceCategory: (data.insuranceCategory ?? null) as InsertAnalysis["insuranceCategory"],
      errorMessage: null,
      lockedBy: null,
      lastHeartbeatAt: now,
      completedAt: now,
      nextRetryAt: null,
      updatedAt: now,
    })
    .where(and(eq(analyses.sessionId, sessionId), eq(analyses.lockedBy, workerId)));
}

export async function requeueAnalysis(sessionId: string, workerId: string, nextRetryAt: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  await db
    .update(analyses)
    .set({
      status: "pending",
      lockedBy: null,
      lastHeartbeatAt: null,
      nextRetryAt,
      errorMessage: null,
      completedAt: null,
      updatedAt: now,
    })
    .where(and(eq(analyses.sessionId, sessionId), eq(analyses.lockedBy, workerId)));
}

export async function failAnalysis(sessionId: string, workerId: string, errorMessage: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  await db
    .update(analyses)
    .set({
      status: "error",
      errorMessage: encryptField(errorMessage),
      lockedBy: null,
      lastHeartbeatAt: now,
      nextRetryAt: null,
      updatedAt: now,
    })
    .where(and(eq(analyses.sessionId, sessionId), eq(analyses.lockedBy, workerId)));
}

export async function resetAnalysisForRetry(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(analyses)
    .set({
      status: "pending",
      errorMessage: null,
      lockedBy: null,
      lastHeartbeatAt: null,
      nextRetryAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(analyses.sessionId, sessionId));
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
    .orderBy(desc(analyses.createdAt));
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
  await deleteAnalysisArtifacts({
    db,
    sessionId,
    userId,
    files: analysis.files as Array<string | { fileKey?: string | null }> | null | undefined,
    deleteStoredFile: storageDelete,
  });
}

const MODEL_COST_PER_1K_TOKENS: Record<string, number> = {
  "gemini-2.5-flash": 0.0025,
  "gemini-2.5-pro": 0.0125,
};

function getCostPer1kTokens(model?: string | null) {
  if (!model) return MODEL_COST_PER_1K_TOKENS["gemini-2.5-flash"];
  if (MODEL_COST_PER_1K_TOKENS[model] !== undefined) {
    return MODEL_COST_PER_1K_TOKENS[model];
  }
  if (model.includes("pro")) {
    return MODEL_COST_PER_1K_TOKENS["gemini-2.5-pro"];
  }
  if (model.includes("flash")) {
    return MODEL_COST_PER_1K_TOKENS["gemini-2.5-flash"];
  }
  return MODEL_COST_PER_1K_TOKENS["gemini-2.5-flash"];
}

export async function logApiUsage(data: {
  userId?: number | null;
  sessionId?: string | null;
  action: "analyze" | "chat";
  model?: string | null;
  promptTokens: number;
  completionTokens: number;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Usage] Database not available, skipping usage log");
    return;
  }
  const totalTokens = data.promptTokens + data.completionTokens;
  const costUsd = ((totalTokens / 1000) * getCostPer1kTokens(data.model)).toFixed(6);
  const entry: InsertApiUsageLog = {
    userId: data.userId ?? null,
    sessionId: data.sessionId ?? null,
    action: data.action,
    model: data.model ?? "unknown",
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

export async function getUserProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (result.length === 0) return null;
  const profile = result[0];
  return {
    ...profile,
    businessName: profile.businessName ? decryptField(profile.businessName) : profile.businessName,
    businessTaxId: profile.businessTaxId ? decryptField(profile.businessTaxId) : profile.businessTaxId,
    businessEmailDomains: profile.businessEmailDomains ? decryptField(profile.businessEmailDomains) : profile.businessEmailDomains,
  };
}

export async function upsertUserProfile(userId: number, data: Omit<InsertUserProfile, "id" | "userId" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const preparedData: Omit<InsertUserProfile, "id" | "userId" | "createdAt" | "updatedAt"> = { ...data };
  for (const field of ["businessName", "businessTaxId", "businessEmailDomains"] as const) {
    const value = preparedData[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      preparedData[field] = value ?? null;
      continue;
    }
    const normalized = value.trim();
    preparedData[field] = normalized ? encryptField(normalized) : null;
  }

  const existing = await getUserProfile(userId);
  if (existing) {
    await db
      .update(userProfiles)
      .set({ ...preparedData, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  } else {
    await db.insert(userProfiles).values({ ...preparedData, userId });
  }
  return getUserProfile(userId);
}

interface FamilyMemberInput {
  id?: number;
  fullName: string;
  relation: "spouse" | "child" | "parent" | "dependent" | "other";
  birthDate?: Date | null;
  ageLabel?: string | null;
  gender?: "male" | "female" | "other" | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  activities?: string | null;
  insuranceNotes?: string | null;
  notes?: string | null;
}

interface DocumentClassificationInput {
  documentKey: string;
  sourceType: "analysis_file" | "invoice_pdf";
  sourceId?: string | null;
  manualType: "insurance" | "money" | "health" | "education" | "family" | "other";
  familyMemberId?: number | null;
}

const familyRelationOrder: Record<FamilyMemberInput["relation"], number> = {
  spouse: 0,
  child: 1,
  parent: 2,
  dependent: 3,
  other: 4,
};

function encryptOptionalText(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const normalized = value?.trim();
  return normalized ? encryptField(normalized) : null;
}

function decryptOptionalText(value: string | null | undefined) {
  return value ? decryptField(value) : null;
}

function decryptFamilyMemberRow(row: any) {
  return {
    ...row,
    fullName: decryptField(row.fullName),
    ageLabel: decryptOptionalText(row.ageLabel),
    allergies: decryptOptionalText(row.allergies),
    medicalNotes: decryptOptionalText(row.medicalNotes),
    activities: decryptOptionalText(row.activities),
    insuranceNotes: decryptOptionalText(row.insuranceNotes),
    notes: decryptOptionalText(row.notes),
  };
}

function calculateAgeFromBirthDate(birthDate: Date | null | undefined) {
  if (!birthDate) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  if (!Number.isFinite(age) || age < 0 || age > 120) {
    return null;
  }
  return age;
}

function parseLegacyAgeLabels(raw: string | null | undefined) {
  return (raw ?? "")
    .split(/[,/|\n]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function getChildAgeLabel(member: { birthDate?: Date | null; ageLabel?: string | null }) {
  if (member.ageLabel) {
    return member.ageLabel;
  }
  const age = calculateAgeFromBirthDate(member.birthDate ?? null);
  return age === null ? null : String(age);
}

async function getFamilyMemberRow(userId: number, memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.userId, userId)))
    .limit(1);
  return result[0] ?? null;
}

async function syncFamilyProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const members = await getFamilyMembers(userId);
  const childMembers = members.filter((member) => member.relation === "child");
  const childrenAges = childMembers
    .map((member) => getChildAgeLabel(member))
    .filter((value): value is string => Boolean(value));
  const existing = await getUserProfile(userId);
  const updateData = {
    numberOfChildren: childMembers.length,
    childrenAges: childrenAges.length > 0 ? childrenAges.join(", ") : null,
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(userProfiles).set(updateData).where(eq(userProfiles.userId, userId));
    return;
  }
  await db.insert(userProfiles).values({
    userId,
    numberOfChildren: updateData.numberOfChildren,
    childrenAges: updateData.childrenAges,
  });
}

export async function getFamilyMembers(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.userId, userId))
    .orderBy(asc(familyMembers.createdAt));
  return result
    .map(decryptFamilyMemberRow)
    .sort((a, b) => {
      const relationOrder = familyRelationOrder[a.relation as FamilyMemberInput["relation"]] - familyRelationOrder[b.relation as FamilyMemberInput["relation"]];
      if (relationOrder !== 0) {
        return relationOrder;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

export async function upsertFamilyMember(userId: number, data: FamilyMemberInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const fullName = data.fullName.trim();
  if (!fullName) {
    throw new Error("Family member name is required");
  }
  const preparedData: Omit<InsertFamilyMember, "id" | "userId" | "createdAt" | "updatedAt"> = {
    fullName: encryptField(fullName),
    relation: data.relation,
    birthDate: data.birthDate ?? null,
    ageLabel: encryptOptionalText(data.ageLabel) ?? null,
    gender: data.gender ?? null,
    allergies: encryptOptionalText(data.allergies) ?? null,
    medicalNotes: encryptOptionalText(data.medicalNotes) ?? null,
    activities: encryptOptionalText(data.activities) ?? null,
    insuranceNotes: encryptOptionalText(data.insuranceNotes) ?? null,
    notes: encryptOptionalText(data.notes) ?? null,
  };

  if (data.id) {
    const existing = await getFamilyMemberRow(userId, data.id);
    if (!existing) {
      throw new Error("Family member not found");
    }
    await db
      .update(familyMembers)
      .set({ ...preparedData, updatedAt: new Date() })
      .where(eq(familyMembers.id, data.id));
    await syncFamilyProfile(userId);
    const updated = await getFamilyMemberRow(userId, data.id);
    return updated ? decryptFamilyMemberRow(updated) : null;
  }

  const [created] = await db
    .insert(familyMembers)
    .values({ ...preparedData, userId })
    .returning({ id: familyMembers.id });
  await syncFamilyProfile(userId);
  const inserted = await getFamilyMemberRow(userId, created.id);
  return inserted ? decryptFamilyMemberRow(inserted) : null;
}

export async function deleteFamilyMember(userId: number, memberId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getFamilyMemberRow(userId, memberId);
  if (!existing) {
    throw new Error("Family member not found");
  }
  await db
    .update(documentClassifications)
    .set({
      familyMemberId: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentClassifications.userId, userId),
        eq(documentClassifications.familyMemberId, memberId)
      )
    );
  await db.delete(familyMembers).where(eq(familyMembers.id, memberId));
  await syncFamilyProfile(userId);
}

export async function bootstrapFamilyMembersFromProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existingMembers = await getFamilyMembers(userId);
  if (existingMembers.length > 0) {
    return existingMembers;
  }
  const profile = await getUserProfile(userId);
  if (!profile) {
    return [];
  }
  const legacyMembers: Array<Omit<InsertFamilyMember, "id" | "userId" | "createdAt" | "updatedAt">> = [];
  const ageLabels = parseLegacyAgeLabels(profile.childrenAges);
  if (profile.maritalStatus === "married") {
    legacyMembers.push({
      fullName: encryptField("בן/בת זוג"),
      relation: "spouse",
      birthDate: null,
      ageLabel: null,
      gender: null,
      allergies: null,
      medicalNotes: null,
      activities: null,
      insuranceNotes: null,
      notes: null,
    });
  }
  for (let index = 0; index < (profile.numberOfChildren ?? 0); index += 1) {
    legacyMembers.push({
      fullName: encryptField(`ילד ${index + 1}`),
      relation: "child",
      birthDate: null,
      ageLabel: encryptOptionalText(ageLabels[index]) ?? null,
      gender: null,
      allergies: null,
      medicalNotes: null,
      activities: null,
      insuranceNotes: null,
      notes: null,
    });
  }
  if (legacyMembers.length === 0) {
    return [];
  }
  await db.insert(familyMembers).values(legacyMembers.map((member) => ({ ...member, userId })));
  await syncFamilyProfile(userId);
  return getFamilyMembers(userId);
}

export async function getDocumentClassifications(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(documentClassifications)
    .where(eq(documentClassifications.userId, userId))
    .orderBy(desc(documentClassifications.updatedAt));
}

export async function upsertDocumentClassification(userId: number, data: DocumentClassificationInput) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertDocumentClassification = {
    userId,
    documentKey: data.documentKey,
    sourceType: data.sourceType,
    sourceId: data.sourceId ?? null,
    manualType: data.manualType,
    familyMemberId: data.familyMemberId ?? null,
  };
  await db
    .insert(documentClassifications)
    .values(values)
    .onConflictDoUpdate({
      target: [documentClassifications.userId, documentClassifications.documentKey],
      set: {
        sourceType: data.sourceType,
        sourceId: data.sourceId ?? null,
        manualType: data.manualType,
        familyMemberId: data.familyMemberId ?? null,
        updatedAt: new Date(),
      },
    });
  const result = await db
    .select()
    .from(documentClassifications)
    .where(
      and(
        eq(documentClassifications.userId, userId),
        eq(documentClassifications.documentKey, data.documentKey)
      )
    )
    .limit(1);
  return result[0] ?? null;
}

export async function bulkUpsertDocumentClassifications(userId: number, items: DocumentClassificationInput[]) {
  const results = [];
  for (const item of items) {
    const saved = await upsertDocumentClassification(userId, item);
    if (saved) {
      results.push(saved);
    }
  }
  return results;
}

export async function getAdminDashboardStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [userCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(users);
  const [analysisCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(analyses);
  const [chatCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(chatMessages);
  const [gmailCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(gmailConnections);
  const [invoiceCount] = await db.select({ count: sql<number>`COUNT(*)` }).from(smartInvoices);

  const [usageTotals] = await db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(${apiUsageLogs.totalTokens}), 0)`,
      totalCost: sql<string>`COALESCE(SUM(${apiUsageLogs.costUsd}), '0')`,
      totalCalls: sql<number>`COUNT(*)`,
      totalPromptTokens: sql<number>`COALESCE(SUM(${apiUsageLogs.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`COALESCE(SUM(${apiUsageLogs.completionTokens}), 0)`,
    })
    .from(apiUsageLogs);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [activeThisMonth] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${apiUsageLogs.userId})` })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= ${startOfMonth}`);

  const [monthCost] = await db
    .select({ cost: sql<string>`COALESCE(SUM(${apiUsageLogs.costUsd}), '0')` })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= ${startOfMonth}`);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthCostValue = parseFloat(monthCost?.cost ?? "0");
  const projectedMonthlyCost = dayOfMonth > 0 ? (monthCostValue / dayOfMonth) * daysInMonth : 0;

  const dailyUsageRaw = await db
    .select({
      dateBucket: sql<string>`DATE(${apiUsageLogs.createdAt})`,
      calls: sql<number>`COUNT(*)`,
      tokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
      cost: sql<string>`SUM(${apiUsageLogs.costUsd})`,
    })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= NOW() - INTERVAL '30 days'`)
    .groupBy(sql`DATE(${apiUsageLogs.createdAt})`)
    .orderBy(sql`DATE(${apiUsageLogs.createdAt})`);

  const dailyUsage = dailyUsageRaw.map(r => ({
    date: r.dateBucket,
    calls: Number(r.calls),
    tokens: Number(r.tokens),
    cost: parseFloat(r.cost ?? "0"),
  }));

  const [completedCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(analyses)
    .where(sql`${analyses.status} = 'completed'`);
  const [errorCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(analyses)
    .where(sql`${analyses.status} = 'error'`);

  const totalAnalyses = Number(analysisCount?.count ?? 0);
  const completed = Number(completedCount?.count ?? 0);
  const errors = Number(errorCount?.count ?? 0);
  const successRate = totalAnalyses > 0 ? Math.round((completed / totalAnalyses) * 100) : 100;

  return {
    totalUsers: Number(userCount?.count ?? 0),
    totalAnalyses,
    totalChats: Number(chatCount?.count ?? 0),
    totalGmailConnections: Number(gmailCount?.count ?? 0),
    totalInvoices: Number(invoiceCount?.count ?? 0),
    totalTokens: Number(usageTotals?.totalTokens ?? 0),
    totalPromptTokens: Number(usageTotals?.totalPromptTokens ?? 0),
    totalCompletionTokens: Number(usageTotals?.totalCompletionTokens ?? 0),
    totalCost: parseFloat(usageTotals?.totalCost ?? "0"),
    totalCalls: Number(usageTotals?.totalCalls ?? 0),
    activeUsersThisMonth: Number(activeThisMonth?.count ?? 0),
    currentMonthCost: monthCostValue,
    projectedMonthlyCost,
    successRate,
    completedAnalyses: completed,
    errorAnalyses: errors,
    dailyUsage,
  };
}

export async function getUserDetailedSummary(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");

  const userAnalyses = await db
    .select({
      sessionId: analyses.sessionId,
      status: analyses.status,
      insuranceCategory: analyses.insuranceCategory,
      createdAt: analyses.createdAt,
    })
    .from(analyses)
    .where(eq(analyses.userId, userId))
    .orderBy(desc(analyses.createdAt));

  const usageRows = await db
    .select()
    .from(apiUsageLogs)
    .where(eq(apiUsageLogs.userId, userId))
    .orderBy(desc(apiUsageLogs.createdAt));

  const totalTokens = usageRows.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = usageRows.reduce((s, r) => s + parseFloat(r.costUsd as string), 0);
  const analyzeCount = usageRows.filter(r => r.action === "analyze").length;
  const chatCount = usageRows.filter(r => r.action === "chat").length;

  const gmailConns = await db
    .select({
      id: gmailConnections.id,
      email: gmailConnections.email,
      lastSyncedAt: gmailConnections.lastSyncedAt,
      lastSyncCount: gmailConnections.lastSyncCount,
    })
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId));

  const [invoiceStats] = await db
    .select({ count: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${smartInvoices.amount}::numeric), 0)` })
    .from(smartInvoices)
    .where(eq(smartInvoices.userId, userId));

  const recentAudit = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastSignedIn: user.lastSignedIn,
    },
    analyses: userAnalyses,
    usage: {
      totalTokens,
      totalCost,
      analyzeCount,
      chatCount,
      totalCalls: usageRows.length,
    },
    gmail: gmailConns,
    invoices: {
      count: Number(invoiceStats?.count ?? 0),
      totalAmount: parseFloat(invoiceStats?.total ?? "0"),
    },
    recentAudit,
  };
}

export async function getLLMUsageBreakdown() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const costByUser = await db
    .select({
      userId: apiUsageLogs.userId,
      userName: users.name,
      userEmail: users.email,
      totalCost: sql<string>`SUM(${apiUsageLogs.costUsd})`,
      totalTokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
      callCount: sql<number>`COUNT(*)`,
    })
    .from(apiUsageLogs)
    .leftJoin(users, eq(apiUsageLogs.userId, users.id))
    .groupBy(apiUsageLogs.userId, users.name, users.email)
    .orderBy(sql`SUM(${apiUsageLogs.costUsd}) DESC`)
    .limit(15);

  const costByAction = await db
    .select({
      action: apiUsageLogs.action,
      totalCost: sql<string>`SUM(${apiUsageLogs.costUsd})`,
      totalTokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
      promptTokens: sql<number>`SUM(${apiUsageLogs.promptTokens})`,
      completionTokens: sql<number>`SUM(${apiUsageLogs.completionTokens})`,
      callCount: sql<number>`COUNT(*)`,
    })
    .from(apiUsageLogs)
    .groupBy(apiUsageLogs.action);

  const dailyCost = await db
    .select({
      date: sql<string>`DATE(${apiUsageLogs.createdAt})`,
      cost: sql<string>`SUM(${apiUsageLogs.costUsd})`,
      tokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= NOW() - INTERVAL '30 days'`)
    .groupBy(sql`DATE(${apiUsageLogs.createdAt})`)
    .orderBy(sql`DATE(${apiUsageLogs.createdAt})`);

  const weeklyCost = await db
    .select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${apiUsageLogs.createdAt}), 'YYYY-MM-DD')`,
      cost: sql<string>`SUM(${apiUsageLogs.costUsd})`,
      tokens: sql<number>`SUM(${apiUsageLogs.totalTokens})`,
      calls: sql<number>`COUNT(*)`,
    })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.createdAt} >= NOW() - INTERVAL '12 weeks'`)
    .groupBy(sql`DATE_TRUNC('week', ${apiUsageLogs.createdAt})`)
    .orderBy(sql`DATE_TRUNC('week', ${apiUsageLogs.createdAt})`);

  const [analyzeTotals] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      cost: sql<string>`COALESCE(SUM(${apiUsageLogs.costUsd}), '0')`,
    })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.action} = 'analyze'`);

  const [chatTotals] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      cost: sql<string>`COALESCE(SUM(${apiUsageLogs.costUsd}), '0')`,
    })
    .from(apiUsageLogs)
    .where(sql`${apiUsageLogs.action} = 'chat'`);

  const avgCostPerAnalysis = Number(analyzeTotals?.count ?? 0) > 0
    ? parseFloat(analyzeTotals?.cost ?? "0") / Number(analyzeTotals.count)
    : 0;

  const avgCostPerChat = Number(chatTotals?.count ?? 0) > 0
    ? parseFloat(chatTotals?.cost ?? "0") / Number(chatTotals.count)
    : 0;

  return {
    costByUser: costByUser.map(r => ({
      userId: r.userId,
      userName: r.userName,
      userEmail: r.userEmail,
      totalCost: parseFloat(r.totalCost ?? "0"),
      totalTokens: Number(r.totalTokens ?? 0),
      callCount: Number(r.callCount ?? 0),
    })),
    costByAction: costByAction.map(r => ({
      action: r.action,
      totalCost: parseFloat(r.totalCost ?? "0"),
      totalTokens: Number(r.totalTokens ?? 0),
      promptTokens: Number(r.promptTokens ?? 0),
      completionTokens: Number(r.completionTokens ?? 0),
      callCount: Number(r.callCount ?? 0),
    })),
    dailyCost: dailyCost.map(r => ({
      date: r.date,
      cost: parseFloat(r.cost ?? "0"),
      tokens: Number(r.tokens ?? 0),
      calls: Number(r.calls ?? 0),
    })),
    weeklyCost: weeklyCost.map(r => ({
      week: r.week,
      cost: parseFloat(r.cost ?? "0"),
      tokens: Number(r.tokens ?? 0),
      calls: Number(r.calls ?? 0),
    })),
    avgCostPerAnalysis,
    avgCostPerChat,
  };
}

export async function getSystemHealth() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const statusDist = await db
    .select({
      status: analyses.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(analyses)
    .groupBy(analyses.status);

  const gmailStats = await db
    .select({
      totalConnections: sql<number>`COUNT(*)`,
      recentSyncs: sql<number>`COUNT(*) FILTER (WHERE ${gmailConnections.lastSyncedAt} >= NOW() - INTERVAL '24 hours')`,
    })
    .from(gmailConnections);

  const avgDuration = await db
    .select({
      avgMs: sql<string>`COALESCE(AVG(EXTRACT(EPOCH FROM (${analyses.updatedAt} - ${analyses.createdAt})) * 1000), 0)`,
    })
    .from(analyses)
    .where(sql`${analyses.status} = 'completed'`);

  const recentErrors = await db
    .select({
      sessionId: analyses.sessionId,
      userId: analyses.userId,
      createdAt: analyses.createdAt,
      updatedAt: analyses.updatedAt,
    })
    .from(analyses)
    .where(sql`${analyses.status} = 'error'`)
    .orderBy(desc(analyses.updatedAt))
    .limit(10);

  const categoryDist = await db
    .select({
      category: analyses.insuranceCategory,
      count: sql<number>`COUNT(*)`,
    })
    .from(analyses)
    .where(sql`${analyses.insuranceCategory} IS NOT NULL`)
    .groupBy(analyses.insuranceCategory);

  return {
    analysisStatusDistribution: statusDist.map(r => ({
      status: r.status,
      count: Number(r.count),
    })),
    gmailSyncStatus: {
      totalConnections: Number(gmailStats[0]?.totalConnections ?? 0),
      recentSyncs24h: Number(gmailStats[0]?.recentSyncs ?? 0),
    },
    avgAnalysisDurationMs: parseFloat(avgDuration[0]?.avgMs ?? "0"),
    recentErrors,
    categoryDistribution: categoryDist.map(r => ({
      category: r.category,
      count: Number(r.count),
    })),
  };
}

export async function getNewUsersOverTime(days = 30) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({
      date: sql<string>`DATE(${users.createdAt})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(users)
    .where(sql`${users.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`)
    .groupBy(sql`DATE(${users.createdAt})`)
    .orderBy(sql`DATE(${users.createdAt})`);

  return result.map(r => ({
    date: r.date,
    count: Number(r.count),
  }));
}

export async function getCategoryDistribution() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .select({
      category: analyses.insuranceCategory,
      count: sql<number>`COUNT(*)`,
    })
    .from(analyses)
    .where(sql`${analyses.insuranceCategory} IS NOT NULL`)
    .groupBy(analyses.insuranceCategory);

  return result.map(r => ({
    category: r.category as string,
    count: Number(r.count),
  }));
}

export async function getCategorySummaryCache(userId: number, category: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(categorySummaryCache)
    .where(
      and(
        eq(categorySummaryCache.userId, userId),
        eq(categorySummaryCache.category, category as any)
      )
    )
    .limit(1);
  if (result.length === 0) return null;
  const row = result[0];
  return {
    ...row,
    summaryData: decryptJson(row.summaryData),
  };
}

export async function upsertCategorySummaryCache(
  userId: number,
  category: string,
  summaryData: unknown,
  dataHash: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const encrypted = encryptJson(summaryData);
  await db
    .insert(categorySummaryCache)
    .values({
      userId,
      category: category as any,
      summaryData: encrypted,
      dataHash,
    })
    .onConflictDoUpdate({
      target: [categorySummaryCache.userId, categorySummaryCache.category],
      set: {
        summaryData: encrypted,
        dataHash,
        updatedAt: new Date(),
      },
    });
}

export async function invalidateCategorySummaryCacheForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(categorySummaryCache).where(eq(categorySummaryCache.userId, userId));
}

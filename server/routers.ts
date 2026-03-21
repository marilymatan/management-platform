import crypto from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { policyAnalysisWorker } from "./policyAnalysisWorker";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { storagePut, storageGet, sanitizeFilename, generateSignedFileUrl } from "./storage";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import {
  createAnalysis,
  getAnalysisBySessionId,
  addChatMessage,
  getChatHistory,
  getUserAnalyses,
  linkAnalysisToUser,
  deleteAnalysis,
  logApiUsage,
  getUserUsageStats,
  getAllUsersWithUsage,
  getPlatformStats,
  getUserProfile,
  upsertUserProfile,
  getFamilyMembers,
  upsertFamilyMember,
  deleteFamilyMember,
  bootstrapFamilyMembersFromProfile,
  getDocumentClassifications,
  upsertDocumentClassification,
  bulkUpsertDocumentClassifications,
  getAdminDashboardStats,
  getUserDetailedSummary,
  getLLMUsageBreakdown,
  getSystemHealth,
  getNewUsersOverTime,
  getCategoryDistribution,
  getCategorySummaryCache,
  resetAnalysisForRetry,
  updateAnalysisStatus,
  upsertCategorySummaryCache,
} from "./db";
import { TRPCError } from "@trpc/server";
import {
  inferInsuranceCategory,
  type InsuranceCategory,
  type InsuranceCategoryLlmSummary,
  type PolicyAnalysis,
} from "@shared/insurance";
import {
  getGmailAuthUrl,
  exchangeCodeForTokens,
  saveGmailConnection,
  discoverPolicyPdfs,
  getAllGmailConnections,
  disconnectGmail,
  getInsuranceDiscoveries as listInsuranceDiscoveries,
  importPolicyPdfFromGmail,
  scanGmailForInvoices,
} from "./gmail";
import { getDb } from "./db";
import {
  smartInvoices,
  categoryMappings,
  insuranceArtifacts,
  insuranceScoreHistory,
  savingsOpportunities,
  actionItems,
  monthlyReports,
} from "../drizzle/schema";
import { decryptField, decryptJson, encryptJson } from "./encryption";
import { eq, desc, and } from "drizzle-orm";
import { audit, getClientIp, getRecentAuditLogs, getSecurityEvents } from "./auditLog";
import { summarizeMonthlyInvoices } from "./invoiceSummary";
import {
  buildAssistantHomeContext as buildLumiHomeContext,
  buildAssistantSystemPrompt as buildLumiSystemPrompt,
  getAssistantSessionId as getLumiSessionId,
  shouldUseComplexLumiModel,
} from "./assistantContext";
import {
  buildActionItemsDraft,
  buildInsuranceScoreSnapshot,
  buildManualPolicyAnalysis,
  buildMonthlyReportDraft,
  buildSavingsReportDraft,
  buildWorkspaceDataHash,
} from "./insuranceHub";
import { buildFamilyCoverageSnapshot } from "../client/src/lib/familyCoverage";

function signOAuthState(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", ENV.cookieSecret).update(json).digest("hex");
  return Buffer.from(JSON.stringify({ d: json, s: sig })).toString("base64");
}

export function verifyOAuthState(state: string): Record<string, unknown> {
  const { d, s } = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
  const expected = crypto.createHmac("sha256", ENV.cookieSecret).update(d).digest("hex");
  if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) {
    throw new Error("Invalid state signature");
  }
  const payload = JSON.parse(d);
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("State expired");
  }
  return payload;
}

function normalizeReturnTo(value?: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/expenses";
  }
  return value;
}

function extractLLMContent(response: any): string {
  const choice = response.choices?.[0];
  if (!choice?.message) {
    throw new Error("Empty response from AI");
  }

  const { content } = choice.message;
  let text: string;
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");
  } else {
    throw new Error("Empty response from AI");
  }

  if (!text.trim()) {
    throw new Error("Empty response from AI");
  }

  if (choice.finish_reason === "length") {
    throw new Error(
      "תגובת ה-AI נקטעה באמצע כי היא ארוכה מדי. נסה להעלות פחות קבצים בבת אחת."
    );
  }

  return text;
}

function parseLLMJson<T = any>(raw: string): T {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return JSON.parse(cleaned);
}

const CHAT_SYSTEM_PROMPT = `אתה עוזר וירטואלי מומחה בפוליסות ביטוח. תפקידך לענות על שאלות של המשתמש לגבי פוליסת הביטוח שלו.

כללים חשובים:
1. ענה אך ורק על סמך המידע שחולץ מהפוליסה. אל תמציא מידע.
2. אם התשובה לא נמצאת במידע שסופק, אמור זאת בבירור.
3. ענה בעברית בשפה ברורה ומובנת.
4. אם המשתמש שואל שאלה כללית שלא קשורה לפוליסה, הפנה אותו בנימוס לשאול שאלות על הפוליסה.
5. כשאתה מצטט מידע מהפוליסה, ציין את הפרטים הרלוונטיים (השתתפות עצמית, מגבלות, החרגות).

להלן המידע שחולץ מהפוליסה:
`;


const CATEGORY_SUMMARY_SYSTEM_PROMPT = `אתה יועץ ביטוח ישראלי. קיבלת כמה סקירות של פוליסות מאותה קטגוריית ביטוח עבור אותו משתמש.

המטרה: לייצר סיכום מאוחד אחד, ברור ופרקטי, של כל מה שיש בקטגוריית הביטוח הזאת.

החזר JSON בלבד בפורמט הבא:
{
  "overview": "סיכום מאוחד ב-2 עד 4 משפטים",
  "highlights": [
    {
      "id": "מזהה קצר",
      "title": "כותרת קצרה",
      "description": "הסבר קונקרטי",
      "tone": "warning | info | success"
    }
  ],
  "recommendedActions": ["פעולה מומלצת 1"],
  "recommendedQuestions": ["שאלה מומלצת 1"]
}

כללים:
- overview חייב להתייחס לכל הסקירות ביחד, לא רק לפוליסה אחת
- highlights צריכים להיות קונקרטיים ומבוססי נתונים, 3 עד 5 פריטים
- recommendedActions צריכים להיות קצרים וישימים, 2 עד 4 פריטים
- recommendedQuestions צריכים להיות שאלות המשך חכמות, 2 עד 3 פריטים
- התייחס לחפיפות, פערים, חריגים, תאריכי חידוש, פרמיות והבדלים בין פוליסות כשזה רלוונטי
- אם חסר מידע, ציין זאת במפורש ואל תמציא
- כל הטקסט בעברית ברורה, בגובה העיניים`;

const INSURANCE_CATEGORY_TITLES: Record<InsuranceCategory, string> = {
  health: "ביטוחי בריאות",
  life: "ביטוחי חיים",
  car: "ביטוחי רכב",
  home: "ביטוחי דירה",
};

function resolveAnalysisCategoryForSummary(analysis: any): InsuranceCategory {
  return (
    analysis.insuranceCategory ??
    analysis.analysisResult?.generalInfo?.insuranceCategory ??
    inferInsuranceCategory(
      analysis.analysisResult?.generalInfo?.policyType,
      analysis.analysisResult?.coverages
    )
  );
}

function buildCategorySummaryMetrics(analyses: any[]) {
  return {
    policyCount: analyses.length,
    fileCount: analyses.reduce((sum, analysis) => sum + ((analysis.files ?? []) as unknown[]).length, 0),
    coverageCount: analyses.reduce((sum, analysis) => sum + ((analysis.analysisResult?.coverages ?? []) as unknown[]).length, 0),
    duplicateGroups: analyses.reduce((sum, analysis) => sum + ((analysis.analysisResult?.duplicateCoverages ?? []) as unknown[]).length, 0),
    knownMonthlyPremiums: analyses
      .map((analysis) => analysis.analysisResult?.generalInfo?.monthlyPremium)
      .filter((value): value is string => Boolean(value)),
    renewalDates: analyses
      .map((analysis) => ({
        policyName: analysis.analysisResult?.generalInfo?.policyName ?? "פוליסה",
        endDate: analysis.analysisResult?.generalInfo?.endDate ?? "לא מצוין בפוליסה",
      })),
  };
}

function buildCategorySummaryPayload(analyses: any[]) {
  return analyses.map((analysis) => ({
    sessionId: analysis.sessionId,
    createdAt: analysis.createdAt instanceof Date ? analysis.createdAt.toISOString() : String(analysis.createdAt),
    files: ((analysis.files ?? []) as Array<{ name?: string }>).map((file) => file?.name ?? "קובץ"),
    generalInfo: {
      policyName: analysis.analysisResult?.generalInfo?.policyName ?? "לא מצוין בפוליסה",
      insurerName: analysis.analysisResult?.generalInfo?.insurerName ?? "לא מצוין בפוליסה",
      policyNumber: analysis.analysisResult?.generalInfo?.policyNumber ?? "לא מצוין בפוליסה",
      policyType: analysis.analysisResult?.generalInfo?.policyType ?? "לא מצוין בפוליסה",
      premiumPaymentPeriod: analysis.analysisResult?.generalInfo?.premiumPaymentPeriod ?? "unknown",
      monthlyPremium: analysis.analysisResult?.generalInfo?.monthlyPremium ?? "לא מצוין בפוליסה",
      annualPremium: analysis.analysisResult?.generalInfo?.annualPremium ?? "לא מצוין בפוליסה",
      startDate: analysis.analysisResult?.generalInfo?.startDate ?? "לא מצוין בפוליסה",
      endDate: analysis.analysisResult?.generalInfo?.endDate ?? "לא מצוין בפוליסה",
      importantNotes: analysis.analysisResult?.generalInfo?.importantNotes ?? [],
      fineprint: analysis.analysisResult?.generalInfo?.fineprint ?? [],
    },
    summary: analysis.analysisResult?.summary ?? "אין סיכום זמין",
    coverages: (analysis.analysisResult?.coverages ?? []).map((coverage: any) => ({
      title: coverage.title,
      category: coverage.category,
      limit: coverage.limit,
      details: coverage.details,
      eligibility: coverage.eligibility,
      copay: coverage.copay,
      maxReimbursement: coverage.maxReimbursement,
      exclusions: coverage.exclusions,
      waitingPeriod: coverage.waitingPeriod,
      sourceFile: coverage.sourceFile ?? "לא מצוין בפוליסה",
    })),
    duplicateCoverages: (analysis.analysisResult?.duplicateCoverages ?? []).map((duplicate: any) => ({
      title: duplicate.title,
      explanation: duplicate.explanation,
      recommendation: duplicate.recommendation,
      sourceFiles: duplicate.sourceFiles ?? [],
    })),
    personalizedInsights: (analysis.analysisResult?.personalizedInsights ?? []).map((insight: any) => ({
      title: insight.title,
      description: insight.description,
      type: insight.type,
      priority: insight.priority,
      relevantCoverage: insight.relevantCoverage ?? "",
    })),
  }));
}

function buildProfileContext(profile: any): string {
  const labels: Record<string, string> = {
    single: "רווק/ה",
    married: "נשוי/אה",
    divorced: "גרוש/ה",
    widowed: "אלמן/ה",
    salaried: "שכיר/ה",
    self_employed: "עצמאי/ת",
    business_owner: "בעל/ת עסק",
    student: "סטודנט/ית",
    retired: "פנסיונר/ית",
    unemployed: "לא עובד/ת",
    male: "זכר",
    female: "נקבה",
    other: "אחר",
    below_5k: "מתחת ל-5,000 ₪",
    "5k_10k": "5,000-10,000 ₪",
    "10k_15k": "10,000-15,000 ₪",
    "15k_25k": "15,000-25,000 ₪",
    "25k_40k": "25,000-40,000 ₪",
    above_40k: "מעל 40,000 ₪",
  };

  const parts: string[] = [];

  if (profile.dateOfBirth) {
    const age = Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    parts.push(`גיל: ${age}`);
  }
  if (profile.gender) parts.push(`מין: ${labels[profile.gender] || profile.gender}`);
  if (profile.maritalStatus) parts.push(`מצב משפחתי: ${labels[profile.maritalStatus] || profile.maritalStatus}`);
  if (profile.numberOfChildren > 0) {
    parts.push(`מספר ילדים: ${profile.numberOfChildren}`);
    if (profile.childrenAges) parts.push(`גילאי ילדים: ${profile.childrenAges}`);
  }
  if (profile.employmentStatus) parts.push(`תעסוקה: ${labels[profile.employmentStatus] || profile.employmentStatus}`);
  if (profile.incomeRange) parts.push(`הכנסה חודשית: ${labels[profile.incomeRange] || profile.incomeRange}`);
  if (profile.businessName) parts.push(`שם העסק: ${profile.businessName}`);
  if (profile.businessTaxId) parts.push(`מספר מזהה עסקי: ${profile.businessTaxId}`);
  if (profile.businessEmailDomains) parts.push(`דומיינים או מיילים עסקיים: ${profile.businessEmailDomains}`);
  if (profile.ownsApartment) parts.push(`בעלות על דירה: כן`);
  if (profile.hasActiveMortgage) parts.push(`משכנתא פעילה: כן`);
  if (profile.numberOfVehicles > 0) parts.push(`מספר רכבים: ${profile.numberOfVehicles}`);
  if (profile.hasExtremeSports) parts.push(`ספורט אקסטרימי/תחביבים מסוכנים: כן`);
  if (profile.hasSpecialHealthConditions) {
    parts.push(`מצב בריאותי מיוחד: כן`);
    if (profile.healthConditionsDetails) parts.push(`פרטי מצב בריאותי: ${profile.healthConditionsDetails}`);
  }
  if (profile.hasPets) parts.push(`חיות מחמד: כן`);

  return parts.join("\n");
}

function serializeProfileForClient(profile: any) {
  if (!profile) return null;
  return {
    dateOfBirth: profile.dateOfBirth ? new Date(profile.dateOfBirth).toISOString() : null,
    gender: profile.gender,
    maritalStatus: profile.maritalStatus,
    numberOfChildren: profile.numberOfChildren ?? 0,
    childrenAges: profile.childrenAges,
    employmentStatus: profile.employmentStatus,
    incomeRange: profile.incomeRange,
    ownsApartment: profile.ownsApartment ?? false,
    hasActiveMortgage: profile.hasActiveMortgage ?? false,
    numberOfVehicles: profile.numberOfVehicles ?? 0,
    hasExtremeSports: profile.hasExtremeSports ?? false,
    hasSpecialHealthConditions: profile.hasSpecialHealthConditions ?? false,
    healthConditionsDetails: profile.healthConditionsDetails,
    hasPets: profile.hasPets ?? false,
    businessName: profile.businessName ?? null,
    businessTaxId: profile.businessTaxId ?? null,
    businessEmailDomains: profile.businessEmailDomains ?? null,
    profileImageKey: profile.profileImageKey ?? null,
    onboardingCompleted: profile.onboardingCompleted ?? false,
  };
}

function normalizeHubProfile(profile: any) {
  if (!profile) return null;
  return {
    ...profile,
    numberOfChildren: profile.numberOfChildren ?? 0,
    ownsApartment: Boolean(profile.ownsApartment),
    hasActiveMortgage: Boolean(profile.hasActiveMortgage),
    numberOfVehicles: profile.numberOfVehicles ?? 0,
    hasSpecialHealthConditions: Boolean(profile.hasSpecialHealthConditions),
    onboardingCompleted: Boolean(profile.onboardingCompleted),
  };
}

function serializeFamilyMemberForClient(member: any) {
  return {
    id: member.id,
    fullName: member.fullName,
    relation: member.relation,
    birthDate: member.birthDate ? new Date(member.birthDate).toISOString() : null,
    ageLabel: member.ageLabel ?? null,
    gender: member.gender ?? null,
    allergies: member.allergies ?? null,
    medicalNotes: member.medicalNotes ?? null,
    activities: member.activities ?? null,
    insuranceNotes: member.insuranceNotes ?? null,
    notes: member.notes ?? null,
    createdAt: member.createdAt ? new Date(member.createdAt).toISOString() : null,
    updatedAt: member.updatedAt ? new Date(member.updatedAt).toISOString() : null,
  };
}

function buildFamilyMembersContext(members: any[]) {
  if (!members.length) {
    return "לא הוזנו עדיין בני בית נפרדים במודל המשפחה.";
  }
  return members
    .map((member) => {
      const details = [
        `שם: ${member.fullName}`,
        `קשר: ${member.relation}`,
        member.ageLabel ? `גיל/שלב: ${member.ageLabel}` : null,
        member.birthDate ? `תאריך לידה: ${new Date(member.birthDate).toISOString().slice(0, 10)}` : null,
        member.allergies ? `אלרגיות: ${member.allergies}` : null,
        member.medicalNotes ? `בריאות: ${member.medicalNotes}` : null,
        member.activities ? `שגרה/חוגים: ${member.activities}` : null,
        member.insuranceNotes ? `דגשי ביטוח: ${member.insuranceNotes}` : null,
        member.notes ? `הערות: ${member.notes}` : null,
      ].filter(Boolean);
      return `- ${details.join(" | ")}`;
    })
    .join("\n");
}

type AssistantTone = "neutral" | "info" | "success" | "warning";

type AssistantChip = {
  label: string;
  tone: AssistantTone;
};

type AssistantHighlight = {
  title: string;
  description: string;
  tone: AssistantTone;
};

function getAssistantSessionId(userId: number) {
  return `assistant-home-${userId}`;
}

function formatIls(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}

function formatMonthLabel(monthKey?: string) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  const monthLabels: Record<string, string> = {
    "01": "ינואר",
    "02": "פברואר",
    "03": "מרץ",
    "04": "אפריל",
    "05": "מאי",
    "06": "יוני",
    "07": "יולי",
    "08": "אוגוסט",
    "09": "ספטמבר",
    "10": "אוקטובר",
    "11": "נובמבר",
    "12": "דצמבר",
  };
  return `${monthLabels[month] ?? month} ${year}`;
}

function parsePolicyDate(dateStr?: string | null) {
  if (!dateStr || dateStr === "לא צוין בפוליסה" || dateStr === "לא צוין") return null;
  const parts = dateStr.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    let year = parseInt(parts[3], 10);
    if (year < 100) year += 2000;
    const parsed = new Date(year, month, day);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

async function getAssistantInvoices(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(smartInvoices)
    .where(eq(smartInvoices.userId, userId))
    .orderBy(desc(smartInvoices.createdAt))
    .limit(100);

  return rows.map((inv) => {
    try {
      const extractedData = inv.extractedData && typeof inv.extractedData === "string"
        ? decryptJson(inv.extractedData)
        : inv.extractedData;
      return {
        ...inv,
        subject: inv.subject ? decryptField(inv.subject) : inv.subject,
        rawText: inv.rawText ? decryptField(inv.rawText) : inv.rawText,
        extractedData,
      };
    } catch {
      return {
        ...inv,
        extractedData: null,
      };
    }
  });
}

function toNumericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function serializeSavingsOpportunityRow(row: any) {
  return {
    ...row,
    monthlySaving: toNumericValue(row.monthlySaving),
    annualSaving: toNumericValue(row.annualSaving),
    actionSteps: Array.isArray(row.actionSteps) ? row.actionSteps : [],
    relatedSessionIds: Array.isArray(row.relatedSessionIds) ? row.relatedSessionIds : [],
  };
}

function serializeActionItemRow(row: any) {
  return {
    ...row,
    potentialSaving: toNumericValue(row.potentialSaving),
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
  };
}

function serializeMonthlyReportRow(row: any) {
  return {
    ...row,
    changes: Array.isArray(row.changes) ? row.changes : [],
    newActions: Array.isArray(row.newActions) ? row.newActions : [],
  };
}

async function syncSavingsOpportunities(
  userId: number,
  report: ReturnType<typeof buildSavingsReportDraft>,
  dataHash: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existingRows = await db
    .select()
    .from(savingsOpportunities)
    .where(eq(savingsOpportunities.userId, userId));
  const existingByKey = new Map(existingRows.map((row) => [row.opportunityKey, row]));
  const activeKeys = new Set(report.opportunities.map((opportunity) => opportunity.opportunityKey));

  for (const row of existingRows) {
    if (!activeKeys.has(row.opportunityKey)) {
      await db.delete(savingsOpportunities).where(eq(savingsOpportunities.id, row.id));
    }
  }

  for (const opportunity of report.opportunities) {
    const existing = existingByKey.get(opportunity.opportunityKey);
    const status = existing?.status ?? opportunity.status;
    const completedAt = status === "completed" ? (existing?.completedAt ?? new Date()) : null;
    const payload = {
      userId,
      opportunityKey: opportunity.opportunityKey,
      type: opportunity.type,
      title: opportunity.title,
      description: opportunity.description,
      monthlySaving: opportunity.monthlySaving.toFixed(2),
      annualSaving: opportunity.annualSaving.toFixed(2),
      priority: opportunity.priority,
      actionSteps: opportunity.actionSteps,
      relatedSessionIds: opportunity.relatedSessionIds,
      status,
      dataHash,
      completedAt,
      updatedAt: new Date(),
    } as const;

    if (existing) {
      await db
        .update(savingsOpportunities)
        .set(payload)
        .where(eq(savingsOpportunities.id, existing.id));
    } else {
      await db.insert(savingsOpportunities).values(payload);
    }
  }

  const rows = await db
    .select()
    .from(savingsOpportunities)
    .where(eq(savingsOpportunities.userId, userId))
    .orderBy(desc(savingsOpportunities.createdAt));

  return rows.map(serializeSavingsOpportunityRow);
}

async function syncMonthlyReportRow(
  userId: number,
  report: ReturnType<typeof buildMonthlyReportDraft>,
  dataHash: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select()
    .from(monthlyReports)
    .where(and(eq(monthlyReports.userId, userId), eq(monthlyReports.month, report.month)))
    .limit(1);

  const payload = {
    userId,
    month: report.month,
    scoreAtTime: report.scoreAtTime,
    scoreChange: report.scoreChange,
    changes: report.changes,
    newActions: report.newActions,
    summary: report.summary,
    dataHash,
    updatedAt: new Date(),
  } as const;

  if (existing) {
    await db.update(monthlyReports).set(payload).where(eq(monthlyReports.id, existing.id));
  } else {
    await db.insert(monthlyReports).values(payload);
  }

  const [row] = await db
    .select()
    .from(monthlyReports)
    .where(and(eq(monthlyReports.userId, userId), eq(monthlyReports.month, report.month)))
    .limit(1);

  return row ? serializeMonthlyReportRow(row) : null;
}

async function syncActionItems(
  userId: number,
  drafts: ReturnType<typeof buildActionItemsDraft>,
  opportunityRows: Array<ReturnType<typeof serializeSavingsOpportunityRow>>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const opportunityIdsByKey = new Map(opportunityRows.map((row) => [row.opportunityKey, row.id]));
  const existingRows = await db
    .select()
    .from(actionItems)
    .where(eq(actionItems.userId, userId));
  const existingByKey = new Map(existingRows.map((row) => [row.actionKey, row]));
  const activeKeys = new Set(drafts.map((draft) => draft.actionKey));

  for (const row of existingRows) {
    if (!activeKeys.has(row.actionKey)) {
      await db.delete(actionItems).where(eq(actionItems.id, row.id));
    }
  }

  for (const draft of drafts) {
    const existing = existingByKey.get(draft.actionKey);
    const status = existing?.status ?? draft.status;
    const completedAt = status === "completed" ? (existing?.completedAt ?? new Date()) : null;
    const payload = {
      userId,
      actionKey: draft.actionKey,
      savingsOpportunityId: draft.relatedOpportunityKey ? opportunityIdsByKey.get(draft.relatedOpportunityKey) ?? null : null,
      type: draft.type,
      title: draft.title,
      description: draft.description,
      instructions: draft.instructions,
      potentialSaving: draft.potentialSaving.toFixed(2),
      priority: draft.priority,
      status,
      dueDate: draft.dueDate,
      completedAt,
      updatedAt: new Date(),
    } as const;

    if (existing) {
      await db
        .update(actionItems)
        .set(payload)
        .where(eq(actionItems.id, existing.id));
    } else {
      await db.insert(actionItems).values(payload);
    }
  }

  const rows = await db
    .select()
    .from(actionItems)
    .where(eq(actionItems.userId, userId))
    .orderBy(desc(actionItems.createdAt));

  return rows.map(serializeActionItemRow);
}

async function buildAndSyncUserHubState(userId: number) {
  const [profile, analyses, familyMembers, invoices, insuranceDiscoveries, existingReports, existingActions] = await Promise.all([
    getUserProfile(userId),
    getUserAnalyses(userId),
    getFamilyMembers(userId),
    getAssistantInvoices(userId),
    listInsuranceDiscoveries(userId, 50),
    (async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(monthlyReports)
        .where(eq(monthlyReports.userId, userId))
        .orderBy(desc(monthlyReports.month));
    })(),
    (async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(actionItems)
        .where(eq(actionItems.userId, userId));
    })(),
  ]);
  const normalizedProfile = normalizeHubProfile(profile);

  const existingOpportunityRows = await (async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(savingsOpportunities)
      .where(eq(savingsOpportunities.userId, userId));
  })();

  const opportunityStatusMap = Object.fromEntries(
    existingOpportunityRows.map((row) => [row.opportunityKey, row.status])
  );
  const actionStatusMap = Object.fromEntries(
    existingActions.map((row) => [row.actionKey, row.status])
  );

  const savingsDraft = buildSavingsReportDraft({
    analyses,
    profile: normalizedProfile,
    familyMembers,
    insuranceDiscoveries,
    invoices,
    previousStatuses: opportunityStatusMap as Record<string, "open" | "completed" | "dismissed">,
  });
  const scoreSnapshot = buildInsuranceScoreSnapshot({
    analyses,
    profile: normalizedProfile,
    familyMembers,
    insuranceDiscoveries,
    invoices,
    potentialSavings: savingsDraft.totalMonthlySaving,
  });

  const latestReport = existingReports[0];
  const monthlyDraft = buildMonthlyReportDraft({
    invoices,
    currentScore: scoreSnapshot.score,
    previousScore: latestReport?.scoreAtTime ?? null,
    previousStatuses: actionStatusMap as Record<string, "pending" | "completed" | "dismissed">,
  });
  const fullActionDrafts = buildActionItemsDraft({
    opportunities: savingsDraft.opportunities,
    analyses,
    profile: normalizedProfile,
    familyMembers,
    monitoringChanges: monthlyDraft.changes,
    previousStatuses: actionStatusMap as Record<string, "pending" | "completed" | "dismissed">,
  });

  const dataHash = buildWorkspaceDataHash({
    profile,
    analyses: analyses.map((analysis) => ({
      sessionId: analysis.sessionId,
      updatedAt: analysis.updatedAt instanceof Date ? analysis.updatedAt.toISOString() : analysis.updatedAt,
      status: analysis.status,
      category: analysis.insuranceCategory,
    })),
    familyMembers: familyMembers.map((member) => ({
      id: member.id,
      updatedAt: member.updatedAt instanceof Date ? member.updatedAt.toISOString() : member.updatedAt,
    })),
    insuranceDiscoveries: insuranceDiscoveries.map((discovery) => ({
      id: discovery.id,
      documentDate: discovery.documentDate instanceof Date ? discovery.documentDate.toISOString() : discovery.documentDate,
      artifactType: discovery.artifactType,
      premiumAmount: discovery.premiumAmount,
    })),
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      amount: invoice.amount,
      invoiceDate: invoice.invoiceDate instanceof Date ? invoice.invoiceDate.toISOString() : invoice.invoiceDate,
      provider: invoice.provider,
      status: invoice.status,
    })),
    savings: savingsDraft.opportunities.map((opportunity) => ({
      key: opportunity.opportunityKey,
      type: opportunity.type,
      monthlySaving: opportunity.monthlySaving,
    })),
    monthly: {
      month: monthlyDraft.month,
      changes: monthlyDraft.changes,
    },
  });

  const opportunityRows = await syncSavingsOpportunities(userId, savingsDraft, dataHash);
  const monthlyReportRow = await syncMonthlyReportRow(userId, monthlyDraft, dataHash);
  const actionRows = await syncActionItems(userId, fullActionDrafts, opportunityRows);

  return {
    profile,
    normalizedProfile,
    analyses,
    familyMembers,
    invoices,
    insuranceDiscoveries,
    savingsDraft,
    scoreSnapshot,
    monthlyDraft,
    opportunities: opportunityRows,
    actions: actionRows,
    monthlyReport: monthlyReportRow,
    dataHash,
  };
}

function buildAssistantHomeContext(params: {
  userName?: string | null;
  profile: any;
  analyses: any[];
  invoices: any[];
  familyMembers: any[];
  gmailConnections: Array<{ id: number }>;
}) {
  const completedAnalyses = params.analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  const monthlySummary = summarizeMonthlyInvoices(params.invoices);
  const currentMonth = monthlySummary[0] ?? null;
  const pendingInvoices = params.invoices.filter((invoice) => invoice.status === "pending" || invoice.status === "overdue");
  const docCount =
    completedAnalyses.reduce((sum, analysis) => sum + ((analysis.files ?? []) as unknown[]).length, 0) +
    params.invoices.filter((invoice) => {
      const extracted = invoice.extractedData as Record<string, unknown> | null;
      return Boolean(extracted?.pdfUrl);
    }).length;
  const upcomingRenewals = completedAnalyses
    .map((analysis) => {
      const endDate = parsePolicyDate(analysis.analysisResult?.generalInfo?.endDate);
      if (!endDate) return null;
      const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        title: analysis.analysisResult?.generalInfo?.policyName || "פוליסה",
        daysLeft,
      };
    })
    .filter((item): item is { title: string; daysLeft: number } => Boolean(item))
    .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 45)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const chips: AssistantChip[] = [];
  const highlights: AssistantHighlight[] = [];
  const prompts: string[] = [];
  const familyMembersCount = params.familyMembers.length;
  const childrenCount =
    params.familyMembers.filter((member) => member.relation === "child").length ||
    (params.profile?.numberOfChildren ?? 0);

  if (!params.gmailConnections.length) {
    chips.push({ label: "Gmail עדיין לא מחובר", tone: "warning" });
    prompts.push("איך מחברים את Gmail כדי שלומי יזהה הוצאות והכנסות?");
    highlights.push({
      title: "חיבור Gmail יפתח את לומי",
      description: "ברגע שתחבר את Gmail, לומי יוכל לזהות תשלומים, הכנסות ומסמכים כספיים אוטומטית.",
      tone: "warning",
    });
  }

  if (pendingInvoices.length > 0) {
    chips.push({
      label: `${pendingInvoices.length} תשלומים פתוחים`,
      tone: pendingInvoices.some((invoice) => invoice.status === "overdue") ? "warning" : "info",
    });
    prompts.push("איזה תשלומים פתוחים מחכים לי עכשיו?");
  }

  if (upcomingRenewals.length > 0) {
    chips.push({
      label: `חידוש פוליסה בעוד ${upcomingRenewals[0].daysLeft} ימים`,
      tone: "info",
    });
    prompts.push("יש לי חידושי ביטוח קרובים או פערים בכיסוי?");
    highlights.push({
      title: "יש פוליסה שדורשת תשומת לב",
      description: `${upcomingRenewals[0].title} מתקרבת לחידוש בעוד ${upcomingRenewals[0].daysLeft} ימים.`,
      tone: "info",
    });
  }

  if (familyMembersCount > 0) {
    chips.push({
      label: `${familyMembersCount + 1} בני בית מנוהלים`,
      tone: "success",
    });
    highlights.push({
      title: "מודל המשפחה כבר פעיל",
      description: `יש כרגע ${familyMembersCount + 1} בני בית שמזינים הקשר לשאלות על משפחה, ביטוחים ומסמכים.`,
      tone: "success",
    });
  }

  if (childrenCount > 0) {
    chips.push({
      label: `${childrenCount} ילדים במשפחה`,
      tone: "success",
    });
    prompts.push("יש משהו חשוב שמתקרב לילדים או למשפחה שלי?");
  }

  if (docCount > 0) {
    chips.push({
      label: `${docCount} מסמכים זמינים`,
      tone: "neutral",
    });
    prompts.push("עשה לי סדר במסמכים החשובים שלי.");
  }

  if (currentMonth) {
    const monthLabel = formatMonthLabel(currentMonth.month);
    chips.push({
      label: `נטו ${monthLabel}: ${currentMonth.netTotal >= 0 ? "+" : "-"}${formatIls(Math.abs(currentMonth.netTotal))}`,
      tone: currentMonth.netTotal >= 0 ? "success" : "warning",
    });
    prompts.push("איך נראות ההוצאות וההכנסות שלי החודש?");
    highlights.push({
      title: `תמונת מצב ל-${monthLabel}`,
      description: `הוצאות ${formatIls(currentMonth.expenseTotal)} מול הכנסות ${formatIls(currentMonth.incomeTotal)}. הנטו כרגע הוא ${currentMonth.netTotal >= 0 ? "חיובי" : "שלילי"}.`,
      tone: currentMonth.netTotal >= 0 ? "success" : "warning",
    });
  }

  if (!params.profile?.incomeRange || !params.profile?.employmentStatus) {
    prompts.push("איזה מידע חסר ללומי כדי לעזור לי טוב יותר?");
  }

  if (!completedAnalyses.length) {
    prompts.push("איך מתחילים להעלות ולנתח ביטוחים בלומי?");
  }

  if (!highlights.length) {
    highlights.push({
      title: "לומי מוכן להתחיל",
      description: "אפשר לשאול על כסף, משפחה, מסמכים וביטוחים, ולקבל תשובות שמבוססות על הנתונים שלך.",
      tone: "info",
    });
  }

  const greetingName = params.userName?.split(" ")[0] || "";

  return {
    greeting: `${greetingName ? `שלום ${greetingName}, ` : ""}אני כאן כדי לעזור לך להבין מה קורה בבית, בכסף, במסמכים ובביטוחים. אפשר לשאול אותי כל דבר או לבחור אחת מהשאלות המומלצות.`,
    chips: chips.slice(0, 5),
    highlights: highlights.slice(0, 3),
    suggestedPrompts: Array.from(new Set(prompts)).slice(0, 5),
  };
}

function buildAssistantSystemPrompt(params: {
  profile: any;
  analyses: any[];
  invoices: any[];
  familyMembers: any[];
  gmailConnections: Array<{ id: number }>;
}) {
  const completedAnalyses = params.analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  const monthlySummary = summarizeMonthlyInvoices(params.invoices);
  const currentMonth = monthlySummary[0] ?? null;
  const docCount =
    completedAnalyses.reduce((sum, analysis) => sum + ((analysis.files ?? []) as unknown[]).length, 0) +
    params.invoices.filter((invoice) => {
      const extracted = invoice.extractedData as Record<string, unknown> | null;
      return Boolean(extracted?.pdfUrl);
    }).length;
  const recentPolicies = completedAnalyses.slice(0, 6).map((analysis) => {
    const info = analysis.analysisResult?.generalInfo;
    return `- ${info?.policyName || "פוליסה"} | ${info?.insurerName || "לא ידוע"} | קטגוריה: ${info?.insuranceCategory || "לא ידוע"} | פרמיה חודשית: ${info?.monthlyPremium || "לא ידוע"} | תוקף עד: ${info?.endDate || "לא ידוע"}`;
  });
  const recentInvoices = params.invoices.slice(0, 8).map((invoice) => {
    const flowDirection = invoice.flowDirection === "income" ? "הכנסה" : invoice.flowDirection === "expense" ? "הוצאה" : "לא מסווג";
    return `- ${invoice.provider || "ללא ספק"} | ${flowDirection} | סכום: ${invoice.amount || "לא ידוע"} | סטטוס: ${invoice.status || "לא ידוע"}`;
  });

  return `אתה לומי, עוזר אישי חכם לניהול החיים השוטפים של משק בית בישראל.

ענה בעברית, בגובה העיניים, בצורה פרקטית וברורה.
השתמש אך ורק במידע שסופק לך. אם מידע חסר, אמור זאת במפורש והצע מה כדאי להשלים.
אם אפשר, סיים כל תשובה בהמלצה קצרה לפעולה הבאה.
אל תמציא נתונים שלא קיימים.
אל תתן ייעוץ משפטי, ביטוחי או פיננסי מחייב. תסביר, תסכם ותמליץ בזהירות.

פרופיל הלקוח:
${params.profile ? buildProfileContext(params.profile) || "לא הוזן פרופיל מפורט" : "לא הוזן פרופיל מפורט"}

בני הבית:
${buildFamilyMembersContext(params.familyMembers)}

חיבורים:
- Gmail מחובר: ${params.gmailConnections.length > 0 ? "כן" : "לא"}

כסף:
- מספר תנועות: ${params.invoices.length}
- מסמכים כספיים כוללים: ${docCount}
${currentMonth ? `- הוצאות ${formatMonthLabel(currentMonth.month)}: ${formatIls(currentMonth.expenseTotal)}
- הכנסות ${formatMonthLabel(currentMonth.month)}: ${formatIls(currentMonth.incomeTotal)}
- נטו ${formatMonthLabel(currentMonth.month)}: ${currentMonth.netTotal >= 0 ? "+" : "-"}${formatIls(Math.abs(currentMonth.netTotal))}` : "- אין עדיין סיכום חודשי"}

פוליסות:
- מספר פוליסות שנותחו: ${completedAnalyses.length}
${recentPolicies.length > 0 ? recentPolicies.join("\n") : "- אין עדיין פוליסות מנותחות"}

תנועות אחרונות:
${recentInvoices.length > 0 ? recentInvoices.join("\n") : "- אין עדיין תנועות כספיות"}
`;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const profile = await getUserProfile(ctx.user.id);
      return serializeProfileForClient(profile);
    }),

    uploadImage: protectedProcedure
      .input(z.object({
        name: z.string(),
        base64: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const allowedExtensions = [".jpg", ".jpeg", ".png", ".webp"];
        const ext = input.name.substring(input.name.lastIndexOf(".")).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only jpg, png, webp images are allowed" });
        }
        const safeName = sanitizeFilename(input.name);
        const fileKey = `avatars/${ctx.user.id}/${nanoid(8)}-${safeName}`;
        const buffer = Buffer.from(input.base64, "base64");
        const maxSize = 5 * 1024 * 1024;
        if (buffer.length > maxSize) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be under 5MB" });
        }
        await storagePut(fileKey, buffer, `image/${ext.replace(".", "")}`);
        await upsertUserProfile(ctx.user.id, { profileImageKey: fileKey } as any);
        return { fileKey };
      }),

    getImageUrl: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const profile = await getUserProfile(ctx.user.id);
      if (!profile?.profileImageKey) return null;
      return generateSignedFileUrl(profile.profileImageKey);
    }),

    update: protectedProcedure
      .input(z.object({
        dateOfBirth: z.string().nullable().optional(),
        gender: z.enum(["male", "female", "other"]).nullable().optional(),
        maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).nullable().optional(),
        numberOfChildren: z.number().min(0).max(20).optional(),
        childrenAges: z.string().nullable().optional(),
        employmentStatus: z.enum(["salaried", "self_employed", "business_owner", "student", "retired", "unemployed"]).nullable().optional(),
        incomeRange: z.enum(["below_5k", "5k_10k", "10k_15k", "15k_25k", "25k_40k", "above_40k"]).nullable().optional(),
        ownsApartment: z.boolean().optional(),
        hasActiveMortgage: z.boolean().optional(),
        numberOfVehicles: z.number().min(0).max(10).optional(),
        hasExtremeSports: z.boolean().optional(),
        hasSpecialHealthConditions: z.boolean().optional(),
        healthConditionsDetails: z.string().nullable().optional(),
        hasPets: z.boolean().optional(),
        businessName: z.string().max(160).nullable().optional(),
        businessTaxId: z.string().max(64).nullable().optional(),
        businessEmailDomains: z.string().max(1000).nullable().optional(),
        onboardingCompleted: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const data: any = { ...input };
        if (input.dateOfBirth !== undefined) {
          data.dateOfBirth = input.dateOfBirth ? new Date(input.dateOfBirth) : null;
        }
        for (const field of ["businessName", "businessTaxId", "businessEmailDomains"] as const) {
          if (typeof data[field] === "string") {
            const normalized = data[field].trim();
            data[field] = normalized ? normalized : null;
          }
        }
        const profile = await upsertUserProfile(ctx.user.id, data);
        return { success: true, profile: serializeProfileForClient(profile) };
      }),
  }),

  family: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const members = await getFamilyMembers(ctx.user.id);
      return members.map(serializeFamilyMemberForClient);
    }),

    upsert: protectedProcedure
      .input(z.object({
        id: z.number().int().positive().optional(),
        fullName: z.string().min(1).max(120),
        relation: z.enum(["spouse", "child", "parent", "dependent", "other"]),
        birthDate: z.string().nullable().optional(),
        ageLabel: z.string().max(64).nullable().optional(),
        gender: z.enum(["male", "female", "other"]).nullable().optional(),
        allergies: z.string().max(400).nullable().optional(),
        medicalNotes: z.string().max(800).nullable().optional(),
        activities: z.string().max(400).nullable().optional(),
        insuranceNotes: z.string().max(400).nullable().optional(),
        notes: z.string().max(800).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const member = await upsertFamilyMember(ctx.user.id, {
          id: input.id,
          fullName: input.fullName,
          relation: input.relation,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          ageLabel: input.ageLabel ?? null,
          gender: input.gender ?? null,
          allergies: input.allergies ?? null,
          medicalNotes: input.medicalNotes ?? null,
          activities: input.activities ?? null,
          insuranceNotes: input.insuranceNotes ?? null,
          notes: input.notes ?? null,
        });
        await audit({
          userId: ctx.user.id,
          action: "manage_family_member",
          resource: "family",
          resourceId: member ? String(member.id) : null,
          details: JSON.stringify({ relation: input.relation, mode: input.id ? "update" : "create" }),
        });
        return {
          success: true,
          member: member ? serializeFamilyMemberForClient(member) : null,
        };
      }),

    delete: protectedProcedure
      .input(z.object({ memberId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await deleteFamilyMember(ctx.user.id, input.memberId);
        await audit({
          userId: ctx.user.id,
          action: "delete_family_member",
          resource: "family",
          resourceId: String(input.memberId),
        });
        return { success: true };
      }),

    bootstrapFromProfile: protectedProcedure.mutation(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const existingMembers = await getFamilyMembers(ctx.user.id);
      if (existingMembers.length > 0) {
        return {
          success: true,
          createdCount: 0,
          members: existingMembers.map(serializeFamilyMemberForClient),
        };
      }
      const members = await bootstrapFamilyMembersFromProfile(ctx.user.id);
      await audit({
        userId: ctx.user.id,
        action: "manage_family_member",
        resource: "family",
        details: JSON.stringify({ mode: "bootstrap", createdCount: members.length }),
      });
      return {
        success: true,
        createdCount: members.length,
        members: members.map(serializeFamilyMemberForClient),
      };
    }),
  }),

  documents: router({
    getClassifications: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      return getDocumentClassifications(ctx.user.id);
    }),

    upsertClassification: protectedProcedure
      .input(z.object({
        documentKey: z.string().min(1).max(191),
        sourceType: z.enum(["analysis_file", "invoice_pdf"]),
        sourceId: z.string().max(128).nullable().optional(),
        manualType: z.enum(["insurance", "money", "health", "education", "family", "other"]),
        familyMemberId: z.number().int().positive().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const classification = await upsertDocumentClassification(ctx.user.id, input);
        await audit({
          userId: ctx.user.id,
          action: "update_document_classification",
          resource: "document",
          resourceId: input.documentKey,
          details: JSON.stringify({ sourceType: input.sourceType, manualType: input.manualType, familyMemberId: input.familyMemberId ?? null }),
        });
        return { success: true, classification };
      }),

    migrateLegacyClassifications: protectedProcedure
      .input(z.object({
        items: z.array(
          z.object({
            documentKey: z.string().min(1).max(191),
            sourceType: z.enum(["analysis_file", "invoice_pdf"]),
            sourceId: z.string().max(128).nullable().optional(),
            manualType: z.enum(["insurance", "money", "health", "education", "family", "other"]),
            familyMemberId: z.number().int().positive().nullable().optional(),
          })
        ).min(1).max(200),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const saved = await bulkUpsertDocumentClassifications(ctx.user.id, input.items);
        await audit({
          userId: ctx.user.id,
          action: "update_document_classification",
          resource: "document",
          details: JSON.stringify({ mode: "legacy_migration", count: saved.length }),
        });
        return { success: true, count: saved.length };
      }),
  }),

  assistant: router({
    getHomeContext: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [profile, analyses, invoices, insuranceDiscoveries, gmailConnections, familyMembers, documentClassifications] = await Promise.all([
        getUserProfile(ctx.user.id),
        getUserAnalyses(ctx.user.id),
        getAssistantInvoices(ctx.user.id),
        listInsuranceDiscoveries(ctx.user.id, 20),
        getAllGmailConnections(ctx.user.id),
        getFamilyMembers(ctx.user.id),
        getDocumentClassifications(ctx.user.id),
      ]);

      return buildLumiHomeContext({
        userName: ctx.user.name,
        profile,
        analyses,
        invoices,
        insuranceDiscoveries,
        familyMembers,
        gmailConnections,
        documentClassifications,
      });
    }),

    getChatHistory: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const sessionId = getLumiSessionId(ctx.user.id);
      const history = await getChatHistory(sessionId);
      return history.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));
    }),

    chat: protectedProcedure
      .input(z.object({
        message: z.string().min(1).max(4000),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const sessionId = getLumiSessionId(ctx.user.id);

        await addChatMessage({
          sessionId,
          role: "user",
          content: input.message,
        });

        const [history, profile, analyses, invoices, insuranceDiscoveries, gmailConnections, familyMembers, documentClassifications] = await Promise.all([
          getChatHistory(sessionId),
          getUserProfile(ctx.user.id),
          getUserAnalyses(ctx.user.id),
          getAssistantInvoices(ctx.user.id),
          listInsuranceDiscoveries(ctx.user.id, 30),
          getAllGmailConnections(ctx.user.id),
          getFamilyMembers(ctx.user.id),
          getDocumentClassifications(ctx.user.id),
        ]);

        const assistantPrompt = buildLumiSystemPrompt({
          message: input.message,
          profile,
          analyses,
          invoices,
          insuranceDiscoveries,
          familyMembers,
          gmailConnections,
          documentClassifications,
        });
        const useComplexModel = shouldUseComplexLumiModel({
          message: input.message,
          meta: {
            domainCount: assistantPrompt.meta.domainCount,
            termCount: assistantPrompt.meta.termCount,
            relevantPolicyCount: assistantPrompt.meta.relevantPolicyCount,
            relevantInvoiceCount: assistantPrompt.meta.relevantInvoiceCount,
            relevantDocumentCount: assistantPrompt.meta.relevantDocumentCount,
            matchedCoverageCount: assistantPrompt.meta.matchedCoverageCount,
            matchedCategories: assistantPrompt.meta.matchedCategories,
          },
        });
        const selectedModel = useComplexModel ? ENV.lumiComplexModel : ENV.llmModel;

        const messages = [
          { role: "system" as const, content: assistantPrompt.systemPrompt },
          ...history.slice(-assistantPrompt.meta.suggestedHistoryLimit).map((msg) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
        ];

        const response = await invokeLLM({ messages, model: selectedModel });
        const assistantContent = extractLLMContent(response);

        await addChatMessage({
          sessionId,
          role: "assistant",
          content: assistantContent,
        });

        const usage = response.usage;
        if (usage) {
          await logApiUsage({
            userId: ctx.user.id,
            sessionId,
            action: "chat",
            model: response.model || selectedModel,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          });
        }

        await audit({
          userId: ctx.user.id,
          action: "send_chat",
          resource: "chat",
          resourceId: sessionId,
        });

        return { response: assistantContent };
      }),
  }),

  insuranceScore: router({
    getDashboard: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const state = await buildAndSyncUserHubState(ctx.user.id);
      const db = await getDb();
      if (db) {
        await db.insert(insuranceScoreHistory).values({
          userId: ctx.user.id,
          score: state.scoreSnapshot.score,
          breakdown: state.scoreSnapshot.breakdown,
          totalMonthlySpend: state.scoreSnapshot.totalMonthlySpend.toFixed(2),
          potentialSavings: state.scoreSnapshot.potentialSavings.toFixed(2),
        });
      }
      return {
        score: state.scoreSnapshot.score,
        breakdown: state.scoreSnapshot.breakdown,
        totalMonthlySpend: state.scoreSnapshot.totalMonthlySpend,
        potentialSavings: state.scoreSnapshot.potentialSavings,
        topActions: state.actions.filter((action) => action.status === "pending").slice(0, 4),
        upcomingRenewals: state.scoreSnapshot.overview.renewals.slice(0, 4),
        recentChanges: state.monthlyReport?.changes ?? [],
      };
    }),
  }),

  insuranceMap: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const [profile, analyses, familyMembers] = await Promise.all([
        getUserProfile(ctx.user.id),
        getUserAnalyses(ctx.user.id),
        getFamilyMembers(ctx.user.id),
      ]);
      return buildFamilyCoverageSnapshot(analyses, normalizeHubProfile(profile), familyMembers);
    }),
  }),

  savings: router({
    getReport: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const state = await buildAndSyncUserHubState(ctx.user.id);
      const savedSoFar = state.opportunities
        .filter((opportunity) => opportunity.status === "completed")
        .reduce((sum, opportunity) => sum + opportunity.annualSaving, 0);
      return {
        overview: state.savingsDraft.overview,
        totalMonthlySaving: state.savingsDraft.totalMonthlySaving,
        totalAnnualSaving: state.savingsDraft.totalAnnualSaving,
        savedSoFar,
        score: state.scoreSnapshot.score,
        totalMonthlySpend: state.scoreSnapshot.totalMonthlySpend,
        policyCount: state.scoreSnapshot.overview.completedPolicies.length,
        categoriesWithData: Object.values(state.scoreSnapshot.overview.categorySummaries)
          .filter((category) => category.hasData)
          .map((category) => category.category),
        opportunities: state.opportunities,
        actionItems: state.actions,
      };
    }),

    completeOpportunity: protectedProcedure
      .input(z.object({ opportunityId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(savingsOpportunities)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(savingsOpportunities.id, input.opportunityId), eq(savingsOpportunities.userId, ctx.user.id)));
        await audit({
          userId: ctx.user.id,
          action: "complete_savings_opportunity",
          resource: "savings",
          resourceId: String(input.opportunityId),
        });
        return { success: true };
      }),

    dismissOpportunity: protectedProcedure
      .input(z.object({ opportunityId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(savingsOpportunities)
          .set({ status: "dismissed", completedAt: null, updatedAt: new Date() })
          .where(and(eq(savingsOpportunities.id, input.opportunityId), eq(savingsOpportunities.userId, ctx.user.id)));
        await audit({
          userId: ctx.user.id,
          action: "dismiss_savings_opportunity",
          resource: "savings",
          resourceId: String(input.opportunityId),
        });
        return { success: true };
      }),
  }),

  actions: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const state = await buildAndSyncUserHubState(ctx.user.id);
      return state.actions;
    }),

    complete: protectedProcedure
      .input(z.object({ actionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(actionItems)
          .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(actionItems.id, input.actionId), eq(actionItems.userId, ctx.user.id)));
        await audit({
          userId: ctx.user.id,
          action: "complete_action_item",
          resource: "action",
          resourceId: String(input.actionId),
        });
        return { success: true };
      }),

    dismiss: protectedProcedure
      .input(z.object({ actionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db
          .update(actionItems)
          .set({ status: "dismissed", completedAt: null, updatedAt: new Date() })
          .where(and(eq(actionItems.id, input.actionId), eq(actionItems.userId, ctx.user.id)));
        await audit({
          userId: ctx.user.id,
          action: "dismiss_action_item",
          resource: "action",
          resourceId: String(input.actionId),
        });
        return { success: true };
      }),
  }),

  monitoring: router({
    getMonthlyReport: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const state = await buildAndSyncUserHubState(ctx.user.id);
      return state.monthlyReport;
    }),

    checkForChanges: protectedProcedure
      .input(z.object({
        daysBack: z.number().min(1).max(90).default(30),
        scanFirst: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        if (input.scanFirst) {
          await scanGmailForInvoices(ctx.user.id, input.daysBack);
        }
        const state = await buildAndSyncUserHubState(ctx.user.id);
        await audit({
          userId: ctx.user.id,
          action: "monitor_insurance_changes",
          resource: "monitoring",
          details: JSON.stringify({ daysBack: input.daysBack, scanFirst: input.scanFirst }),
        });
        return state.monthlyReport;
      }),
  }),

  policy: router({
    /** Upload PDF files and create an analysis session */
    upload: protectedProcedure
      .input(z.object({
        files: z.array(z.object({
          name: z.string(),
          size: z.number(),
          base64: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const sessionId = nanoid(16);
        const uploadedFiles: Array<{ name: string; size: number; fileKey: string }> = [];

        for (const file of input.files) {
          const buffer = Buffer.from(file.base64, "base64");
          const fileKey = `policies/${sessionId}/${nanoid(24)}.pdf`;
          await storagePut(fileKey, buffer, "application/pdf");
          uploadedFiles.push({ name: file.name, size: file.size, fileKey });
        }

        await createAnalysis({
          sessionId,
          userId: ctx.user.id,
          files: uploadedFiles,
          status: "pending",
        });

        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "upload_file",
          resource: "file",
          resourceId: sessionId,
          details: JSON.stringify({ fileCount: uploadedFiles.length, fileNames: uploadedFiles.map(f => f.name) }),
        });

        policyAnalysisWorker.nudge();

        return { sessionId, files: uploadedFiles };
      }),

    createManualEntry: protectedProcedure
      .input(z.object({
        company: z.string().min(1).max(160),
        category: z.enum(["health", "life", "car", "home"]),
        monthlyPremium: z.number().min(0).max(100000).nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        coveredMembers: z.array(z.string().min(1).max(120)).max(20).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const sessionId = nanoid(16);
        await createAnalysis({
          sessionId,
          userId: ctx.user.id,
          files: [],
          status: "completed",
          insuranceCategory: input.category,
        });
        const analysisResult = buildManualPolicyAnalysis({
          company: input.company.trim(),
          category: input.category,
          monthlyPremium: input.monthlyPremium ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          coveredMembers: input.coveredMembers ?? [],
        });
        await updateAnalysisStatus(sessionId, "completed", {
          analysisResult,
          insuranceCategory: input.category,
          completedAt: new Date(),
        });
        await audit({
          userId: ctx.user.id,
          action: "create_manual_policy",
          resource: "analysis",
          resourceId: sessionId,
          details: JSON.stringify({
            company: input.company,
            category: input.category,
            coveredMembers: input.coveredMembers ?? [],
          }),
        });
        return { sessionId };
      }),

    /** Get a secure presigned URL for a file (ownership verified) */
    getSecureFileUrl: protectedProcedure
      .input(z.object({ sessionId: z.string(), fileKey: z.string() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const analysis = await getAnalysisBySessionId(input.sessionId);
        if (!analysis) throw new TRPCError({ code: "NOT_FOUND" });
        if (!analysis.userId || analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const files = analysis.files as Array<{ name: string; fileKey?: string; url?: string }>;
        const fileExists = files.some(f => (f.fileKey || f.url) === input.fileKey);
        if (!fileExists) {
          throw new TRPCError({ code: "FORBIDDEN", message: "File not found in this analysis" });
        }
        const { url } = await storageGet(input.fileKey);
        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "access_file",
          resource: "file",
          resourceId: input.fileKey,
          details: JSON.stringify({ sessionId: input.sessionId }),
        });
        return { url };
      }),

    /** Trigger AI analysis for a session */
    analyze: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const analysis = await getAnalysisBySessionId(input.sessionId);
        if (!analysis) throw new Error("Session not found");
        if (analysis.userId && analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (!analysis.userId) {
          await linkAnalysisToUser(input.sessionId, ctx.user.id);
        }
        if (analysis.status === "completed" && analysis.analysisResult) {
          return {
            status: "completed" as const,
            result: analysis.analysisResult as PolicyAnalysis,
          };
        }

        if (analysis.status === "error") {
          await resetAnalysisForRetry(input.sessionId);
        }

        policyAnalysisWorker.nudge();

        return {
          status: analysis.status === "processing" ? "processing" as const : "queued" as const,
          result: null,
        };
      }),

    /** Get analysis results for a session (ownership verified) */
    getAnalysis: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const analysis = await getAnalysisBySessionId(input.sessionId);
        if (!analysis) return null;
        if (!analysis.userId || analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (analysis.status === "completed" && analysis.analysisResult) {
          await audit({
            userId: ctx.user.id,
            action: "view_analysis",
            resource: "analysis",
            resourceId: input.sessionId,
          });
        }

        return {
          sessionId: analysis.sessionId,
          files: analysis.files,
          status: analysis.status,
          createdAt: analysis.createdAt,
          startedAt: analysis.startedAt ?? null,
          lastHeartbeatAt: analysis.lastHeartbeatAt ?? null,
          updatedAt: analysis.updatedAt ?? null,
          attemptCount: analysis.attemptCount ?? 0,
          result: analysis.analysisResult as PolicyAnalysis | null,
          errorMessage: analysis.errorMessage,
          insuranceCategory: analysis.insuranceCategory ?? null,
        };
      }),

    /** Chat Q&A about the analyzed policy (ownership verified) */
    chat: protectedProcedure
      .input(z.object({
        sessionId: z.string(),
        message: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const analysis = await getAnalysisBySessionId(input.sessionId);
        if (!analysis || !analysis.analysisResult) {
          throw new Error("No analysis found for this session");
        }
        if (!analysis.userId || analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }

        // Save user message
        await addChatMessage({
          sessionId: input.sessionId,
          role: "user",
          content: input.message,
        });

        // Get chat history
        const history = await getChatHistory(input.sessionId);

        const policyContext = JSON.stringify(analysis.analysisResult, null, 2);

        let systemContent = CHAT_SYSTEM_PROMPT + policyContext;
        const chatProfile = ctx.user ? await getUserProfile(ctx.user.id) : null;
        if (chatProfile) {
          const profileText = buildProfileContext(chatProfile);
          systemContent += `\n\nפרופיל אישי של הלקוח:\n${profileText}\n\nכשאתה עונה, התחשב במצב האישי והמשפחתי של הלקוח. אם השאלה קשורה לכיסוי מסוים, ציין אם הכיסוי רלוונטי או חסר בהתאם לפרופיל שלו.`;
        }

        const messages = [
          { role: "system" as const, content: systemContent },
          ...history.map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          })),
        ];

        const response = await invokeLLM({ messages });

        const assistantContent = typeof response.choices[0]?.message?.content === "string"
          ? response.choices[0].message.content
          : "";

        // Save assistant response
        await addChatMessage({
          sessionId: input.sessionId,
          role: "assistant",
          content: assistantContent,
        });

        // Track token usage for billing
        const chatUsage = response.usage;
        if (chatUsage) {
          await logApiUsage({
            userId: analysis.userId ?? null,
            sessionId: input.sessionId,
            action: "chat",
            model: response.model || ENV.llmModel,
            promptTokens: chatUsage.prompt_tokens ?? 0,
            completionTokens: chatUsage.completion_tokens ?? 0,
          });
        }

        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "send_chat",
          resource: "chat",
          resourceId: input.sessionId,
        });

        return { response: assistantContent };
      }),

    /** Get chat history for a session (ownership verified) */
    getChatHistory: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const analysis = await getAnalysisBySessionId(input.sessionId);
        if (!analysis || !analysis.userId || analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const history = await getChatHistory(input.sessionId);
        return history.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));
      }),

    summarizeCategory: protectedProcedure
      .input(z.object({ category: z.enum(["health", "life", "car", "home"]) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

        const [profile, allAnalyses] = await Promise.all([
          getUserProfile(ctx.user.id),
          getUserAnalyses(ctx.user.id),
        ]);

        const categoryAnalyses = allAnalyses.filter(
          (analysis) =>
            analysis.status === "completed" &&
            analysis.analysisResult &&
            resolveAnalysisCategoryForSummary(analysis) === input.category
        );

        if (categoryAnalyses.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "לא נמצאו סקירות לקטגוריית הביטוח הזאת",
          });
        }

        const dataHash = crypto
          .createHash("sha256")
          .update(
            categoryAnalyses
              .map((a) => `${a.sessionId}:${new Date(a.updatedAt).getTime()}`)
              .sort()
              .join("|")
          )
          .digest("hex");

        const cached = await getCategorySummaryCache(ctx.user.id, input.category);
        if (cached && cached.dataHash === dataHash && cached.summaryData) {
          return cached.summaryData as InsuranceCategoryLlmSummary;
        }

        const categoryTitle = INSURANCE_CATEGORY_TITLES[input.category];
        const profileContext = profile ? buildProfileContext(profile) : "לא הוזן פרופיל מפורט";
        const metrics = buildCategorySummaryMetrics(categoryAnalyses);
        const payload = buildCategorySummaryPayload(categoryAnalyses);
        const summarySessionId = `category-summary-${ctx.user.id}-${input.category}`;

        const response = await invokeLLM({
          model: ENV.llmModel,
          maxTokens: 3000,
          messages: [
            {
              role: "system",
              content: CATEGORY_SUMMARY_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: `קטגוריית הביטוח: ${categoryTitle}

פרופיל הלקוח:
${profileContext}

מדדים מצטברים:
${JSON.stringify(metrics, null, 2)}

סקירות מלאות של הקטגוריה:
${JSON.stringify(payload, null, 2)}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "insurance_category_summary",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  overview: { type: "string" },
                  highlights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        description: { type: "string" },
                        tone: { type: "string", enum: ["warning", "info", "success"] },
                      },
                      required: ["id", "title", "description", "tone"],
                      additionalProperties: false,
                    },
                  },
                  recommendedActions: {
                    type: "array",
                    items: { type: "string" },
                  },
                  recommendedQuestions: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["overview", "highlights", "recommendedActions", "recommendedQuestions"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = extractLLMContent(response);
        const parsed = parseLLMJson<Omit<InsuranceCategoryLlmSummary, "category">>(content);
        const result: InsuranceCategoryLlmSummary = {
          category: input.category,
          overview: parsed.overview,
          highlights: parsed.highlights,
          recommendedActions: parsed.recommendedActions,
          recommendedQuestions: parsed.recommendedQuestions,
        };

        await upsertCategorySummaryCache(ctx.user.id, input.category, result, dataHash);

        const usage = response.usage;
        if (usage) {
          await logApiUsage({
            userId: ctx.user.id,
            sessionId: summarySessionId,
            action: "chat",
            model: response.model || ENV.llmModel,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          });
        }

        await audit({
          userId: ctx.user.id,
          action: "summarize_category",
          resource: "analysis_category",
          resourceId: input.category,
          details: JSON.stringify({ count: categoryAnalyses.length }),
        });

        return result;
      }),

    /** Get all analyses for the current user */
    getUserAnalyses: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      return getUserAnalyses(ctx.user.id);
    }),

    /** Link an analysis to the current user */
    linkToUser: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        const analysis = await getAnalysisBySessionId(input.sessionId);
        if (!analysis) throw new TRPCError({ code: "NOT_FOUND" });
        if (analysis.userId && analysis.userId !== ctx.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        if (!analysis.userId) {
          await linkAnalysisToUser(input.sessionId, ctx.user.id);
        }
        return { success: true };
      }),

    /** Delete an analysis */
    delete: protectedProcedure
      .input(z.object({ sessionId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new Error("Not authenticated");
        await deleteAnalysis(input.sessionId, ctx.user.id);
        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "delete_analysis",
          resource: "analysis",
          resourceId: input.sessionId,
        });
        return { success: true };
      }),

    /** Get current user's usage stats */
    myUsage: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new Error("Not authenticated");
      return getUserUsageStats(ctx.user.id);
    }),
  }),

  // ── Gmail integration ──
  gmail: router({
    /** Get Gmail OAuth URL for connecting a user's Gmail account */
    getAuthUrl: protectedProcedure
      .input(z.object({
        redirectUri: z.string().optional(),
        returnTo: z.string().optional(),
      }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const exp = Math.floor(Date.now() / 1000) + 600;
        const state = signOAuthState({
          userId: ctx.user.id,
          exp,
          returnTo: normalizeReturnTo(input.returnTo),
        });
        const redirectUri = `${ENV.appUrl}/api/gmail/callback`;
        const url = getGmailAuthUrl(redirectUri, state);
        return { url };
      }),

    /** Handle OAuth callback and save tokens */
    handleCallback: protectedProcedure
      .input(z.object({ code: z.string(), redirectUri: z.string() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const { accessToken, refreshToken, email, expiresAt } = await exchangeCodeForTokens(
          input.code,
          input.redirectUri
        );
        await saveGmailConnection(ctx.user.id, accessToken, refreshToken, email, expiresAt);
        return { success: true, email };
      }),

    connectionStatus: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const connections = await getAllGmailConnections(ctx.user.id);
      return {
        connected: connections.length > 0,
        connections: connections.map((c) => ({
          id: c.id,
          email: c.email,
          lastSyncedAt: c.lastSyncedAt,
          lastSyncCount: c.lastSyncCount ?? 0,
        })),
      };
    }),

    disconnect: protectedProcedure
      .input(z.object({ connectionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        await disconnectGmail(input.connectionId, ctx.user.id);
        await audit({
          userId: ctx.user.id,
          action: "disconnect_gmail",
          resource: "gmail",
          resourceId: String(input.connectionId),
        });
        return { success: true };
      }),

    /** Trigger on-demand email scan */
    scan: protectedProcedure
      .input(z.object({ daysBack: z.number().min(1).max(90).default(7) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const result = await scanGmailForInvoices(ctx.user.id, input.daysBack);
        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "scan_gmail",
          resource: "gmail",
          details: JSON.stringify({ daysBack: input.daysBack, ...result }),
        });
        return result;
      }),

    getInvoices: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) return [];
        const invoices = await db
          .select()
          .from(smartInvoices)
          .where(eq(smartInvoices.userId, ctx.user.id))
          .orderBy(desc(smartInvoices.createdAt))
          .limit(input.limit);
        return invoices.map(inv => {
          try {
            const decrypted = inv.extractedData && typeof inv.extractedData === 'string'
              ? decryptJson(inv.extractedData) as Record<string, unknown>
              : inv.extractedData as Record<string, unknown> | null;

            if (decrypted?.pdfUrl && typeof decrypted.pdfUrl === 'string') {
              try {
                const rawUrl = decrypted.pdfUrl.split('?')[0];
                const fileKey = rawUrl.replace(/^\/api\/files\//, '');
                if (fileKey) {
                  decrypted.pdfUrl = generateSignedFileUrl(fileKey);
                }
              } catch {
                delete decrypted.pdfUrl;
              }
            }

            return {
              ...inv,
              subject: inv.subject ? decryptField(inv.subject) : inv.subject,
              rawText: inv.rawText ? decryptField(inv.rawText) : inv.rawText,
              extractedData: decrypted,
            };
          } catch {
            return {
              ...inv,
              extractedData: null,
            };
          }
        });
      }),

    getInsuranceDiscoveries: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(100).default(25) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return listInsuranceDiscoveries(ctx.user.id, input.limit);
      }),

    discoverPolicies: protectedProcedure
      .input(z.object({ daysBack: z.number().min(1).max(365).default(365) }))
      .query(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        return discoverPolicyPdfs(ctx.user.id, input.daysBack);
      }),

    importPolicyPdf: protectedProcedure
      .input(z.object({
        connectionId: z.number().int().positive(),
        gmailMessageId: z.string().min(1).max(128),
        attachmentId: z.string().min(1).max(255),
        filename: z.string().min(1).max(255),
        insuranceCategory: z.enum(["health", "life", "car", "home"]).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const result = await importPolicyPdfFromGmail({
          userId: ctx.user.id,
          connectionId: input.connectionId,
          gmailMessageId: input.gmailMessageId,
          attachmentId: input.attachmentId,
          filename: input.filename,
          insuranceCategory: input.insuranceCategory ?? null,
        });
        await audit({
          userId: ctx.user.id,
          action: "import_policy_from_gmail",
          resource: "gmail",
          resourceId: result.sessionId,
          details: JSON.stringify({
            connectionId: input.connectionId,
            gmailMessageId: input.gmailMessageId,
            filename: input.filename,
          }),
        });
        return result;
      }),

    /** Clear all invoices and rescan from scratch */
    clearAndRescan: protectedProcedure
      .input(z.object({ daysBack: z.number().min(1).max(90).default(7) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Delete all existing invoices for this user
        await db.delete(smartInvoices).where(eq(smartInvoices.userId, ctx.user.id));
        await db.delete(insuranceArtifacts).where(eq(insuranceArtifacts.userId, ctx.user.id));
        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "clear_invoices",
          resource: "invoice",
          details: JSON.stringify({ daysBack: input.daysBack }),
        });
        // Rescan with the improved parser
        const result = await scanGmailForInvoices(ctx.user.id, input.daysBack);
        return result;
      }),

    addManualExpense: protectedProcedure
      .input(z.object({
        provider: z.string().min(1).max(128),
        amount: z.number().positive(),
        category: z.enum(["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"]),
        invoiceDate: z.string(),
        status: z.enum(["pending", "paid", "overdue", "unknown"]).default("paid"),
        flowDirection: z.enum(["expense", "income", "unknown"]).default("expense"),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const manualId = `manual-${nanoid()}`;
        const extractedData: Record<string, unknown> = {};
        if (input.description) extractedData.description = input.description;
        extractedData.flowDirection = input.flowDirection;
        const [inserted] = await db.insert(smartInvoices).values({
          userId: ctx.user.id,
          gmailConnectionId: null,
          sourceEmail: null,
          gmailMessageId: manualId,
          provider: input.provider,
          category: input.category,
          amount: String(input.amount),
          invoiceDate: new Date(input.invoiceDate),
          status: input.status,
          flowDirection: input.flowDirection,
          subject: null,
          rawText: null,
          extractedData: Object.keys(extractedData).length > 0 ? encryptJson(extractedData) : null,
          parsed: true,
        }).returning({ id: smartInvoices.id });
        await audit({
          userId: ctx.user.id,
          action: "add_manual_expense",
          resource: "invoice",
          resourceId: String(inserted.id),
          details: JSON.stringify({ provider: input.provider, amount: input.amount, flowDirection: input.flowDirection }),
        });
        return { id: inserted.id };
      }),

    updateInvoiceCategory: protectedProcedure
      .input(z.object({
        invoiceId: z.number(),
        customCategory: z.string().min(1).max(128),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const [invoice] = await db
          .select({ id: smartInvoices.id, provider: smartInvoices.provider })
          .from(smartInvoices)
          .where(and(eq(smartInvoices.id, input.invoiceId), eq(smartInvoices.userId, ctx.user.id)))
          .limit(1);

        if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

        await db
          .update(smartInvoices)
          .set({ customCategory: input.customCategory })
          .where(eq(smartInvoices.id, input.invoiceId));

        if (invoice.provider) {
          const normalizedProvider = invoice.provider.trim().toLowerCase();

          await db
            .insert(categoryMappings)
            .values({
              userId: ctx.user.id,
              providerPattern: normalizedProvider,
              customCategory: input.customCategory,
            })
            .onConflictDoUpdate({
              target: [categoryMappings.userId, categoryMappings.providerPattern],
              set: { customCategory: input.customCategory, updatedAt: new Date() },
            });

          await db
            .update(smartInvoices)
            .set({ customCategory: input.customCategory })
            .where(
              and(
                eq(smartInvoices.userId, ctx.user.id),
                eq(smartInvoices.provider, invoice.provider)
              )
            );
        }

        await audit({
          userId: ctx.user.id,
          action: "update_invoice_category",
          resource: "invoice",
          resourceId: String(input.invoiceId),
          details: JSON.stringify({ customCategory: input.customCategory, provider: invoice.provider }),
        });

        return { success: true };
      }),

    getMonthlySummary: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) return [];
      const rawInvoices = await db
        .select()
        .from(smartInvoices)
        .where(eq(smartInvoices.userId, ctx.user.id))
        .orderBy(desc(smartInvoices.createdAt));
      const invoices = rawInvoices.map(inv => {
        try {
          return {
            ...inv,
            subject: inv.subject ? decryptField(inv.subject) : inv.subject,
            rawText: inv.rawText ? decryptField(inv.rawText) : inv.rawText,
            extractedData: inv.extractedData && typeof inv.extractedData === 'string'
              ? decryptJson(inv.extractedData)
              : inv.extractedData,
          };
        } catch {
          return { ...inv, extractedData: null };
        }
      });

      return summarizeMonthlyInvoices(invoices);
    }),
  }),

  // ── Admin procedures (admin role required) ──
  admin: router({
    /** Get platform-wide stats (admin only) */
    platformStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      // Audit log
      await audit({
        userId: ctx.user.id,
        action: "admin_view_stats",
        resource: "admin",
      });
      return getPlatformStats();
    }),

    /** Get all users with their usage summary (admin only) */
    allUsers: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      // Audit log
      await audit({
        userId: ctx.user.id,
        action: "admin_view_users",
        resource: "admin",
      });
      return getAllUsersWithUsage();
    }),

    /** Get detailed usage for a specific user (admin only) */
    userDetail: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        return getUserUsageStats(input.userId);
      }),

    dashboardStats: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      await audit({
        userId: ctx.user.id,
        action: "admin_view_stats",
        resource: "admin",
      });
      return getAdminDashboardStats();
    }),

    recentActivity: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const logs = await getRecentAuditLogs(input?.limit ?? 100);
        const { getDb: getDbFn } = await import("./db");
        const db = await getDbFn();
        if (!db) return logs.map(l => ({ ...l, userName: null, userEmail: null }));
        const { users: usersTable } = await import("../drizzle/schema");
        const allUsers = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable);
        const userMap = new Map(allUsers.map(u => [u.id, u]));
        return logs.map(l => ({
          ...l,
          userName: l.userId ? userMap.get(l.userId)?.name ?? null : null,
          userEmail: l.userId ? userMap.get(l.userId)?.email ?? null : null,
        }));
      }),

    securityEvents: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(100) }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        const events = await getSecurityEvents(input?.limit ?? 100);
        const { getDb: getDbFn } = await import("./db");
        const db = await getDbFn();
        if (!db) return events.map(e => ({ ...e, userName: null, userEmail: null }));
        const { users: usersTable } = await import("../drizzle/schema");
        const allUsers = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable);
        const userMap = new Map(allUsers.map(u => [u.id, u]));
        return events.map(e => ({
          ...e,
          userName: e.userId ? userMap.get(e.userId)?.name ?? null : null,
          userEmail: e.userId ? userMap.get(e.userId)?.email ?? null : null,
        }));
      }),

    userSummary: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        return getUserDetailedSummary(input.userId);
      }),

    llmBreakdown: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return getLLMUsageBreakdown();
    }),

    systemHealth: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return getSystemHealth();
    }),

    newUsersOverTime: protectedProcedure
      .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
      .query(async ({ ctx, input }) => {
        if (ctx.user?.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
        }
        return getNewUsersOverTime(input?.days ?? 30);
      }),

    categoryDistribution: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      return getCategoryDistribution();
    }),
  }),
});

export type AppRouter = typeof appRouter;

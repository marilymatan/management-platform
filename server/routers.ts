import crypto from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { storagePut, storageGet, storageRead, sanitizeFilename, generateSignedFileUrl } from "./storage";
import { invokeLLM } from "./_core/llm";
import { ENV } from "./_core/env";
import {
  createAnalysis,
  getAnalysisBySessionId,
  updateAnalysisStatus,
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
  getAdminDashboardStats,
  getUserDetailedSummary,
  getLLMUsageBreakdown,
  getSystemHealth,
  getNewUsersOverTime,
  getCategoryDistribution,
} from "./db";
import { TRPCError } from "@trpc/server";
import type { PolicyAnalysis } from "@shared/insurance";
import {
  getGmailAuthUrl,
  exchangeCodeForTokens,
  saveGmailConnection,
  getAllGmailConnections,
  disconnectGmail,
  scanGmailForInvoices,
} from "./gmail";
import { getDb } from "./db";
import { smartInvoices, categoryMappings } from "../drizzle/schema";
import { decryptField, decryptJson, encryptJson } from "./encryption";
import { eq, desc, and } from "drizzle-orm";
import { audit, getClientIp, getRecentAuditLogs, getSecurityEvents } from "./auditLog";
import { summarizeMonthlyInvoices } from "./invoiceSummary";

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

const ANALYSIS_SYSTEM_PROMPT = `אתה מומחה לניתוח פוליסות ביטוח בעברית. תפקידך לנתח את הטקסט של פוליסת הביטוח ולחלץ ממנו מידע מובנה.

עליך להחזיר JSON בפורמט הבא בלבד, ללא טקסט נוסף:
{
  "coverages": [
    {
      "id": "מזהה ייחודי",
      "title": "שם הכיסוי/ההטבה",
      "category": "קטגוריה (למשל: רפואה משלימה, אשפוז, שיניים, עיניים, תרופות, ניתוחים, אחר)",
      "limit": "מגבלת שימוש (למשל: עד 12 טיפולים בשנה)",
      "details": "תיאור מפורט של הכיסוי",
      "eligibility": "תנאי זכאות",
      "copay": "גובה השתתפות עצמית",
      "maxReimbursement": "תקרת החזר כספי",
      "exclusions": "החרגות רלוונטיות",
      "waitingPeriod": "תקופת אכשרה",
      "sourceFile": "שם הקובץ שמהו הכיסוי חולץ"
    }
  ],
  "generalInfo": {
    "policyName": "שם הפוליסה",
    "insurerName": "שם חברת הביטוח",
    "policyNumber": "מספר פוליסה",
    "policyType": "סוג הפוליסה",
    "insuranceCategory": "health | life | car | home",
    "monthlyPremium": "פרמיה חודשית",
    "annualPremium": "פרמיה שנתית",
    "startDate": "תאריך תחילה",
    "endDate": "תאריך סיום",
    "importantNotes": ["הערות חשובות"],
    "fineprint": ["אותיות קטנות וחריגים בולטים"]
  },
  "summary": "סיכום כללי קצר של הפוליסה ב-2-3 משפטים",
  "duplicateCoverages": [
    {
      "id": "מזהה ייחודי",
      "title": "שם הכיסוי הכפול",
      "coverageIds": ["מזהה כיסוי 1", "מזהה כיסוי 2"],
      "sourceFiles": ["שם קובץ 1", "שם קובץ 2"],
      "explanation": "הסבר קצר מדוע כיסויים אלו נחשבים כפולים או חופפים",
      "recommendation": "המלצה למשתמש, למשל: לבדוק אם משלם כפל ביטוח"
    }
  ]
}

הנחיות:
- חלץ את כל הכיסויים וההטבות שמופיעים בפוליסה
- לכל כיסוי, הוסף את שם הקובץ (sourceFile) שממנו הוא חולץ
- אם מידע מסוים לא נמצא, רשום "לא מצוין בפוליסה" (לא "לא צוין")
- עבור insuranceCategory, סווג את הפוליסה לאחת מהקטגוריות הבאות בלבד:
  * "health" - ביטוח בריאות (רפואה משלימה, אשפוז, שיניים, תרופות, ביטוח בריאות)
  * "life" - ביטוח חיים (ביטוח חיים, ריסק, אובדן כושר עבודה, נכות, מוות, סיעודי, פנסיה)
  * "car" - ביטוח רכב (ביטוח רכב, מקיף, צד ג, חובה, רכב)
  * "home" - ביטוח דירה (ביטוח דירה, מבנה, תכולה, רעידת אדמה, צנרת)
- הקפד על דיוק בנתונים הכספיים
- שמור על שפה ברורה ומובנת בעברית
- החזר JSON תקין בלבד

הנחיות לזיהוי כיסויים כפולים:
- בדוק אם יש כיסויים זהים או חופפים שמופיעים ביותר מקובץ אחד, או אפילו בתוך אותו קובץ
- כיסוי נחשב כפול כאשר שני כיסויים מכסים את אותו סוג טיפול/שירות, גם אם השמות שונים במקצת
- לכל קבוצת כיסויים כפולים, ציין את ה-id של הכיסויים הרלוונטיים מתוך מערך ה-coverages
- הסבר בבירור למה הכיסויים נחשבים כפולים (למשל: שניהם מכסים ביקור רופא מומחה)
- תן המלצה מעשית למשתמש (למשל: כדאי לבדוק אם ניתן לבטל אחד מהכיסויים ולחסוך בפרמיה)
- אם אין כיסויים כפולים, החזר מערך ריק []`;

const CHAT_SYSTEM_PROMPT = `אתה עוזר וירטואלי מומחה בפוליסות ביטוח. תפקידך לענות על שאלות של המשתמש לגבי פוליסת הביטוח שלו.

כללים חשובים:
1. ענה אך ורק על סמך המידע שחולץ מהפוליסה. אל תמציא מידע.
2. אם התשובה לא נמצאת במידע שסופק, אמור זאת בבירור.
3. ענה בעברית בשפה ברורה ומובנת.
4. אם המשתמש שואל שאלה כללית שלא קשורה לפוליסה, הפנה אותו בנימוס לשאול שאלות על הפוליסה.
5. כשאתה מצטט מידע מהפוליסה, ציין את הפרטים הרלוונטיים (השתתפות עצמית, מגבלות, החרגות).

להלן המידע שחולץ מהפוליסה:
`;

const PERSONALIZED_INSIGHTS_PROMPT = `אתה יועץ ביטוח מומחה ומנוסה בישראל. קיבלת ניתוח מלא של פוליסת ביטוח ופרופיל אישי של הלקוח.

תפקידך: לזהות פערים ביטוחיים, סיכונים, והמלצות מותאמות אישית על בסיס המצב האישי והמשפחתי של הלקוח.

עליך לבדוק את הנקודות הבאות ולהחזיר תובנות רלוונטיות בלבד:

1. **ילדים ומשפחה**: אם יש ילדים - האם יש כיסוי לתאונות ילדים, ביטוח בריאות לילדים, ביטוח שיניים לילדים? האם סכום ביטוח החיים מתאים למספר הנפשות התלויות?
2. **דירה ומשכנתא**: אם יש דירה בבעלות - האם יש ביטוח מבנה ותכולה? אם יש משכנתא - האם יש ביטוח חיים לכיסוי המשכנתא?
3. **רכבים**: אם יש רכבים - האם יש כיסוי מקיף/צד ג'? האם מספר הרכבים תואם את הכיסוי?
4. **תעסוקה והכנסה**: האם יש ביטוח אובדן כושר עבודה? האם סכום הכיסוי מתאים לטווח ההכנסה? עצמאים - האם יש ביטוח אחריות מקצועית?
5. **גיל ושלב בחיים**: על בסיס הגיל - האם הפוליסה מתאימה? האם כדאי לשקול ביטוח סיעודי? האם תקופת האכשרה בעייתית?
6. **ספורט אקסטרימי**: אם יש תחביבים מסוכנים - האם יש החרגות רלוונטיות בפוליסה?
7. **מצב בריאותי**: אם יש מצבים בריאותיים מיוחדים - האם הכיסוי הבריאותי מתאים? האם יש החרגות שעלולות להשפיע?
8. **חיות מחמד**: אם יש חיות מחמד - האם יש ביטוח וטרינרי?

כללים:
- החזר רק תובנות רלוונטיות למצב הספציפי של הלקוח (אל תחזיר תובנות על ילדים אם אין ילדים, וכו')
- לכל תובנה, סווג אותה כ: "warning" (חסר כיסוי קריטי), "recommendation" (המלצה לשיפור), או "positive" (כיסוי מתאים קיים)
- דרג כל תובנה: "high" (דחוף/קריטי), "medium" (חשוב), או "low" (כדאי לשקול)
- כתוב בעברית ברורה ומובנת, בגובה העיניים
- הסבר בקצרה למה זה רלוונטי ומה ההמלצה המעשית
- החזר 3-8 תובנות, לא יותר
- אם יש כיסוי טוב שמתאים למצב הלקוח, ציין את זה כ-"positive"

החזר JSON בפורמט הבא בלבד:
{
  "personalizedInsights": [
    {
      "id": "מזהה ייחודי",
      "type": "warning | recommendation | positive",
      "title": "כותרת קצרה",
      "description": "תיאור מפורט של התובנה וההמלצה",
      "relevantCoverage": "שם הכיסוי הרלוונטי מהפוליסה (אם יש)",
      "priority": "high | medium | low"
    }
  ]
}`;

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
  };
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
          const safeName = sanitizeFilename(file.name);
          const fileKey = `policies/${sessionId}/${nanoid(8)}-${safeName}`;
          await storagePut(fileKey, buffer, "application/pdf");
          uploadedFiles.push({ name: file.name, size: file.size, fileKey });
        }

        await createAnalysis({
          sessionId,
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

        return { sessionId, files: uploadedFiles };
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

        await updateAnalysisStatus(input.sessionId, "processing");

        try {
          let userContent: any[];

          const fileParts = await Promise.all(
            analysis.files.map(async (file: { name: string; fileKey?: string; url?: string }) => {
              const fileKey = file.fileKey || file.url;
              if (!fileKey) return null;
              const buffer = await storageRead(fileKey);
              if (!buffer) return null;
              const base64 = buffer.toString("base64");
              return {
                type: "image_url" as const,
                image_url: {
                  url: `data:application/pdf;base64,${base64}`,
                },
              };
            })
          );
          userContent = [
            { type: "text", text: `נא לנתח את פוליסות הביטוח הבאות (${analysis.files.length} קבצים) ולהחזיר את המידע בפורמט JSON המבוקש:` },
            ...fileParts.filter(Boolean),
          ];

          const response = await invokeLLM({
            messages: [
              { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
              {
                role: "user",
                content: userContent,
              },
            ],
            maxTokens: 65536,
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "policy_analysis",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    coverages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          category: { type: "string" },
                          limit: { type: "string" },
                          details: { type: "string" },
                          eligibility: { type: "string" },
                          copay: { type: "string" },
                          maxReimbursement: { type: "string" },
                          exclusions: { type: "string" },
                          waitingPeriod: { type: "string" },
                          sourceFile: { type: "string" },
                        },
                        required: ["id", "title", "category", "limit", "details", "eligibility", "copay", "maxReimbursement", "exclusions", "waitingPeriod", "sourceFile"],
                        additionalProperties: false,
                      },
                    },
                    generalInfo: {
                      type: "object",
                      properties: {
                        policyName: { type: "string" },
                        insurerName: { type: "string" },
                        policyNumber: { type: "string" },
                        policyType: { type: "string" },
                        insuranceCategory: { type: "string", enum: ["health", "life", "car", "home"] },
                        monthlyPremium: { type: "string" },
                        annualPremium: { type: "string" },
                        startDate: { type: "string" },
                        endDate: { type: "string" },
                        importantNotes: { type: "array", items: { type: "string" } },
                        fineprint: { type: "array", items: { type: "string" } },
                      },
                      required: ["policyName", "insurerName", "policyNumber", "policyType", "insuranceCategory", "monthlyPremium", "annualPremium", "startDate", "endDate", "importantNotes", "fineprint"],
                      additionalProperties: false,
                    },
                    summary: { type: "string" },
                    duplicateCoverages: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          coverageIds: { type: "array", items: { type: "string" } },
                          sourceFiles: { type: "array", items: { type: "string" } },
                          explanation: { type: "string" },
                          recommendation: { type: "string" },
                        },
                        required: ["id", "title", "coverageIds", "sourceFiles", "explanation", "recommendation"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["coverages", "generalInfo", "summary", "duplicateCoverages"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = extractLLMContent(response);
          let analysisResult: PolicyAnalysis;
          try {
            analysisResult = parseLLMJson<PolicyAnalysis>(content);
          } catch (parseError: any) {
            console.error("[Analysis] JSON parse failed:", parseError.message, "| Content length:", content.length, "| finish_reason:", response.choices?.[0]?.finish_reason);
            throw new Error(
              "שגיאה בעיבוד תגובת ה-AI. התגובה לא התקבלה בפורמט תקין. נסה להעלות פחות קבצים בבת אחת."
            );
          }

          // Track token usage for billing
          const usage = response.usage;
          if (usage) {
            await logApiUsage({
              userId: analysis.userId ?? null,
              sessionId: input.sessionId,
              action: "analyze",
              promptTokens: usage.prompt_tokens ?? 0,
              completionTokens: usage.completion_tokens ?? 0,
            });
          }

          const userProfile = ctx.user ? await getUserProfile(ctx.user.id) : null;
          if (userProfile) {
            try {
              const profileText = buildProfileContext(userProfile);
              const insightsResponse = await invokeLLM({
                messages: [
                  { role: "system", content: PERSONALIZED_INSIGHTS_PROMPT },
                  {
                    role: "user",
                    content: `פרופיל הלקוח:\n${profileText}\n\nניתוח הפוליסה:\n${JSON.stringify(analysisResult, null, 2)}`,
                  },
                ],
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "personalized_insights",
                    strict: true,
                    schema: {
                      type: "object",
                      properties: {
                        personalizedInsights: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              type: { type: "string", enum: ["warning", "recommendation", "positive"] },
                              title: { type: "string" },
                              description: { type: "string" },
                              relevantCoverage: { type: "string" },
                              priority: { type: "string", enum: ["high", "medium", "low"] },
                            },
                            required: ["id", "type", "title", "description", "relevantCoverage", "priority"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["personalizedInsights"],
                      additionalProperties: false,
                    },
                  },
                },
              });

              try {
                const insightsContent = extractLLMContent(insightsResponse);
                const parsed = parseLLMJson(insightsContent);
                analysisResult.personalizedInsights = parsed.personalizedInsights;
              } catch {
              }

              const insightsUsage = insightsResponse.usage;
              if (insightsUsage) {
                await logApiUsage({
                  userId: analysis.userId ?? null,
                  sessionId: input.sessionId,
                  action: "analyze",
                  promptTokens: insightsUsage.prompt_tokens ?? 0,
                  completionTokens: insightsUsage.completion_tokens ?? 0,
                });
              }
            } catch (insightError) {
              console.error("[Insights] Failed to generate personalized insights:", insightError);
            }
          }

          const detectedCategory = analysisResult.generalInfo?.insuranceCategory;
          await updateAnalysisStatus(input.sessionId, "completed", {
            analysisResult,
            insuranceCategory: detectedCategory,
          });

          // Audit log
          await audit({
            userId: ctx.user.id,
            action: "create_analysis",
            resource: "analysis",
            resourceId: input.sessionId,
          });

          return { status: "completed" as const, result: analysisResult };
        } catch (error: any) {
          await updateAnalysisStatus(input.sessionId, "error", {
            errorMessage: error.message || "Unknown error",
          });
          throw error;
        }
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
        // Audit log
        await audit({
          userId: ctx.user.id,
          action: "view_analysis",
          resource: "analysis",
          resourceId: input.sessionId,
        });

        return {
          sessionId: analysis.sessionId,
          files: analysis.files,
          status: analysis.status,
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
      .input(z.object({ redirectUri: z.string().optional() }))
      .query(async ({ ctx }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const exp = Math.floor(Date.now() / 1000) + 600;
        const state = signOAuthState({ userId: ctx.user.id, exp });
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

    /** Clear all invoices and rescan from scratch */
    clearAndRescan: protectedProcedure
      .input(z.object({ daysBack: z.number().min(1).max(90).default(7) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        // Delete all existing invoices for this user
        await db.delete(smartInvoices).where(eq(smartInvoices.userId, ctx.user.id));
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

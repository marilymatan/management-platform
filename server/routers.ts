import crypto from "crypto";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import { storagePut, storageGet, storageRead, sanitizeFilename } from "./storage";
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
import { smartInvoices } from "../drizzle/schema";
import { decryptField, decryptJson } from "./encryption";
import { eq, desc } from "drizzle-orm";
import { audit, getClientIp, getRecentAuditLogs, getSecurityEvents } from "./auditLog";

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
                        monthlyPremium: { type: "string" },
                        annualPremium: { type: "string" },
                        startDate: { type: "string" },
                        endDate: { type: "string" },
                        importantNotes: { type: "array", items: { type: "string" } },
                        fineprint: { type: "array", items: { type: "string" } },
                      },
                      required: ["policyName", "insurerName", "policyNumber", "policyType", "monthlyPremium", "annualPremium", "startDate", "endDate", "importantNotes", "fineprint"],
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

          const content = response.choices[0]?.message?.content;
          if (!content || typeof content !== "string") {
            throw new Error("Empty response from AI");
          }

          const analysisResult: PolicyAnalysis = JSON.parse(content);

          await updateAnalysisStatus(input.sessionId, "completed", {
            analysisResult,
          });

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

        // Build context from analysis result
        const policyContext = JSON.stringify(analysis.analysisResult, null, 2);

        const messages = [
          { role: "system" as const, content: CHAT_SYSTEM_PROMPT + policyContext },
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
        return invoices.map(inv => ({
          ...inv,
          subject: inv.subject ? decryptField(inv.subject) : inv.subject,
          rawText: inv.rawText ? decryptField(inv.rawText) : inv.rawText,
          extractedData: inv.extractedData && typeof inv.extractedData === 'string'
            ? decryptJson(inv.extractedData)
            : inv.extractedData,
        }));
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

    /** Get monthly summary of invoices */
    getMonthlySummary: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
      const db = await getDb();
      if (!db) return [];
      const rawInvoices = await db
        .select()
        .from(smartInvoices)
        .where(eq(smartInvoices.userId, ctx.user.id))
        .orderBy(desc(smartInvoices.createdAt));
      // Decrypt sensitive fields
      const invoices = rawInvoices.map(inv => ({
        ...inv,
        subject: inv.subject ? decryptField(inv.subject) : inv.subject,
        rawText: inv.rawText ? decryptField(inv.rawText) : inv.rawText,
        extractedData: inv.extractedData && typeof inv.extractedData === 'string'
          ? decryptJson(inv.extractedData)
          : inv.extractedData,
      }));

      // Group by category and sum amounts
      const summary: Record<string, { category: string; total: number; count: number }> = {};
      for (const inv of invoices) {
        const cat = inv.category ?? "אחר";
        if (!summary[cat]) summary[cat] = { category: cat, total: 0, count: 0 };
        summary[cat].total += parseFloat(inv.amount ?? "0");
        summary[cat].count++;
      }
      return Object.values(summary).sort((a, b) => b.total - a.total);
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
  }),
});

export type AppRouter = typeof appRouter;

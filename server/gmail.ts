/**
 * Gmail Integration Service
 * Handles OAuth2 flow, token encryption/decryption, email scanning,
 * HTML-to-text conversion, PDF attachment extraction, and AI-powered
 * invoice data extraction.
 */

import { google } from "googleapis";
import crypto from "crypto";
import { getDb } from "./db";
import { gmailConnections, smartInvoices } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { convert as htmlToText } from "html-to-text";
import { storagePut, storageRead } from "./storage";
import { encryptField, encryptJson } from "./encryption";
import { ENV } from "./_core/env";


// ─── Encryption helpers ───────────────────────────────────────────────────────

const ENCRYPTION_KEY = (process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "dev-fallback-key-not-for-production").slice(0, 32).padEnd(32, "0");
const ALGORITHM = "aes-256-gcm";

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

function decrypt(encryptedText: string): string {
  const [ivHex, tagHex, dataHex] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// ─── OAuth2 client factory ────────────────────────────────────────────────────

export function createOAuth2Client(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    redirectUri
  );
}

export function getGmailAuthUrl(redirectUri: string, state: string): string {
  const oauth2Client = createOAuth2Client(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    state,
    prompt: "consent", // Force consent to always get refresh_token
  });
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; email: string; expiresAt: Date }> {
  const oauth2Client = createOAuth2Client(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Missing tokens from Google OAuth response");
  }

  // Get user email from Google
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email: userInfo.email ?? "",
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
  };
}

// ─── Scope verification ─────────────────────────────────────────────────────

/**
 * Verify that the access token has the gmail.readonly scope.
 * Uses Google's tokeninfo endpoint.
 */
export async function verifyGmailScopes(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return false;
    const info = (await res.json()) as { scope?: string };
    const scopes = info.scope?.split(" ") ?? [];
    return scopes.some((s) => s.includes("gmail.readonly") || s.includes("mail.google.com"));
  } catch {
    return false;
  }
}

// ─── Token storage ────────────────────────────────────────────────────────────

export async function saveGmailConnection(
  userId: number,
  accessToken: string,
  refreshToken: string,
  email: string,
  expiresAt: Date
) {
  const encryptedAccess = encrypt(accessToken);
  const encryptedRefresh = encrypt(refreshToken);

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(gmailConnections)
    .values({
      userId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      email,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: gmailConnections.userId,
      set: {
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        email,
        expiresAt,
        updatedAt: new Date(),
      },
    });
}

export async function getGmailConnection(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [conn] = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId))
    .limit(1);
  return conn ?? null;
}

export async function disconnectGmail(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(gmailConnections).where(eq(gmailConnections.userId, userId));
}

// ─── OAuth2 client with stored tokens ────────────────────────────────────────

async function getAuthenticatedClient(userId: number) {
  const conn = await getGmailConnection(userId);
  if (!conn) throw new Error("Gmail not connected for this user");

  const accessToken = decrypt(conn.accessToken);
  const refreshToken = decrypt(conn.refreshToken);

  const oauth2Client = createOAuth2Client("");
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: conn.expiresAt?.getTime(),
  });

  // Auto-refresh if expired
  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      const encryptedAccess = encrypt(tokens.access_token);
      const refreshDb = await getDb();
      if (refreshDb) {
        await refreshDb
          .update(gmailConnections)
          .set({
            accessToken: encryptedAccess,
            expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
          })
          .where(eq(gmailConnections.userId, userId));
      }
    }
  });

  return oauth2Client;
}

// ─── Provider detection ───────────────────────────────────────────────────────

const ISRAELI_PROVIDERS: Array<{
  name: string;
  category: "תקשורת" | "חשמל" | "מים" | "ארנונה" | "ביטוח" | "בנק" | "רכב" | "אחר";
  keywords: string[];
  domains: string[];
}> = [
  // תקשורת
  { name: "בזק", category: "תקשורת", keywords: ["בזק", "bezeq"], domains: ["bezeq.co.il"] },
  { name: "הוט", category: "תקשורת", keywords: ["הוט", "hot"], domains: ["hot.net.il"] },
  { name: "פרטנר", category: "תקשורת", keywords: ["פרטנר", "partner"], domains: ["partner.co.il"] },
  { name: "סלקום", category: "תקשורת", keywords: ["סלקום", "cellcom"], domains: ["cellcom.co.il"] },
  { name: "012 סמייל", category: "תקשורת", keywords: ["012", "smile"], domains: ["012.net.il"] },
  { name: "גולן טלקום", category: "תקשורת", keywords: ["גולן", "golan telecom"], domains: ["golantelecom.co.il"] },
  { name: "רמי לוי תקשורת", category: "תקשורת", keywords: ["רמי לוי תקשורת"], domains: ["rami-levy.co.il"] },
  // חשמל
  { name: "חברת החשמל", category: "חשמל", keywords: ["חברת החשמל", "iec", "חשמל"], domains: ["iec.co.il"] },
  // מים
  { name: "מקורות", category: "מים", keywords: ["מקורות", "mekorot"], domains: ["mekorot.co.il"] },
  { name: "תמי 4", category: "מים", keywords: ["תמי 4", "tami4", "תמי4"], domains: ["tami4.co.il"] },
  // ארנונה
  { name: "עיריית תל אביב", category: "ארנונה", keywords: ["עיריית תל אביב", "arnona tel aviv"], domains: ["tel-aviv.gov.il"] },
  { name: "עיריית ירושלים", category: "ארנונה", keywords: ["עיריית ירושלים"], domains: ["jerusalem.muni.il"] },
  { name: "עיריית חיפה", category: "ארנונה", keywords: ["עיריית חיפה"], domains: ["haifa.muni.il"] },
  { name: "עיריית ראשון לציון", category: "ארנונה", keywords: ["עיריית ראשון לציון"], domains: ["rishonlezion.muni.il"] },
  // ביטוח
  { name: "מנורה מבטחים", category: "ביטוח", keywords: ["מנורה", "menora"], domains: ["menora.co.il"] },
  { name: "הפניקס", category: "ביטוח", keywords: ["הפניקס", "phoenix"], domains: ["phoenix.co.il"] },
  { name: "מגדל", category: "ביטוח", keywords: ["מגדל", "migdal"], domains: ["migdal.co.il"] },
  { name: "כלל ביטוח", category: "ביטוח", keywords: ["כלל ביטוח", "clal"], domains: ["clal.co.il"] },
  { name: "הראל", category: "ביטוח", keywords: ["הראל", "harel"], domains: ["harel-group.co.il"] },
  { name: "איילון", category: "ביטוח", keywords: ["איילון", "ayalon"], domains: ["ayalon.co.il"] },
  { name: "שירביט", category: "ביטוח", keywords: ["שירביט", "shirbit"], domains: ["shirbit.co.il"] },
  // בנק
  { name: "בנק לאומי", category: "בנק", keywords: ["לאומי", "leumi"], domains: ["leumi.co.il"] },
  { name: "בנק הפועלים", category: "בנק", keywords: ["הפועלים", "hapoalim"], domains: ["bankhapoalim.co.il"] },
  { name: "בנק דיסקונט", category: "בנק", keywords: ["דיסקונט", "discount"], domains: ["discountbank.co.il"] },
  { name: "בנק מזרחי טפחות", category: "בנק", keywords: ["מזרחי", "mizrahi"], domains: ["mizrahi-tefahot.co.il"] },
  { name: "ישראכרט", category: "בנק", keywords: ["ישראכרט", "isracard"], domains: ["isracard.co.il"] },
  { name: "כאל", category: "בנק", keywords: ["כאל", "cal"], domains: ["cal.co.il"] },
  { name: "מקס", category: "בנק", keywords: ["מקס", "max"], domains: ["max.co.il"] },
  // רכב
  { name: "דלק", category: "רכב", keywords: ["דלק", "delek"], domains: ["delek.co.il"] },
  { name: "פז", category: "רכב", keywords: ["פז", "paz"], domains: ["paz.co.il"] },
  { name: "סונול", category: "רכב", keywords: ["סונול", "sonol"], domains: ["sonol.co.il"] },
  // כללי - ספקים נפוצים
  { name: "Apple", category: "אחר", keywords: ["apple", "itunes", "app store", "icloud"], domains: ["apple.com", "email.apple.com"] },
  { name: "Google", category: "אחר", keywords: ["google", "youtube premium", "google one"], domains: ["google.com"] },
  { name: "Netflix", category: "אחר", keywords: ["netflix"], domains: ["netflix.com"] },
  { name: "Spotify", category: "אחר", keywords: ["spotify"], domains: ["spotify.com"] },
  { name: "Amazon", category: "אחר", keywords: ["amazon", "aws"], domains: ["amazon.com", "amazon.co.il"] },
  { name: "Wix", category: "אחר", keywords: ["wix"], domains: ["wix.com"] },
];

const INVOICE_KEYWORDS = [
  "חשבונית", "חשבון", "קבלה", "אישור תשלום", "דוח", "חיוב", "invoice",
  "receipt", "payment", "bill", "statement", "לתשלום", "סכום לתשלום",
  "תאריך חיוב", "מועד תשלום", "חשבונית מס", "חשבון חודשי",
  "your receipt", "payment confirmation", "order confirmation",
  "הקבלה שלך", "אישור הזמנה", "פירוט חיוב",
];

function detectProvider(subject: string, from: string, body: string): {
  name: string;
  category: "תקשורת" | "חשמל" | "מים" | "ארנונה" | "ביטוח" | "בנק" | "רכב" | "אחר";
} | null {
  const text = `${subject} ${from} ${body}`.toLowerCase();

  for (const provider of ISRAELI_PROVIDERS) {
    const matchesKeyword = provider.keywords.some((kw) => text.includes(kw.toLowerCase()));
    const matchesDomain = provider.domains.some((d) => from.toLowerCase().includes(d));
    if (matchesKeyword || matchesDomain) {
      return { name: provider.name, category: provider.category };
    }
  }
  return null;
}

function isInvoiceEmail(subject: string, body: string): boolean {
  const text = `${subject} ${body}`.toLowerCase();
  return INVOICE_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

// ─── HTML to clean text ──────────────────────────────────────────────────────

/**
 * Convert HTML email body to clean readable text.
 * Strips all tags, CSS, scripts, and returns only the textual content.
 */
function stripHtmlToText(html: string): string {
  try {
    const text = htmlToText(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
        { selector: "table", format: "dataTable" },
      ],
    });
    // Clean up excessive whitespace
    return text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();
  } catch {
    // Fallback: simple regex-based stripping
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}

// ─── Email scanning ───────────────────────────────────────────────────────────

interface ScannedEmail {
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  /** Clean text body (HTML stripped) */
  body: string;
  /** Whether the email has PDF attachments */
  hasAttachment: boolean;
  /** PDF attachment info for download */
  pdfAttachments: Array<{
    filename: string;
    attachmentId: string;
    size: number;
  }>;
}

async function fetchRecentEmails(
  userId: number,
  daysBack: number = 7
): Promise<ScannedEmail[]> {
  const auth = await getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: "v1", auth });

  // Build query: last N days, only relevant emails
  const after = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
  const query = `after:${after} (חשבונית OR חשבון OR קבלה OR invoice OR bill OR payment OR חיוב OR לתשלום OR receipt OR הקבלה OR has:attachment filename:pdf)`;

  const listRes = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  const emails: ScannedEmail[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    try {
      const msgRes = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "full",
      });

      const headers = msgRes.data.payload?.headers ?? [];
      const subject = headers.find((h) => h.name === "Subject")?.value ?? "";
      const from = headers.find((h) => h.name === "From")?.value ?? "";
      const dateStr = headers.find((h) => h.name === "Date")?.value ?? "";

      // ─── Extract body text ─────────────────────────────────────────────
      let plainTextBody = "";
      let htmlBody = "";

      type PayloadParts = NonNullable<typeof msgRes.data.payload>["parts"];

      const extractBodies = (parts: PayloadParts): void => {
        if (!parts) return;
        for (const part of parts) {
          if (part.mimeType === "text/plain" && part.body?.data && !plainTextBody) {
            plainTextBody = Buffer.from(part.body.data, "base64").toString("utf8");
          }
          if (part.mimeType === "text/html" && part.body?.data && !htmlBody) {
            htmlBody = Buffer.from(part.body.data, "base64").toString("utf8");
          }
          if (part.parts) {
            extractBodies(part.parts);
          }
        }
      };

      // Handle single-part messages
      if (msgRes.data.payload?.mimeType === "text/plain" && msgRes.data.payload?.body?.data) {
        plainTextBody = Buffer.from(msgRes.data.payload.body.data, "base64").toString("utf8");
      } else if (msgRes.data.payload?.mimeType === "text/html" && msgRes.data.payload?.body?.data) {
        htmlBody = Buffer.from(msgRes.data.payload.body.data, "base64").toString("utf8");
      } else if (msgRes.data.payload?.parts) {
        extractBodies(msgRes.data.payload.parts);
      }

      // Prefer plain text; if only HTML available, convert it
      let body: string;
      if (plainTextBody.trim()) {
        body = plainTextBody.trim();
      } else if (htmlBody.trim()) {
        body = stripHtmlToText(htmlBody);
      } else {
        body = "";
      }

      // ─── Detect PDF attachments ────────────────────────────────────────
      const pdfAttachments: ScannedEmail["pdfAttachments"] = [];
      const collectAttachments = (parts: PayloadParts): void => {
        if (!parts) return;
        for (const part of parts) {
          const isPdf =
            (part.filename && part.filename.toLowerCase().endsWith(".pdf")) ||
            part.mimeType === "application/pdf";
          if (isPdf && part.body?.attachmentId) {
            pdfAttachments.push({
              filename: part.filename || "attachment.pdf",
              attachmentId: part.body.attachmentId,
              size: part.body.size ?? 0,
            });
          }
          if (part.parts) collectAttachments(part.parts);
        }
      };
      if (msgRes.data.payload?.parts) {
        collectAttachments(msgRes.data.payload.parts);
      }

      emails.push({
        messageId: msg.id,
        subject,
        from,
        date: new Date(dateStr),
        body: body.slice(0, 5000), // Limit body size for AI
        hasAttachment: pdfAttachments.length > 0,
        pdfAttachments,
      });
    } catch (err) {
      console.error(`[Gmail] Failed to parse message ${msg.id}:`, err);
    }
  }

  return emails;
}

// ─── PDF attachment download and analysis ────────────────────────────────────

/**
 * Download a PDF attachment from Gmail and upload it to S3 for AI analysis.
 * Returns the S3 URL of the uploaded PDF.
 */
async function downloadAndUploadPdfAttachment(
  userId: number,
  messageId: string,
  attachmentId: string,
  filename: string
): Promise<string | null> {
  try {
    const auth = await getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: "v1", auth });

    const attachRes = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = attachRes.data.data;
    if (!data) return null;

    // Gmail returns base64url-encoded data
    const pdfBuffer = Buffer.from(data, "base64");

    // Skip very large files (>10MB)
    if (pdfBuffer.length > 10 * 1024 * 1024) {
      console.log(`[Gmail] Skipping large PDF (${pdfBuffer.length} bytes): ${filename}`);
      return null;
    }

    // Upload to S3 with a unique key
    const suffix = crypto.randomBytes(4).toString("hex");
    const fileKey = `gmail-invoices/${userId}/${messageId}-${suffix}-${filename}`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

    return url;
  } catch (err) {
    console.error(`[Gmail] Failed to download PDF attachment:`, err);
    return null;
  }
}

async function extractTextFromPdf(pdfUrl: string, fileKey?: string): Promise<string> {
  try {
    if (fileKey) {
      const buffer = await storageRead(fileKey);
      if (buffer) {
        const base64 = buffer.toString("base64");
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "אתה מומחה לקריאת מסמכי PDF בעברית ובאנגלית. חלץ את כל הטקסט הרלוונטי מהמסמך. התמקד בפרטים כמו: שם ספק, סכום לתשלום, תאריכים, מספר חשבונית, פירוט שירותים/מוצרים. החזר טקסט נקי בלבד.",
            },
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: `data:application/pdf;base64,${base64}`,
                  },
                },
                {
                  type: "text",
                  text: "חלץ את כל הטקסט הרלוונטי מהחשבונית/קבלה הזו. כלול: שם ספק, סכום, תאריך, מספר חשבונית, פירוט פריטים.",
                },
              ],
            },
          ],
        });

        const content = response.choices?.[0]?.message?.content;
        if (typeof content === "string") return content;
      }
    }

    return "";
  } catch (err) {
    console.error("[Gmail] PDF text extraction failed:", err);
    return "";
  }
}

// ─── AI invoice extraction ────────────────────────────────────────────────────

interface ExtractedInvoice {
  provider: string;
  category: "תקשורת" | "חשמל" | "מים" | "ארנונה" | "ביטוח" | "בנק" | "רכב" | "אחר";
  amount: number | null;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  status: "pending" | "paid" | "overdue" | "unknown";
  description: string;
  invoiceNumber: string | null;
  items: Array<{ name: string; amount: number | null }>;
}

async function extractInvoiceData(
  subject: string,
  from: string,
  body: string,
  pdfText: string | null,
  detectedProvider: { name: string; category: string } | null
): Promise<ExtractedInvoice | null> {
  try {
    // Combine email body and PDF text for comprehensive extraction
    let contentForAnalysis = `גוף המייל:\n${body}`;
    if (pdfText) {
      contentForAnalysis += `\n\n--- תוכן קובץ PDF מצורף ---\n${pdfText.slice(0, 4000)}`;
    }

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `אתה מומחה לחילוץ נתוני חשבוניות ממיילים ומסמכי PDF בישראל.
חלץ את המידע הבא ותחזיר JSON בלבד (ללא הסברים):

- provider: שם הספק/חברה (עברית אם אפשר, אחרת אנגלית)
- category: קטגוריה (תקשורת/חשמל/מים/ארנונה/ביטוח/בנק/רכב/אחר)
- amount: סכום כולל לתשלום (מספר בלבד, null אם לא נמצא). חפש מילים כמו "סה"כ", "total", "סכום לתשלום", "amount due"
- currency: מטבע (ILS/USD/EUR). ברירת מחדל ILS אם לא צוין
- invoiceDate: תאריך החשבונית/קבלה (YYYY-MM-DD, null אם לא נמצא)
- dueDate: מועד תשלום אחרון (YYYY-MM-DD, null אם לא נמצא)
- status: סטטוס - "paid" אם כתוב "שולם"/"paid"/"receipt"/"קבלה"/"אישור תשלום", "pending" אם כתוב "לתשלום"/"due", "unknown" אם לא ברור
- description: תיאור קצר ומובן של החשבונית (עברית, עד 120 תווים). כלול מה השירות/מוצר
- invoiceNumber: מספר חשבונית/קבלה (null אם לא נמצא)
- items: רשימת פריטים/שירותים בחשבונית. כל פריט: { name: שם, amount: סכום או null }. רשימה ריקה אם אין פירוט

טיפים:
- אם המייל הוא HTML שהומר לטקסט, התעלם מתגיות שנותרו
- חפש סכומים ליד סימני ₪, ש"ח, NIS, $, €
- אם יש גם גוף מייל וגם PDF, העדף את הנתונים מה-PDF כי הם מדויקים יותר
- אם לא ניתן לזהות שום מידע רלוונטי, החזר provider="לא ידוע" עם description שמתאר מה יש במייל`,
        },
        {
          role: "user",
          content: `מייל לניתוח:
שולח: ${from}
נושא: ${subject}
ספק שזוהה אוטומטית: ${detectedProvider?.name ?? "לא זוהה"}
קטגוריה שזוהתה: ${detectedProvider?.category ?? "לא ידוע"}

${contentForAnalysis}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "invoice_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              provider: { type: "string" },
              category: {
                type: "string",
                enum: ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"],
              },
              amount: { type: ["number", "null"] },
              currency: { type: "string" },
              invoiceDate: { type: ["string", "null"] },
              dueDate: { type: ["string", "null"] },
              status: { type: "string", enum: ["pending", "paid", "overdue", "unknown"] },
              description: { type: "string" },
              invoiceNumber: { type: ["string", "null"] },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    amount: { type: ["number", "null"] },
                  },
                  required: ["name", "amount"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "provider", "category", "amount", "currency",
              "invoiceDate", "dueDate", "status", "description",
              "invoiceNumber", "items",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") return null;
    return JSON.parse(rawContent) as ExtractedInvoice;
  } catch (err) {
    console.error("[Gmail] AI extraction failed:", err);
    return null;
  }
}

// ─── Main scan function ───────────────────────────────────────────────────────

export interface ScanResult {
  scanned: number;
  found: number;
  saved: number;
  invoices: Array<{
    provider: string;
    amount: number | null;
    category: string;
    date: string | null;
    subject: string;
    description: string;
  }>;
}

export async function scanGmailForInvoices(
  userId: number,
  daysBack: number = 7
): Promise<ScanResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const emails = await fetchRecentEmails(userId, daysBack);

  let found = 0;
  let saved = 0;
  const invoices: ScanResult["invoices"] = [];

  for (const email of emails) {
    // Check for existing invoice (avoid duplicates)
    const existing = await db
      .select({ id: smartInvoices.id })
      .from(smartInvoices)
      .where(
        and(
          eq(smartInvoices.userId, userId),
          eq(smartInvoices.gmailMessageId, email.messageId)
        )
      )
      .limit(1);

    if (existing.length > 0) continue;

    // Filter: must look like an invoice
    if (!isInvoiceEmail(email.subject, email.body)) continue;

    // Detect provider
    const detectedProvider = detectProvider(email.subject, email.from, email.body);

    found++;

    // ─── Handle PDF attachments ──────────────────────────────────────────
    let pdfText: string | null = null;
    let pdfUrl: string | null = null;

    if (email.pdfAttachments.length > 0) {
      // Process the first PDF attachment (most likely the invoice)
      const firstPdf = email.pdfAttachments[0];
      console.log(`[Gmail] Processing PDF attachment: ${firstPdf.filename} (${firstPdf.size} bytes)`);

      pdfUrl = await downloadAndUploadPdfAttachment(
        userId,
        email.messageId,
        firstPdf.attachmentId,
        firstPdf.filename
      );

      if (pdfUrl) {
        const fileKey = `gmail-invoices/${userId}/${email.messageId}-${firstPdf.filename}`;
        pdfText = await extractTextFromPdf(pdfUrl, fileKey);
        console.log(`[Gmail] Extracted ${pdfText.length} chars from PDF: ${firstPdf.filename}`);
      }
    }

    // Extract invoice data with AI (using both email body and PDF text)
    const extracted = await extractInvoiceData(
      email.subject,
      email.from,
      email.body,
      pdfText,
      detectedProvider
    );

    const provider = extracted?.provider ?? detectedProvider?.name ?? "ספק לא ידוע";
    const category = extracted?.category ?? detectedProvider?.category ?? "אחר";
    const description = extracted?.description ?? email.subject;

    // Save to database — encrypt sensitive fields before storage
    const extractedDataObj = {
      ...(extracted ?? {}),
      pdfUrl: pdfUrl ?? undefined,
      pdfFilename: email.pdfAttachments[0]?.filename ?? undefined,
      fromEmail: email.from,
    };
    await db.insert(smartInvoices).values({
      userId,
      gmailMessageId: email.messageId,
      provider,
      category: category as "תקשורת" | "חשמל" | "מים" | "ארנונה" | "ביטוח" | "בנק" | "רכב" | "אחר",
      amount: extracted?.amount?.toString() ?? null,
      invoiceDate: extracted?.invoiceDate ? new Date(extracted.invoiceDate) : email.date,
      dueDate: extracted?.dueDate ? new Date(extracted.dueDate) : null,
      status: (extracted?.status ?? "unknown") as "pending" | "paid" | "overdue" | "unknown",
      subject: encryptField(email.subject),
      rawText: encryptField(email.body.slice(0, 2000)),
      extractedData: encryptJson(extractedDataObj) as any,
      parsed: extracted !== null,
    });

    saved++;
    invoices.push({
      provider,
      amount: extracted?.amount ?? null,
      category,
      date: extracted?.invoiceDate ?? null,
      subject: email.subject,
      description,
    });
  }

  // Update last sync timestamp
  await db
    .update(gmailConnections)
    .set({ lastSyncedAt: new Date(), lastSyncCount: saved })
    .where(eq(gmailConnections.userId, userId));

  return { scanned: emails.length, found, saved, invoices };
}

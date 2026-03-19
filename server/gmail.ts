/**
 * Gmail Integration Service
 * Handles OAuth2 flow, token encryption/decryption, email scanning,
 * HTML-to-text conversion, PDF attachment extraction, and AI-powered
 * invoice data extraction.
 */

import { google } from "googleapis";
import crypto from "crypto";
import { getDb } from "./db";
import { gmailConnections, smartInvoices, categoryMappings } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { convert as htmlToText } from "html-to-text";
import { storagePut, storageRead, sanitizeFilename } from "./storage";
import { encryptField, decryptField, encryptJson } from "./encryption";
import { ENV } from "./_core/env";

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
  const encryptedAccess = encryptField(accessToken);
  const encryptedRefresh = encryptField(refreshToken);

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select({ id: gmailConnections.id })
    .from(gmailConnections)
    .where(and(eq(gmailConnections.userId, userId), eq(gmailConnections.email, email)))
    .limit(1);

  if (existing) {
    await db
      .update(gmailConnections)
      .set({
        accessToken: encryptedAccess,
        refreshToken: encryptedRefresh,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(gmailConnections.id, existing.id));
  } else {
    await db.insert(gmailConnections).values({
      userId,
      accessToken: encryptedAccess,
      refreshToken: encryptedRefresh,
      email,
      expiresAt,
    });
  }
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

export async function getAllGmailConnections(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.userId, userId));
}

export async function getGmailConnectionById(connectionId: number) {
  const db = await getDb();
  if (!db) return null;
  const [conn] = await db
    .select()
    .from(gmailConnections)
    .where(eq(gmailConnections.id, connectionId))
    .limit(1);
  return conn ?? null;
}

export async function disconnectGmail(connectionId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(gmailConnections)
    .where(and(eq(gmailConnections.id, connectionId), eq(gmailConnections.userId, userId)));
}

// ─── OAuth2 client with stored tokens ────────────────────────────────────────

async function getAuthenticatedClient(connectionId: number) {
  const conn = await getGmailConnectionById(connectionId);
  if (!conn) throw new Error("Gmail connection not found");

  const accessToken = decryptField(conn.accessToken);
  const refreshToken = decryptField(conn.refreshToken);

  const oauth2Client = createOAuth2Client("");
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: conn.expiresAt?.getTime(),
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      const encryptedAccess = encryptField(tokens.access_token);
      const refreshDb = await getDb();
      if (refreshDb) {
        await refreshDb
          .update(gmailConnections)
          .set({
            accessToken: encryptedAccess,
            expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
          })
          .where(eq(gmailConnections.id, connectionId));
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

function extractSenderName(from: string): string | null {
  const displayNameMatch = from.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  if (displayNameMatch) {
    const name = displayNameMatch[1].trim();
    if (name.length > 0) return name;
  }

  const domainMatch = from.match(/@([^.>]+)\./);
  if (domainMatch) {
    const domain = domainMatch[1];
    if (domain && !["gmail", "yahoo", "hotmail", "outlook", "walla", "nana"].includes(domain.toLowerCase())) {
      return domain;
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
  connectionId: number,
  daysBack: number = 7
): Promise<ScannedEmail[]> {
  const auth = await getAuthenticatedClient(connectionId);
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

      const pdfAttachments: ScannedEmail["pdfAttachments"] = [];
      const collectAttachments = (parts: PayloadParts): void => {
        if (!parts) return;
        for (const part of parts) {
          const isPdf =
            (part.filename && part.filename.toLowerCase().endsWith(".pdf")) ||
            (part.mimeType === "application/pdf" && part.filename);
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
      const topPayload = msgRes.data.payload;
      if (
        pdfAttachments.length === 0 &&
        topPayload?.filename?.toLowerCase().endsWith(".pdf") &&
        topPayload.body?.attachmentId
      ) {
        pdfAttachments.push({
          filename: topPayload.filename,
          attachmentId: topPayload.body.attachmentId,
          size: topPayload.body.size ?? 0,
        });
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
  connectionId: number,
  userId: number,
  messageId: string,
  attachmentId: string,
  filename: string
): Promise<string | null> {
  try {
    const auth = await getAuthenticatedClient(connectionId);
    const gmail = google.gmail({ version: "v1", auth });

    const attachRes = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = attachRes.data.data;
    if (!data) return null;

    const pdfBuffer = Buffer.from(data, "base64");

    if (pdfBuffer.length > 10 * 1024 * 1024) {
      console.log(`[Gmail] Skipping large PDF (${pdfBuffer.length} bytes): ${filename}`);
      return null;
    }

    const suffix = crypto.randomBytes(4).toString("hex");
    const safeName = sanitizeFilename(filename);
    const fileKey = `gmail-invoices/${userId}/${messageId}-${suffix}-${safeName}`;
    const { url } = await storagePut(fileKey, pdfBuffer, "application/pdf");

    console.log(`[Gmail] PDF stored: key=${fileKey}, url=${url}, size=${pdfBuffer.length}`);
    return url;
  } catch (err) {
    console.error(`[Gmail] Failed to download PDF attachment:`, err);
    return null;
  }
}

async function extractTextFromPdf(pdfUrl: string, fileKey?: string): Promise<string> {
  try {
    if (!fileKey) {
      console.log("[Gmail] No fileKey for PDF text extraction, skipping");
      return "";
    }

    const buffer = await storageRead(fileKey);
    if (!buffer) {
      console.log(`[Gmail] PDF file not found in storage: ${fileKey}`);
      return "";
    }

    console.log(`[Gmail] Extracting text from PDF: ${fileKey} (${buffer.length} bytes)`);
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
              type: "image_url" as const,
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

    const rawContent = response.choices?.[0]?.message?.content;
    let text = "";
    if (typeof rawContent === "string") {
      text = rawContent;
    } else if (Array.isArray(rawContent)) {
      text = rawContent
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n");
    }

    console.log(`[Gmail] PDF text extraction result: ${text.length} chars`);
    return text;
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
- amount: סכום כולל לתשלום (מספר בלבד, null אם לא נמצא). חפש מילים כמו "סה"כ", "total", "סכום לתשלום", "amount due", "סה״כ שולם", "יתרה לתשלום", "סך הכל", "לתשלום", "חיוב"
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
    let jsonStr: string | null = null;
    if (typeof rawContent === "string") {
      jsonStr = rawContent;
    } else if (Array.isArray(rawContent)) {
      jsonStr = rawContent
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
    }
    if (!jsonStr) {
      console.log("[Gmail] extractInvoiceData: no content from LLM");
      return null;
    }
    const parsed = JSON.parse(jsonStr) as ExtractedInvoice;
    console.log(`[Gmail] extractInvoiceData result: provider=${parsed.provider}, amount=${parsed.amount}, currency=${parsed.currency}, status=${parsed.status}`);
    return parsed;
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

  const connections = await getAllGmailConnections(userId);
  if (connections.length === 0) throw new Error("No Gmail accounts connected");

  let totalScanned = 0;
  let found = 0;
  let saved = 0;
  const invoices: ScanResult["invoices"] = [];

  for (const conn of connections) {
    let connSaved = 0;

    const emails = await fetchRecentEmails(conn.id, daysBack);
    totalScanned += emails.length;

    for (const email of emails) {
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

      if (!isInvoiceEmail(email.subject, email.body)) continue;

      const detectedProvider = detectProvider(email.subject, email.from, email.body);

      found++;

      let pdfText: string | null = null;
      let pdfUrl: string | null = null;

      console.log(`[Gmail] Email "${email.subject}" from "${email.from}" — ${email.pdfAttachments.length} PDF attachment(s)`);

      if (email.pdfAttachments.length > 0) {
        const firstPdf = email.pdfAttachments[0];
        console.log(`[Gmail] Downloading PDF: ${firstPdf.filename} (${firstPdf.size} bytes, attachmentId=${firstPdf.attachmentId})`);

        pdfUrl = await downloadAndUploadPdfAttachment(
          conn.id,
          userId,
          email.messageId,
          firstPdf.attachmentId,
          firstPdf.filename
        );

        if (pdfUrl) {
          const fileKey = pdfUrl.replace(/^\/api\/files\//, "");
          pdfText = await extractTextFromPdf(pdfUrl, fileKey);
          console.log(`[Gmail] Extracted ${pdfText.length} chars from PDF: ${firstPdf.filename}`);
        } else {
          console.log(`[Gmail] PDF download failed for: ${firstPdf.filename}`);
        }
      }

      const extracted = await extractInvoiceData(
        email.subject,
        email.from,
        email.body,
        pdfText,
        detectedProvider
      );

      const llmProvider = extracted?.provider && extracted.provider !== "לא ידוע" ? extracted.provider : null;
      const provider = llmProvider ?? detectedProvider?.name ?? extractSenderName(email.from) ?? "ספק לא ידוע";
      const category = extracted?.category ?? detectedProvider?.category ?? "אחר";
      const description = extracted?.description ?? email.subject;

      let customCategory: string | null = null;
      const normalizedProvider = provider.trim().toLowerCase();
      const [mapping] = await db
        .select({ customCategory: categoryMappings.customCategory })
        .from(categoryMappings)
        .where(
          and(
            eq(categoryMappings.userId, userId),
            eq(categoryMappings.providerPattern, normalizedProvider)
          )
        )
        .limit(1);
      if (mapping) {
        customCategory = mapping.customCategory;
        console.log(`[Gmail] Applied category mapping for "${provider}": "${customCategory}"`);
      }

      const extractedDataObj = {
        ...(extracted ?? {}),
        pdfUrl: pdfUrl ?? undefined,
        pdfFilename: email.pdfAttachments[0]?.filename ?? undefined,
        fromEmail: email.from,
      };

      console.log(`[Gmail] Saving invoice: provider=${provider}, category=${category}, customCategory=${customCategory ?? "none"}, amount=${extracted?.amount ?? "null"}, pdfUrl=${pdfUrl ? "YES" : "NO"}, pdfText=${pdfText ? `${pdfText.length} chars` : "NO"}`);

      await db.insert(smartInvoices).values({
        userId,
        gmailConnectionId: conn.id,
        sourceEmail: conn.email ?? null,
        gmailMessageId: email.messageId,
        provider,
        category: category as "תקשורת" | "חשמל" | "מים" | "ארנונה" | "ביטוח" | "בנק" | "רכב" | "אחר",
        customCategory,
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
      connSaved++;
      invoices.push({
        provider,
        amount: extracted?.amount ?? null,
        category,
        date: extracted?.invoiceDate ?? null,
        subject: email.subject,
        description,
      });
    }

    await db
      .update(gmailConnections)
      .set({ lastSyncedAt: new Date(), lastSyncCount: connSaved })
      .where(eq(gmailConnections.id, conn.id));
  }

  return { scanned: totalScanned, found, saved, invoices };
}

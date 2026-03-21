/**
 * Gmail Integration Service
 * Handles OAuth2 flow, token encryption/decryption, email scanning,
 * HTML-to-text conversion, PDF attachment extraction, and AI-powered
 * invoice data extraction.
 */

import { google } from "googleapis";
import crypto from "crypto";
import { nanoid } from "nanoid";
import { createAnalysis, getDb, getUserProfile } from "./db";
import { gmailConnections, smartInvoices, categoryMappings, insuranceArtifacts } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";
import { convert as htmlToText } from "html-to-text";
import { generateSignedFileUrl, storagePut, storageRead, sanitizeFilename } from "./storage";
import { decryptJson, encryptField, decryptField, encryptJson } from "./encryption";
import { ENV } from "./_core/env";
import { extractInsuranceDiscoveryData, inferInsuranceArtifactType, inferInsuranceCategoryFromText, looksLikeInsuranceMessage, looksLikeInsurancePdfCandidate } from "./gmailInsuranceDiscovery";
import { policyAnalysisWorker } from "./policyAnalysisWorker";

// ─── User email scan filter sanitization ─────────────────────────────────────

const GMAIL_OPERATOR_PATTERN = /\b(?:from|to|subject|has|in|is|before|after|older|newer|label|filename|cc|bcc|larger|smaller|category|rfc822msgid|list|OR|AND|NOT)\s*:/gi;

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|context)/i,
  /\bsystem\s*:/i,
  /\bassistant\s*:/i,
  /\buser\s*:/i,
  /\brole\s*:/i,
  /\bprompt\s*:/i,
  /```/,
  /<\/?[a-z]+>/i,
  /\{[{%]/,
];

export function sanitizeEmailScanFilter(raw: string, maxLength = 500): string {
  let sanitized = raw.slice(0, maxLength);
  sanitized = sanitized.replace(GMAIL_OPERATOR_PATTERN, "");
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }
  sanitized = sanitized
    .replace(/[{}[\]<>\\|`~^]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized;
}

export function parseEmailScanList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((entry) => sanitizeEmailScanFilter(entry.trim(), 120))
    .filter((entry) => entry.length >= 2);
}

export interface EmailScanFilters {
  senders: string[];
  keywords: string[];
}

function buildUserGmailFilterClause(filters: EmailScanFilters): string {
  const parts: string[] = [];
  for (const sender of filters.senders) {
    if (sender.includes("@") || sender.includes(".")) {
      parts.push(`from:${sender}`);
    } else {
      parts.push(`from:${sender}`);
    }
  }
  for (const kw of filters.keywords) {
    parts.push(`"${kw}"`);
  }
  return parts.length > 0 ? ` OR ${parts.join(" OR ")}` : "";
}

function buildUserFilterContextForLLM(filters: EmailScanFilters): string {
  const parts: string[] = [];
  if (filters.senders.length > 0) {
    parts.push(`נמענים/שולחים שהמשתמש הגדיר כביטוחיים: ${filters.senders.join(", ")}`);
  }
  if (filters.keywords.length > 0) {
    parts.push(`מילות מפתח ביטוחיות שהמשתמש הגדיר: ${filters.keywords.join(", ")}`);
  }
  return parts.join("\n");
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
  { name: "מנורה מבטחים", category: "ביטוח", keywords: ["מנורה מבטחים", "מנורה"], domains: ["menora.co.il"] },
  { name: "הפניקס", category: "ביטוח", keywords: ["הפניקס", "phoenix"], domains: ["phoenix.co.il", "fnx.co.il"] },
  { name: "מגדל", category: "ביטוח", keywords: ["מגדל ביטוח", "מגדל"], domains: ["migdal.co.il"] },
  { name: "כלל ביטוח", category: "ביטוח", keywords: ["כלל ביטוח"], domains: ["clal.co.il", "clalbit.co.il"] },
  { name: "הראל", category: "ביטוח", keywords: ["הראל ביטוח", "הראל"], domains: ["harel-group.co.il", "harel.co.il"] },
  { name: "איילון", category: "ביטוח", keywords: ["איילון ביטוח", "איילון"], domains: ["ayalon-ins.co.il", "ayalon.co.il"] },
  { name: "שירביט", category: "ביטוח", keywords: ["שירביט"], domains: ["shirbit.co.il"] },
  { name: "הכשרה", category: "ביטוח", keywords: ["הכשרה ביטוח", "הכשרה"], domains: ["hachshara.co.il", "hachsharainsurance.co.il"] },
  { name: "ביטוח ישיר", category: "ביטוח", keywords: ["ביטוח ישיר"], domains: ["bituachyashir.co.il", "bit-y.co.il"] },
  { name: "AIG ישראל", category: "ביטוח", keywords: ["aig ישראל", "aig israel"], domains: ["aig.co.il"] },
  { name: "שומרה", category: "ביטוח", keywords: ["שומרה ביטוח", "שומרה"], domains: ["shmera.co.il", "shomera.co.il"] },
  { name: "ליברה", category: "ביטוח", keywords: ["ליברה ביטוח", "ליברה"], domains: ["libra-insurance.co.il", "libra.co.il"] },
  { name: "9 ביטוח", category: "ביטוח", keywords: ["9 ביטוח"], domains: ["9ins.co.il"] },
  { name: "RAC", category: "ביטוח", keywords: ["rac ביטוח"], domains: ["rac.co.il"] },
  { name: "פספורטכארד", category: "ביטוח", keywords: ["פספורטכארד", "passportcard"], domains: ["passportcard.co.il"] },
  { name: "דיקלה", category: "ביטוח", keywords: ["דיקלה ביטוח", "דיקלה"], domains: ["dikla.co.il"] },
  { name: "שלמה ביטוח", category: "ביטוח", keywords: ["שלמה ביטוח"], domains: ["shlomo-ins.co.il"] },
  { name: "כלל בריאות", category: "ביטוח", keywords: ["כלל בריאות"], domains: ["clalhealth.co.il"] },
  { name: "מכבי שירותי בריאות", category: "ביטוח", keywords: ["מכבי שירותי בריאות"], domains: ["maccabi4u.co.il", "maccabi.co.il"] },
  { name: "כללית", category: "ביטוח", keywords: ["כללית שירותי בריאות"], domains: ["clalit.co.il"] },
  { name: "מאוחדת", category: "ביטוח", keywords: ["מאוחדת"], domains: ["meuhedet.co.il"] },
  { name: "לאומית", category: "ביטוח", keywords: ["לאומית שירותי בריאות"], domains: ["leumit.co.il"] },
  { name: "ווישור", category: "ביטוח", keywords: ["ווישור", "wesure", "we4sure"], domains: ["wesure.co.il", "we4sure.co.il"] },
  { name: "פסגות", category: "ביטוח", keywords: ["פסגות ביטוח"], domains: ["psagot.co.il"] },
  { name: "אלטשולר שחם", category: "ביטוח", keywords: ["אלטשולר שחם"], domains: ["as-invest.co.il"] },
  { name: "תמורה", category: "ביטוח", keywords: ["תמורה ביטוח"], domains: ["tmura.co.il"] },
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
  "your receipt", "payment confirmation", "order confirmation", "credit note",
  "tax invoice", "invoice receipt", "הקבלה שלך", "אישור הזמנה", "פירוט חיוב", "זיכוי",
];

export type InvoiceFlowDirection = "expense" | "income" | "unknown";
type InvoiceDocumentType = "invoice" | "receipt" | "credit_note" | "order_confirmation" | "unknown";
type InvoiceCounterpartyRole = "supplier" | "customer" | "unknown";

interface BusinessIdentityContext {
  businessName: string | null;
  businessTaxId: string | null;
  businessEmailDomains: string[];
}

function normalizeBusinessValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function parseBusinessEmailDomains(value: string | null | undefined): string[] {
  const normalized = (value ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => {
      if (entry.includes("@")) {
        const domain = entry.split("@").pop();
        return domain ? domain.replace(/^@/, "") : "";
      }
      return entry.replace(/^@/, "");
    })
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function getBusinessIdentityContext(profile: {
  businessName?: string | null;
  businessTaxId?: string | null;
  businessEmailDomains?: string | null;
} | null | undefined): BusinessIdentityContext {
  return {
    businessName: normalizeBusinessValue(profile?.businessName),
    businessTaxId: normalizeBusinessValue(profile?.businessTaxId),
    businessEmailDomains: parseBusinessEmailDomains(profile?.businessEmailDomains),
  };
}

function extractEmailDomain(value: string): string | null {
  const match = value.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  return match?.[1]?.replace(/>$/, "") ?? null;
}

function domainMatchesBusiness(domain: string | null, businessDomains: string[]): boolean {
  if (!domain) return false;
  return businessDomains.some((businessDomain) => domain === businessDomain || domain.endsWith(`.${businessDomain}`));
}

function buildBusinessContextSnippet(context: BusinessIdentityContext): string {
  return [
    `שם העסק של המשתמש: ${context.businessName ?? "לא סופק"}`,
    `מספר מזהה עסקי: ${context.businessTaxId ?? "לא סופק"}`,
    `דומיינים או מיילים עסקיים: ${context.businessEmailDomains.length > 0 ? context.businessEmailDomains.join(", ") : "לא סופקו"}`,
  ].join("\n");
}

function normalizeFlowDirection(value: unknown): InvoiceFlowDirection {
  return value === "expense" || value === "income" || value === "unknown" ? value : "unknown";
}

function normalizeDocumentType(value: unknown): InvoiceDocumentType {
  return value === "invoice" || value === "receipt" || value === "credit_note" || value === "order_confirmation" || value === "unknown"
    ? value
    : "unknown";
}

function normalizeCounterpartyRole(value: unknown): InvoiceCounterpartyRole {
  return value === "supplier" || value === "customer" || value === "unknown" ? value : "unknown";
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function matchesBusinessIdentity(value: string | null | undefined, context: BusinessIdentityContext): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return false;
  if (context.businessName && normalized.includes(context.businessName.toLowerCase())) return true;
  if (context.businessTaxId && normalized.includes(context.businessTaxId.toLowerCase())) return true;
  return false;
}

function inferFlowDirectionFallback(from: string, context: BusinessIdentityContext): InvoiceFlowDirection {
  const senderDomain = extractEmailDomain(from);
  if (domainMatchesBusiness(senderDomain, context.businessEmailDomains)) {
    return "income";
  }
  return "unknown";
}

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
  /** Action links extracted from the HTML body */
  actionLinks: EmailActionLink[];
  /** Whether the email has PDF attachments */
  hasAttachment: boolean;
  /** PDF attachment info for download */
  pdfAttachments: Array<{
    filename: string;
    attachmentId: string;
    size: number;
  }>;
}

type EmailActionLink = {
  url: string;
  text: string;
  likelyDocument: boolean;
  requiresLogin: boolean;
};

const ACTION_LINK_LOGIN_PATTERNS = [
  /התחבר/,
  /כניסה/,
  /אזור אישי/,
  /איזור אישי/,
  /\blog(?:in|on)\b/i,
  /\bsign[ -]?in\b/i,
  /\baccount\b/i,
  /\bauth\b/i,
];

const ACTION_LINK_DOCUMENT_PATTERNS = [
  /לצפייה/,
  /צפיי/,
  /מסמך/,
  /מסמכים/,
  /פוליס/,
  /קובץ/,
  /pdf/i,
  /policy/i,
  /document/i,
  /download/i,
  /statement/i,
  /schedule/i,
  /certificate/i,
];

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function isSafeEmailActionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeActionLinkText(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractEmailActionLinks(html: string): EmailActionLink[] {
  if (!html.trim()) return [];

  const links: EmailActionLink[] = [];
  const seenUrls = new Set<string>();
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const innerHtml = match[2] ?? "";
    const hrefMatch = attrs.match(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const rawHref = decodeHtmlEntities(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "").trim();
    if (!rawHref || !isSafeEmailActionUrl(rawHref) || seenUrls.has(rawHref)) continue;

    const text = normalizeActionLinkText(innerHtml);
    const combinedSignalText = `${text} ${rawHref}`;
    const likelyDocument = ACTION_LINK_DOCUMENT_PATTERNS.some((pattern) => pattern.test(combinedSignalText));
    const requiresLogin = ACTION_LINK_LOGIN_PATTERNS.some((pattern) => pattern.test(combinedSignalText));

    links.push({
      url: rawHref,
      text: text || "פתח קישור",
      likelyDocument: likelyDocument || /\.pdf(?:[?#].*)?$/i.test(rawHref),
      requiresLogin,
    });
    seenUrls.add(rawHref);
  }

  return links;
}

export function pickPrimaryInsuranceActionLink(links: EmailActionLink[]): EmailActionLink | null {
  if (links.length === 0) return null;

  return [...links]
    .filter((link) => link.likelyDocument || link.requiresLogin)
    .sort((a, b) => {
      const score = (link: EmailActionLink) =>
        (link.likelyDocument ? 4 : 0)
        + (link.requiresLogin ? 2 : 0)
        + (/\.pdf(?:[?#].*)?$/i.test(link.url) ? 3 : 0);
      return score(b) - score(a);
    })[0] ?? null;
}

async function fetchRecentEmails(
  connectionId: number,
  daysBack: number = 7,
  userFilters?: EmailScanFilters
): Promise<ScannedEmail[]> {
  const auth = await getAuthenticatedClient(connectionId);
  const gmail = google.gmail({ version: "v1", auth });

  const after = Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000);
  const userFilterClause = userFilters ? buildUserGmailFilterClause(userFilters) : "";
  const query = `after:${after} (חשבונית OR חשבון OR קבלה OR invoice OR bill OR payment OR חיוב OR לתשלום OR receipt OR זיכוי OR "credit note" OR הקבלה OR ביטוח OR פוליסה OR פרמיה OR חידוש OR כיסוי OR insurance OR policy OR premium OR renewal OR claim OR has:attachment filename:pdf${userFilterClause})`;

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
      let actionLinks: EmailActionLink[] = [];

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

      if (htmlBody.trim()) {
        actionLinks = extractEmailActionLinks(htmlBody);
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
        actionLinks,
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
    const pdfBuffer = await downloadPdfAttachmentBuffer(connectionId, messageId, attachmentId);
    if (!pdfBuffer) return null;

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

async function downloadPdfAttachmentBuffer(
  connectionId: number,
  messageId: string,
  attachmentId: string
): Promise<Buffer | null> {
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
    return Buffer.from(data, "base64");
  } catch (err) {
    console.error(`[Gmail] Failed to fetch PDF attachment buffer:`, err);
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
          content: "אתה מומחה לקריאת מסמכים פיננסיים בעברית ובאנגלית. חלץ את כל הטקסט הרלוונטי מהמסמך. התמקד בפרטים כמו שמות הצדדים, סכום מרכזי, תאריכים, מספר מסמך, פירוט שירותים או מוצרים. החזר טקסט נקי בלבד.",
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
              text: "חלץ את כל הטקסט הרלוונטי מהמסמך הכספי הזה. כלול שמות צדדים, סכום, תאריך, מספר מסמך ופירוט פריטים.",
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
  issuerName: string | null;
  recipientName: string | null;
  category: "תקשורת" | "חשמל" | "מים" | "ארנונה" | "ביטוח" | "בנק" | "רכב" | "אחר";
  amount: number | null;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  status: "pending" | "paid" | "overdue" | "unknown";
  flowDirection: InvoiceFlowDirection;
  documentType: InvoiceDocumentType;
  counterpartyRole: InvoiceCounterpartyRole;
  classificationReason: string;
  confidence: number;
  description: string;
  invoiceNumber: string | null;
  items: Array<{ name: string; amount: number | null }>;
}

async function extractInvoiceData(
  subject: string,
  from: string,
  body: string,
  pdfText: string | null,
  detectedProvider: { name: string; category: string } | null,
  businessContext: BusinessIdentityContext
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
          content: `אתה מומחה לחילוץ נתונים ממסמכים פיננסיים ממיילים ומסמכי PDF בישראל.
מסמך שקשור לעסק של המשתמש לא בהכרח מייצג הוצאה. הוא יכול להיות גם הכנסה.

הקשר עסקי של המשתמש:
${buildBusinessContextSnippet(businessContext)}

חלץ את המידע הבא ותחזיר JSON בלבד (ללא הסברים):

- provider: שם הצד השני לעסק של המשתמש. אם flowDirection הוא expense זה בדרך כלל הספק. אם flowDirection הוא income זה בדרך כלל הלקוח/המשלם. אם לא ברור, החזר את הגוף החיצוני המרכזי ביותר במסמך
- issuerName: מי הנפיק את המסמך
- recipientName: למי המסמך מופנה
- category: קטגוריה (תקשורת/חשמל/מים/ארנונה/ביטוח/בנק/רכב/אחר)
- amount: הסכום המרכזי במסמך (מספר בלבד, null אם לא נמצא). זה יכול להיות סכום שהעסק צריך לשלם או סכום שהעסק אמור לקבל. חפש מילים כמו "סה\"כ", "total", "סכום לתשלום", "amount due", "סה״כ שולם", "יתרה לתשלום", "סך הכל", "לתשלום", "חיוב", "payment received", "שולם"
- currency: מטבע (ILS/USD/EUR). ברירת מחדל ILS אם לא צוין
- invoiceDate: תאריך החשבונית/קבלה (YYYY-MM-DD, null אם לא נמצא)
- dueDate: מועד תשלום אחרון (YYYY-MM-DD, null אם לא נמצא)
- status: סטטוס - "paid" אם כתוב "שולם"/"paid"/"receipt"/"קבלה"/"אישור תשלום", "pending" אם כתוב "לתשלום"/"due", "unknown" אם לא ברור
- flowDirection: "income" אם העסק של המשתמש הוא המנפיק או הצד שאמור לקבל את הכסף, "expense" אם העסק של המשתמש הוא הלקוח/הנמען או הצד שאמור לשלם, "unknown" אם לא ניתן לקבוע בביטחון
- documentType: "invoice", "receipt", "credit_note", "order_confirmation" או "unknown"
- counterpartyRole: "supplier" אם הצד השני מספק שירות/מוצר לעסק, "customer" אם הצד השני הוא לקוח/משלם לעסק, "unknown" אם לא ברור
- classificationReason: הסבר קצר בעברית למה נבחר flowDirection
- confidence: מספר בין 0 ל-1 שמייצג עד כמה הסיווג בטוח
- description: תיאור קצר ומובן של החשבונית (עברית, עד 120 תווים). כלול מה השירות/מוצר
- invoiceNumber: מספר חשבונית/קבלה (null אם לא נמצא)
- items: רשימת פריטים/שירותים בחשבונית. כל פריט: { name: שם, amount: סכום או null }. רשימה ריקה אם אין פירוט

טיפים:
- אם המייל הוא HTML שהומר לטקסט, התעלם מתגיות שנותרו
- חפש סכומים ליד סימני ₪, ש"ח, NIS, $, €
- אם יש גם גוף מייל וגם PDF, העדף את הנתונים מה-PDF כי הם מדויקים יותר
- אם דומיין השולח שייך לעסק של המשתמש, זו אינדיקציה חזקה ל-income
- אם שם העסק או מספר הזהות העסקי של המשתמש מופיעים כנמען, לקוח או Bill To, זו אינדיקציה חזקה ל-expense
- אל תסווג כ-expense רק כי מופיעות המילים "חשבונית", "receipt" או "payment"
- אם אין ודאות מספקת, החזר flowDirection="unknown"
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
              issuerName: { type: ["string", "null"] },
              recipientName: { type: ["string", "null"] },
              category: {
                type: "string",
                enum: ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"],
              },
              amount: { type: ["number", "null"] },
              currency: { type: "string" },
              invoiceDate: { type: ["string", "null"] },
              dueDate: { type: ["string", "null"] },
              status: { type: "string", enum: ["pending", "paid", "overdue", "unknown"] },
              flowDirection: { type: "string", enum: ["expense", "income", "unknown"] },
              documentType: { type: "string", enum: ["invoice", "receipt", "credit_note", "order_confirmation", "unknown"] },
              counterpartyRole: { type: "string", enum: ["supplier", "customer", "unknown"] },
              classificationReason: { type: "string" },
              confidence: { type: "number" },
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
              "provider", "issuerName", "recipientName", "category", "amount", "currency",
              "invoiceDate", "dueDate", "status", "flowDirection", "documentType", "counterpartyRole",
              "classificationReason", "confidence", "description", "invoiceNumber", "items",
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
    const parsed = JSON.parse(jsonStr) as Partial<ExtractedInvoice>;
    const flowDirection = normalizeFlowDirection(parsed.flowDirection);
    const normalized: ExtractedInvoice = {
      provider: typeof parsed.provider === "string" && parsed.provider.trim() ? parsed.provider.trim() : "לא ידוע",
      issuerName: typeof parsed.issuerName === "string" && parsed.issuerName.trim() ? parsed.issuerName.trim() : null,
      recipientName: typeof parsed.recipientName === "string" && parsed.recipientName.trim() ? parsed.recipientName.trim() : null,
      category: parsed.category === "תקשורת" || parsed.category === "חשמל" || parsed.category === "מים" || parsed.category === "ארנונה" || parsed.category === "ביטוח" || parsed.category === "בנק" || parsed.category === "רכב" || parsed.category === "אחר"
        ? parsed.category
        : "אחר",
      amount: typeof parsed.amount === "number" && Number.isFinite(parsed.amount) ? parsed.amount : null,
      currency: typeof parsed.currency === "string" && parsed.currency.trim() ? parsed.currency.trim() : "ILS",
      invoiceDate: typeof parsed.invoiceDate === "string" && parsed.invoiceDate.trim() ? parsed.invoiceDate : null,
      dueDate: typeof parsed.dueDate === "string" && parsed.dueDate.trim() ? parsed.dueDate : null,
      status: parsed.status === "pending" || parsed.status === "paid" || parsed.status === "overdue" || parsed.status === "unknown" ? parsed.status : "unknown",
      flowDirection,
      documentType: normalizeDocumentType(parsed.documentType),
      counterpartyRole: normalizeCounterpartyRole(parsed.counterpartyRole),
      classificationReason: typeof parsed.classificationReason === "string" ? parsed.classificationReason.trim() : "",
      confidence: normalizeConfidence(parsed.confidence),
      description: typeof parsed.description === "string" ? parsed.description.trim() : "",
      invoiceNumber: typeof parsed.invoiceNumber === "string" && parsed.invoiceNumber.trim() ? parsed.invoiceNumber.trim() : null,
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item) => ({
            name: typeof item?.name === "string" ? item.name : "",
            amount: typeof item?.amount === "number" && Number.isFinite(item.amount) ? item.amount : null,
          })).filter((item) => item.name)
        : [],
    };
    if (normalized.flowDirection === "unknown") {
      normalized.flowDirection = inferFlowDirectionFallback(from, businessContext);
    }
    if (normalized.flowDirection === "income" && matchesBusinessIdentity(normalized.provider, businessContext) && normalized.recipientName && !matchesBusinessIdentity(normalized.recipientName, businessContext)) {
      normalized.provider = normalized.recipientName;
    }
    if (normalized.flowDirection === "expense" && matchesBusinessIdentity(normalized.provider, businessContext) && normalized.issuerName && !matchesBusinessIdentity(normalized.issuerName, businessContext)) {
      normalized.provider = normalized.issuerName;
    }
    console.log(`[Gmail] extractInvoiceData result: provider=${normalized.provider}, amount=${normalized.amount}, currency=${normalized.currency}, status=${normalized.status}, flow=${normalized.flowDirection}`);
    return normalized;
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
  discoveriesFound: number;
  discoveriesSaved: number;
  invoices: Array<{
    provider: string;
    amount: number | null;
    category: string;
    flowDirection: InvoiceFlowDirection;
    date: string | null;
    subject: string;
    description: string;
  }>;
  discoveries: Array<{
    provider: string;
    insuranceCategory: string | null;
    artifactType: string;
    summary: string;
    actionHint: string;
    policyNumber: string | null;
    monthlyPremium: number | null;
  }>;
}

export async function scanGmailForInvoices(
  userId: number,
  daysBack: number = 7
): Promise<ScanResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const profile = await getUserProfile(userId);
  const businessContext = getBusinessIdentityContext(profile);
  const userFilters: EmailScanFilters = {
    senders: parseEmailScanList(profile?.emailScanSenders),
    keywords: parseEmailScanList(profile?.emailScanKeywords),
  };

  const connections = await getAllGmailConnections(userId);
  if (connections.length === 0) throw new Error("No Gmail accounts connected");

  let totalScanned = 0;
  let found = 0;
  let saved = 0;
  let discoveriesFound = 0;
  let discoveriesSaved = 0;
  const invoices: ScanResult["invoices"] = [];
  const discoveries: ScanResult["discoveries"] = [];

  for (const conn of connections) {
    let connSaved = 0;

    const emails = await fetchRecentEmails(conn.id, daysBack, userFilters);
    totalScanned += emails.length;

    for (const email of emails) {
      const [existingInvoice] = await db
        .select({ id: smartInvoices.id })
        .from(smartInvoices)
        .where(
          and(
            eq(smartInvoices.userId, userId),
            eq(smartInvoices.gmailMessageId, email.messageId)
          )
        )
        .limit(1);

      const detectedProvider = detectProvider(email.subject, email.from, email.body);
      const primaryActionLink = pickPrimaryInsuranceActionLink(email.actionLinks);
      const [existingArtifact] = await db
        .select({ id: insuranceArtifacts.id })
        .from(insuranceArtifacts)
        .where(
          and(
            eq(insuranceArtifacts.userId, userId),
            eq(insuranceArtifacts.gmailMessageId, email.messageId)
          )
        )
        .limit(1);

      const shouldProcessInvoice = !existingInvoice && isInvoiceEmail(email.subject, email.body);
      const matchesUserSender = userFilters.senders.length > 0 && userFilters.senders.some((s) => email.from.toLowerCase().includes(s.toLowerCase()));
      const matchesUserKeyword = userFilters.keywords.length > 0 && userFilters.keywords.some((kw) => `${email.subject} ${email.body}`.toLowerCase().includes(kw.toLowerCase()));
      const shouldProcessDiscovery = !existingArtifact && (
        matchesUserSender ||
        matchesUserKeyword ||
        looksLikeInsuranceMessage({
          subject: email.subject,
          from: email.from,
          body: email.body,
          attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
          detectedProvider,
        }) || looksLikeInsurancePdfCandidate({
          subject: email.subject,
          from: email.from,
          body: email.body,
          attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
          detectedProvider,
        })
      );

      if (!shouldProcessInvoice && !shouldProcessDiscovery) continue;

      if (shouldProcessInvoice) {
        found++;
      }
      if (shouldProcessDiscovery) {
        discoveriesFound++;
      }

      let pdfText: string | null = null;
      let pdfUrl: string | null = null;
      let pdfFileKey: string | null = null;

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
          pdfFileKey = pdfUrl.replace(/^\/api\/files\//, "");
          pdfText = await extractTextFromPdf(pdfUrl, pdfFileKey);
          console.log(`[Gmail] Extracted ${pdfText.length} chars from PDF: ${firstPdf.filename}`);
        } else {
          console.log(`[Gmail] PDF download failed for: ${firstPdf.filename}`);
        }
      }

      if (shouldProcessInvoice) {
        const extracted = await extractInvoiceData(
          email.subject,
          email.from,
          email.body,
          pdfText,
          detectedProvider,
          businessContext
        );

        const flowDirection = extracted?.flowDirection ?? inferFlowDirectionFallback(email.from, businessContext);
        const llmProvider = extracted?.provider && extracted.provider !== "לא ידוע" ? extracted.provider : null;
        const provider = llmProvider
          ?? (flowDirection === "income" && extracted?.recipientName && !matchesBusinessIdentity(extracted.recipientName, businessContext) ? extracted.recipientName : null)
          ?? detectedProvider?.name
          ?? extractSenderName(email.from)
          ?? "צד לא ידוע";
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
          flowDirection,
        };

        console.log(`[Gmail] Saving invoice: provider=${provider}, category=${category}, flow=${flowDirection}, customCategory=${customCategory ?? "none"}, amount=${extracted?.amount ?? "null"}, pdfUrl=${pdfUrl ? "YES" : "NO"}, pdfText=${pdfText ? `${pdfText.length} chars` : "NO"}`);

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
          flowDirection,
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
          flowDirection,
          date: extracted?.invoiceDate ?? null,
          subject: email.subject,
          description,
        });
      }

      if (shouldProcessDiscovery) {
        const discovery = await extractInsuranceDiscoveryData({
          subject: email.subject,
          from: email.from,
          body: email.body,
          pdfText,
          detectedProvider,
          attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
          userFilterContext: buildUserFilterContextForLLM(userFilters),
        });

        if (discovery.confidence < 0.6) {
          console.log(`[Gmail] Skipping low-confidence discovery (${discovery.confidence.toFixed(2)}): "${email.subject}" from "${email.from}"`);
          continue;
        }

        const requiresExternalAccess = !pdfFileKey && Boolean(primaryActionLink);
        const externalAccessMode = requiresExternalAccess
          ? (primaryActionLink?.requiresLogin ? "portal_login" : "external_link")
          : null;
        const discoveryActionHint = requiresExternalAccess
          ? primaryActionLink?.requiresLogin
            ? "צריך לפתוח את הקישור מהמייל, להתחבר לאזור האישי ולהוריד PDF כדי שנוכל לנתח."
            : "צריך לפתוח את הקישור מהמייל ולהוריד PDF כדי שנוכל לנתח את המסמך."
          : discovery.actionHint;
        const renewalDate = discovery.renewalDate ? new Date(discovery.renewalDate) : null;
        const documentDate =
          renewalDate && !Number.isNaN(renewalDate.getTime())
            ? renewalDate
            : email.date;
        const discoveryPayload = {
          provider: discovery.provider,
          insuranceCategory: discovery.insuranceCategory,
          artifactType: discovery.artifactType,
          confidence: discovery.confidence,
          summary: discovery.summary,
          actionHint: discovery.actionHint,
          policyNumber: discovery.policyNumber,
          monthlyPremium: discovery.monthlyPremium,
          renewalDate: discovery.renewalDate,
          policyType: discovery.policyType,
          fromEmail: email.from,
          attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
          attachmentFileKey: pdfFileKey,
          actionUrl: primaryActionLink?.url ?? null,
          actionLabel: primaryActionLink?.text ?? null,
          requiresExternalAccess,
          externalAccessMode,
        };

        await db.insert(insuranceArtifacts).values({
          userId,
          gmailConnectionId: conn.id,
          sourceEmail: conn.email ?? null,
          gmailMessageId: email.messageId,
          provider: discovery.provider,
          insuranceCategory: discovery.insuranceCategory,
          artifactType: discovery.artifactType,
          confidence: discovery.confidence.toFixed(3),
          premiumAmount: discovery.monthlyPremium?.toString() ?? null,
          policyNumber: discovery.policyNumber ? encryptField(discovery.policyNumber) : null,
          documentDate,
          subject: encryptField(email.subject),
          summary: encryptField(discovery.summary),
          actionHint: encryptField(discoveryActionHint),
          attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
          attachmentFileKey: pdfFileKey,
          extractedData: encryptJson(discoveryPayload),
        });

        discoveriesSaved++;
        discoveries.push({
          provider: discovery.provider,
          insuranceCategory: discovery.insuranceCategory,
          artifactType: discovery.artifactType,
          summary: discovery.summary,
          actionHint: discoveryActionHint,
          policyNumber: discovery.policyNumber,
          monthlyPremium: discovery.monthlyPremium,
        });
      }
    }

    await db
      .update(gmailConnections)
      .set({ lastSyncedAt: new Date(), lastSyncCount: connSaved })
      .where(eq(gmailConnections.id, conn.id));
  }

  return {
    scanned: totalScanned,
    found,
    saved,
    discoveriesFound,
    discoveriesSaved,
    invoices,
    discoveries,
  };
}

export interface DiscoveredPolicyPdf {
  connectionId: number;
  gmailMessageId: string;
  subject: string;
  from: string;
  date: Date;
  attachmentName: string;
  attachmentId: string;
  provider: string | null;
  insuranceCategory: string | null;
  artifactType: string;
  alreadyKnown: boolean;
}

export async function discoverPolicyPdfs(
  userId: number,
  daysBack: number = 365
): Promise<DiscoveredPolicyPdf[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const profile = await getUserProfile(userId);
  const userFilters: EmailScanFilters = {
    senders: parseEmailScanList(profile?.emailScanSenders),
    keywords: parseEmailScanList(profile?.emailScanKeywords),
  };

  const connections = await getAllGmailConnections(userId);
  if (connections.length === 0) return [];

  const discovered: DiscoveredPolicyPdf[] = [];
  let connectionsSucceeded = 0;

  for (const conn of connections) {
    try {
      const emails = await fetchRecentEmails(conn.id, daysBack, userFilters);
      connectionsSucceeded++;

      for (const email of emails) {
        if (email.pdfAttachments.length === 0) continue;

        const detectedProvider = detectProvider(email.subject, email.from, email.body);
        const shouldInclude =
          looksLikeInsuranceMessage({
            subject: email.subject,
            from: email.from,
            body: email.body,
            attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
            detectedProvider,
          }) || looksLikeInsurancePdfCandidate({
            subject: email.subject,
            from: email.from,
            body: email.body,
            attachmentFilename: email.pdfAttachments[0]?.filename ?? null,
            detectedProvider,
          });

        if (!shouldInclude) continue;

        const [existingArtifact] = await db
          .select({ id: insuranceArtifacts.id })
          .from(insuranceArtifacts)
          .where(
            and(
              eq(insuranceArtifacts.userId, userId),
              eq(insuranceArtifacts.gmailMessageId, email.messageId)
            )
          )
          .limit(1);

        email.pdfAttachments.forEach((attachment) => {
          const fallbackText = `${email.subject} ${email.body} ${attachment.filename}`;
          discovered.push({
            connectionId: conn.id,
            gmailMessageId: email.messageId,
            subject: email.subject,
            from: email.from,
            date: email.date,
            attachmentName: attachment.filename,
            attachmentId: attachment.attachmentId,
            provider: detectedProvider?.name ?? extractSenderName(email.from),
            insuranceCategory: inferInsuranceCategoryFromText(fallbackText),
            artifactType: inferInsuranceArtifactType(fallbackText, true),
            alreadyKnown: Boolean(existingArtifact),
          });
        });
      }
    } catch (err) {
      console.error(`[Gmail] discoverPolicyPdfs failed for connection ${conn.id}:`, err);
    }
  }

  if (connectionsSucceeded === 0 && connections.length > 0) {
    throw new Error("All Gmail connections failed during policy discovery");
  }

  return discovered
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 40);
}

export async function importPolicyPdfFromGmail(params: {
  userId: number;
  connectionId: number;
  gmailMessageId: string;
  attachmentId: string;
  filename: string;
  insuranceCategory?: "health" | "life" | "car" | "home" | null;
}) {
  const connection = await getGmailConnectionById(params.connectionId);
  if (!connection || connection.userId !== params.userId) {
    throw new Error("Gmail connection not found");
  }

  const pdfBuffer = await downloadPdfAttachmentBuffer(
    params.connectionId,
    params.gmailMessageId,
    params.attachmentId
  );
  if (!pdfBuffer) {
    throw new Error("לא הצלחנו להוריד את המסמך מה-Gmail");
  }
  if (pdfBuffer.length > 20 * 1024 * 1024) {
    throw new Error("קובץ ה-PDF חורג ממגבלת 20MB");
  }

  const sessionId = nanoid(16);
  const safeFilename = sanitizeFilename(params.filename || "policy.pdf");
  const normalizedFilename = safeFilename.toLowerCase().endsWith(".pdf") ? safeFilename : `${safeFilename}.pdf`;
  const fileKey = `policies/${sessionId}/${nanoid(24)}-${normalizedFilename}`;

  await storagePut(fileKey, pdfBuffer, "application/pdf");
  await createAnalysis({
    sessionId,
    userId: params.userId,
    files: [
      {
        name: normalizedFilename,
        size: pdfBuffer.length,
        fileKey,
        mimeType: "application/pdf",
      },
    ],
    status: "pending",
    insuranceCategory: params.insuranceCategory ?? null,
  });

  policyAnalysisWorker.nudge();

  return {
    sessionId,
    fileKey,
    name: normalizedFilename,
    size: pdfBuffer.length,
  };
}

export async function getInsuranceDiscoveries(userId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(insuranceArtifacts)
    .where(eq(insuranceArtifacts.userId, userId))
    .orderBy(desc(insuranceArtifacts.documentDate), desc(insuranceArtifacts.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const extractedData = row.extractedData ? decryptJson<Record<string, unknown>>(row.extractedData) : null;
    const actionUrl = typeof extractedData?.actionUrl === "string" ? extractedData.actionUrl : null;
    const actionLabel = typeof extractedData?.actionLabel === "string" ? extractedData.actionLabel : null;
    const requiresExternalAccess = extractedData?.requiresExternalAccess === true;
    const externalAccessMode =
      extractedData?.externalAccessMode === "portal_login" || extractedData?.externalAccessMode === "external_link"
        ? extractedData.externalAccessMode
        : null;

    return {
      ...row,
      confidence: Number(row.confidence ?? 0),
      premiumAmount: row.premiumAmount != null ? Number(row.premiumAmount) : null,
      policyNumber: row.policyNumber ? decryptField(row.policyNumber) : null,
      subject: row.subject ? decryptField(row.subject) : null,
      summary: row.summary ? decryptField(row.summary) : null,
      actionHint: row.actionHint ? decryptField(row.actionHint) : null,
      attachmentUrl: row.attachmentFileKey ? generateSignedFileUrl(row.attachmentFileKey) : null,
      actionUrl,
      actionLabel,
      requiresExternalAccess,
      externalAccessMode,
      extractedData,
    };
  });
}

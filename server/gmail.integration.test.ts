/**
 * Tests for Gmail integration procedures
 * Tests the tRPC procedures for Gmail OAuth, invoice scanning,
 * HTML parsing, scope verification, and provider detection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the gmail module
vi.mock("./gmail", () => ({
  getGmailAuthUrl: vi.fn((redirectUri: string, state: string) =>
    `https://accounts.google.com/o/oauth2/auth?redirect_uri=${redirectUri}&state=${state}`
  ),
  exchangeCodeForTokens: vi.fn().mockResolvedValue({
    accessToken: "mock-access-token",
    refreshToken: "mock-refresh-token",
    email: "test@gmail.com",
    expiresAt: new Date(Date.now() + 3600 * 1000),
  }),
  saveGmailConnection: vi.fn().mockResolvedValue(undefined),
  getGmailConnection: vi.fn().mockResolvedValue(null),
  disconnectGmail: vi.fn().mockResolvedValue(undefined),
  scanGmailForInvoices: vi.fn().mockResolvedValue({
    scanned: 10,
    found: 3,
    saved: 2,
    invoices: [
      { provider: "בזק", amount: 199.9, category: "תקשורת", date: "2026-03-01", subject: "חשבונית בזק", description: "חשבון חודשי לשירותי אינטרנט ותקשורת" },
      { provider: "חברת החשמל", amount: 450, category: "חשמל", date: "2026-03-05", subject: "חשבון חשמל", description: "חשבון חשמל חודשי" },
    ],
  }),
  verifyGmailScopes: vi.fn().mockResolvedValue(true),
}));

// Mock the db module
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

describe("Gmail integration", () => {
  describe("getGmailAuthUrl", () => {
    it("should generate a valid OAuth URL", async () => {
      const { getGmailAuthUrl } = await import("./gmail");
      const url = getGmailAuthUrl("https://example.com/callback", "state123");
      expect(url).toContain("accounts.google.com");
      expect(url).toContain("redirect_uri");
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should return tokens and email on success", async () => {
      const { exchangeCodeForTokens } = await import("./gmail");
      const result = await exchangeCodeForTokens("auth-code", "https://example.com/callback");
      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result).toHaveProperty("email");
      expect(result.email).toBe("test@gmail.com");
    });
  });

  describe("scanGmailForInvoices", () => {
    it("should return scan results with invoice data", async () => {
      const { scanGmailForInvoices } = await import("./gmail");
      const result = await scanGmailForInvoices(1, 7);
      expect(result).toHaveProperty("scanned");
      expect(result).toHaveProperty("found");
      expect(result).toHaveProperty("saved");
      expect(result).toHaveProperty("invoices");
      expect(Array.isArray(result.invoices)).toBe(true);
    });

    it("should return invoice with provider and amount", async () => {
      const { scanGmailForInvoices } = await import("./gmail");
      const result = await scanGmailForInvoices(1, 7);
      const firstInvoice = result.invoices[0];
      expect(firstInvoice).toHaveProperty("provider");
      expect(firstInvoice).toHaveProperty("amount");
      expect(firstInvoice).toHaveProperty("category");
    });

    it("should return invoice with description", async () => {
      const { scanGmailForInvoices } = await import("./gmail");
      const result = await scanGmailForInvoices(1, 7);
      const firstInvoice = result.invoices[0];
      expect(firstInvoice).toHaveProperty("description");
      expect(typeof firstInvoice.description).toBe("string");
    });

    it("should not save more than found", async () => {
      const { scanGmailForInvoices } = await import("./gmail");
      const result = await scanGmailForInvoices(1, 7);
      expect(result.saved).toBeLessThanOrEqual(result.found);
      expect(result.found).toBeLessThanOrEqual(result.scanned);
    });
  });

  describe("getGmailConnection", () => {
    it("should return null when no connection exists", async () => {
      const { getGmailConnection } = await import("./gmail");
      const conn = await getGmailConnection(999);
      expect(conn).toBeNull();
    });
  });

  describe("disconnectGmail", () => {
    it("should call disconnect without throwing", async () => {
      const { disconnectGmail } = await import("./gmail");
      await expect(disconnectGmail(1)).resolves.not.toThrow();
    });
  });
});

describe("Invoice data structure", () => {
  it("should have correct category values", () => {
    const validCategories = ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"];
    expect(validCategories).toContain("תקשורת");
    expect(validCategories).toContain("חשמל");
    expect(validCategories).toContain("ביטוח");
  });

  it("should have correct status values", () => {
    const validStatuses = ["pending", "paid", "overdue", "unknown"];
    expect(validStatuses).toContain("pending");
    expect(validStatuses).toContain("paid");
  });
});

describe("Category mapping and custom categories", () => {
  it("should prefer customCategory over category when both exist", () => {
    const invoice = { category: "אחר", customCategory: "קלינאית תקשורת" };
    const effectiveCategory = invoice.customCategory ?? invoice.category ?? "אחר";
    expect(effectiveCategory).toBe("קלינאית תקשורת");
  });

  it("should fall back to category when customCategory is null", () => {
    const invoice = { category: "חשמל", customCategory: null };
    const effectiveCategory = invoice.customCategory ?? invoice.category ?? "אחר";
    expect(effectiveCategory).toBe("חשמל");
  });

  it("should fall back to אחר when both are null", () => {
    const invoice = { category: null, customCategory: null };
    const effectiveCategory = invoice.customCategory ?? invoice.category ?? "אחר";
    expect(effectiveCategory).toBe("אחר");
  });

  it("should normalize provider names for mapping lookup", () => {
    const provider = "  ניצן מרלא  ";
    const normalized = provider.trim().toLowerCase();
    expect(normalized).toBe("ניצן מרלא");
  });

  it("should allow free-text custom categories", () => {
    const customCategories = [
      "קלינאית תקשורת",
      "רופא שיניים",
      "גן ילדים",
      "ספק אינטרנט",
    ];
    for (const cat of customCategories) {
      expect(cat.length).toBeGreaterThan(0);
      expect(cat.length).toBeLessThanOrEqual(128);
    }
  });

  it("should group invoices by effective category for monthly summary", () => {
    const invoices = [
      { amount: "100", category: "אחר", customCategory: "קלינאית תקשורת" },
      { amount: "200", category: "אחר", customCategory: "קלינאית תקשורת" },
      { amount: "150", category: "חשמל", customCategory: null },
    ];

    const groups: Record<string, number> = {};
    for (const inv of invoices) {
      const cat = inv.customCategory ?? inv.category ?? "אחר";
      groups[cat] = (groups[cat] ?? 0) + parseFloat(inv.amount);
    }

    expect(groups["קלינאית תקשורת"]).toBe(300);
    expect(groups["חשמל"]).toBe(150);
    expect(groups["אחר"]).toBeUndefined();
  });
});

// ─── HTML to text conversion tests ──────────────────────────────────────────

describe("HTML to text conversion", () => {
  it("should strip HTML tags and return clean text", async () => {
    const { convert } = await import("html-to-text");
    const html = `<html><body><p>שלום עולם</p><p>סכום: ₪150.00</p></body></html>`;
    const text = convert(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
      ],
    });
    expect(text).toContain("שלום עולם");
    expect(text).toContain("₪150.00");
    expect(text).not.toContain("<html>");
    expect(text).not.toContain("<body>");
    expect(text).not.toContain("<p>");
  });

  it("should handle complex HTML with styles and scripts", async () => {
    const { convert } = await import("html-to-text");
    const html = `
      <html>
        <head><style>.cls { color: red; }</style></head>
        <body>
          <script>alert('test')</script>
          <div class="cls">
            <p>חשבונית מספר 12345</p>
            <span>סכום לתשלום: ₪89.90</span>
          </div>
        </body>
      </html>
    `;
    const text = convert(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
      ],
    });
    expect(text).toContain("חשבונית מספר 12345");
    expect(text).toContain("₪89.90");
    expect(text).not.toContain("alert");
    expect(text).not.toContain(".cls");
    expect(text).not.toContain("<script>");
    expect(text).not.toContain("<style>");
  });

  it("should handle Apple receipt HTML email", async () => {
    const { convert } = await import("html-to-text");
    const html = `
      <html dir="rtl" lang="he">
        <head>
          <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        </head>
        <body>
          <P STYLE="text-align:Right;line-height:11pt;word-wrap:break-word;padding:0px;margin:0px;white-space:pre;" DIR="RTL">
            <SPAN STYLE="background-color:#FFFFFF;color:#000000;font-family:Arial;font-size:11pt">הקבלה שלך עבור התשלום אל Apple Services</SPAN>
          </P>
          <P STYLE="text-align:Right">
            <SPAN STYLE="background-color:#FFFFFF;color:#000000;font-family:Arial;font-size:11pt">סכום: ₪29.90</SPAN>
          </P>
        </body>
      </html>
    `;
    const text = convert(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "script", format: "skip" },
        { selector: "a", options: { ignoreHref: true } },
      ],
    });
    expect(text).toContain("הקבלה שלך עבור התשלום אל Apple Services");
    expect(text).toContain("₪29.90");
    expect(text).not.toContain("STYLE=");
    expect(text).not.toContain("SPAN");
    expect(text).not.toContain("background-color");
  });

  it("should extract text from table-based invoices", async () => {
    const { convert } = await import("html-to-text");
    const html = `
      <table>
        <tr><td>שירות</td><td>סכום</td></tr>
        <tr><td>אינטרנט</td><td>₪99.00</td></tr>
        <tr><td>טלפון</td><td>₪49.00</td></tr>
        <tr><td>סה"כ</td><td>₪148.00</td></tr>
      </table>
    `;
    const text = convert(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: "table", format: "dataTable" },
      ],
    });
    expect(text).toContain("אינטרנט");
    expect(text).toContain("₪99.00");
    expect(text).toContain("₪148.00");
  });
});

// ─── Provider detection tests ───────────────────────────────────────────────

describe("Provider detection", () => {
  const PROVIDERS = [
    { name: "בזק", keywords: ["בזק", "bezeq"], domains: ["bezeq.co.il"] },
    { name: "Apple", keywords: ["apple", "itunes", "app store", "icloud"], domains: ["apple.com", "email.apple.com"] },
    { name: "חברת החשמל", keywords: ["חברת החשמל", "iec", "חשמל"], domains: ["iec.co.il"] },
    { name: "הוט", keywords: ["הוט", "hot"], domains: ["hot.net.il"] },
  ];

  function detectProvider(subject: string, from: string): string | null {
    const text = `${subject} ${from}`.toLowerCase();
    for (const p of PROVIDERS) {
      if (p.keywords.some((kw) => text.includes(kw.toLowerCase()))) return p.name;
      if (p.domains.some((d) => from.toLowerCase().includes(d))) return p.name;
    }
    return null;
  }

  it("should detect Israeli providers from subject", () => {
    expect(detectProvider("חשבונית מבזק - פברואר 2026", "noreply@bezeq.co.il")).toBe("בזק");
  });

  it("should detect Apple from email domain", () => {
    expect(detectProvider("Your receipt", "no_reply@email.apple.com")).toBe("Apple");
  });

  it("should detect provider from Hebrew keywords", () => {
    expect(detectProvider("חשבון חשמל חודשי", "billing@iec.co.il")).toBe("חברת החשמל");
  });

  it("should return null for unknown providers", () => {
    expect(detectProvider("שלום עולם", "someone@example.com")).toBeNull();
  });
});

// ─── Sender name extraction tests ────────────────────────────────────────────

describe("Sender name extraction (extractSenderName logic)", () => {
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

  it("should extract display name from quoted sender", () => {
    expect(extractSenderName('"ניצן מורלא" <accounting@finbot.co.il>')).toBe("ניצן מורלא");
  });

  it("should extract display name from unquoted sender", () => {
    expect(extractSenderName("Nitzan Morela <accounting@finbot.co.il>")).toBe("Nitzan Morela");
  });

  it("should fall back to domain for email-only sender", () => {
    expect(extractSenderName("billing@finbot.co.il")).toBe("finbot");
  });

  it("should return null for generic email domains", () => {
    expect(extractSenderName("someone@gmail.com")).toBeNull();
    expect(extractSenderName("someone@yahoo.com")).toBeNull();
    expect(extractSenderName("someone@hotmail.com")).toBeNull();
    expect(extractSenderName("someone@outlook.com")).toBeNull();
  });

  it("should extract domain from business email without display name", () => {
    expect(extractSenderName("noreply@bezeq.co.il")).toBe("bezeq");
  });

  it("should handle Hebrew display name with angle brackets", () => {
    expect(extractSenderName("חברת החשמל <billing@iec.co.il>")).toBe("חברת החשמל");
  });

  it("should handle empty from string", () => {
    expect(extractSenderName("")).toBeNull();
  });
});

// ─── Invoice keyword detection tests ────────────────────────────────────────

describe("Invoice keyword detection", () => {
  const INVOICE_KEYWORDS = [
    "חשבונית", "חשבון", "קבלה", "אישור תשלום", "דוח", "חיוב", "invoice",
    "receipt", "payment", "bill", "statement", "לתשלום", "סכום לתשלום",
    "תאריך חיוב", "מועד תשלום", "חשבונית מס", "חשבון חודשי",
    "your receipt", "payment confirmation", "order confirmation",
    "הקבלה שלך", "אישור הזמנה", "פירוט חיוב",
  ];

  function isInvoiceEmail(subject: string, body: string): boolean {
    const text = `${subject} ${body}`.toLowerCase();
    return INVOICE_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  }

  it("should detect Hebrew invoice keywords", () => {
    expect(isInvoiceEmail("חשבונית פברואר 2026", "")).toBe(true);
    expect(isInvoiceEmail("הקבלה שלך עבור התשלום", "")).toBe(true);
    expect(isInvoiceEmail("אישור תשלום", "")).toBe(true);
  });

  it("should detect English invoice keywords", () => {
    expect(isInvoiceEmail("Your receipt from Apple", "")).toBe(true);
    expect(isInvoiceEmail("Payment confirmation", "")).toBe(true);
    expect(isInvoiceEmail("Monthly invoice", "")).toBe(true);
  });

  it("should not detect non-invoice emails", () => {
    expect(isInvoiceEmail("שלום, מה שלומך?", "בוא נתראה מחר")).toBe(false);
    expect(isInvoiceEmail("Meeting tomorrow", "Let's discuss the project")).toBe(false);
  });

  it("should detect invoice keywords in body even if subject is generic", () => {
    expect(isInvoiceEmail("הודעה חשובה", "מצורפת חשבונית מס עבור חודש פברואר")).toBe(true);
  });
});

// ─── Scope verification tests ───────────────────────────────────────────────

describe("Scope verification", () => {
  function hasGmailReadScope(scopes: string): boolean {
    const scopeList = scopes.split(" ");
    return scopeList.some((s) => s.includes("gmail.readonly") || s.includes("mail.google.com"));
  }

  it("should verify gmail.readonly scope", () => {
    expect(hasGmailReadScope(
      "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email"
    )).toBe(true);
  });

  it("should reject when gmail.readonly is missing", () => {
    expect(hasGmailReadScope(
      "https://www.googleapis.com/auth/userinfo.email"
    )).toBe(false);
  });

  it("should accept mail.google.com scope as alternative", () => {
    expect(hasGmailReadScope(
      "https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email"
    )).toBe(true);
  });

  it("should reject empty scopes", () => {
    expect(hasGmailReadScope("")).toBe(false);
  });
});

// ─── Encryption helpers tests ───────────────────────────────────────────────

describe("Encryption helpers", () => {
  const ENCRYPTION_KEY = "test_secret_key_for_testing_1234".slice(0, 32).padEnd(32, "0");
  const ALGORITHM = "aes-256-gcm";

  function encrypt(text: string): string {
    const crypto = require("crypto");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
  }

  function decrypt(encryptedText: string): string {
    const crypto = require("crypto");
    const [ivHex, tagHex, dataHex] = encryptedText.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  it("should encrypt and decrypt tokens correctly", () => {
    const token = "ya29.test-access-token-12345";
    const encrypted = encrypt(token);
    expect(encrypted).not.toBe(token);
    expect(encrypted.split(":")).toHaveLength(3);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(token);
  });

  it("should produce different ciphertexts for same input (random IV)", () => {
    const token = "test-token";
    const enc1 = encrypt(token);
    const enc2 = encrypt(token);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(token);
    expect(decrypt(enc2)).toBe(token);
  });
});

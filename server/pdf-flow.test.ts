import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";

vi.mock("./_core/env", () => ({
  ENV: {
    storagePath: "/tmp/pdf-flow-test-uploads",
    cookieSecret: "test-secret-for-pdf-flow",
    llmApiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    llmApiKey: "test-key",
    llmModel: "gemini-2.5-flash",
    llmSupportsFileUrl: true,
    isProduction: false,
  },
}));

import {
  storagePut,
  storageRead,
  generateSignedFileUrl,
  verifyFileSignature,
  sanitizeFilename,
} from "./storage";

const TEST_STORAGE_PATH = "/tmp/pdf-flow-test-uploads";

function createMinimalPdf(): Buffer {
  const content =
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n" +
    "0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF";
  return Buffer.from(content, "utf-8");
}

beforeEach(() => {
  if (fs.existsSync(TEST_STORAGE_PATH)) {
    fs.rmSync(TEST_STORAGE_PATH, { recursive: true });
  }
  fs.mkdirSync(TEST_STORAGE_PATH, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(TEST_STORAGE_PATH)) {
    fs.rmSync(TEST_STORAGE_PATH, { recursive: true });
  }
});

describe("PDF Storage Flow", () => {
  it("should store a PDF and return key + url", async () => {
    const pdf = createMinimalPdf();
    const fileKey = `gmail-invoices/1/msg-abc-12345678-invoice.pdf`;

    const result = await storagePut(fileKey, pdf, "application/pdf");
    expect(result.key).toBe(fileKey);
    expect(result.url).toBe(`/api/files/${fileKey}`);

    const storedFile = path.join(TEST_STORAGE_PATH, fileKey);
    expect(fs.existsSync(storedFile)).toBe(true);
    expect(fs.readFileSync(storedFile).length).toBe(pdf.length);
  });

  it("should read back the stored PDF", async () => {
    const pdf = createMinimalPdf();
    const fileKey = `gmail-invoices/1/msg-xyz-abcdef00-test.pdf`;
    await storagePut(fileKey, pdf, "application/pdf");

    const buffer = await storageRead(fileKey);
    expect(buffer).not.toBeNull();
    expect(buffer!.length).toBe(pdf.length);
    expect(buffer!.equals(pdf)).toBe(true);
  });

  it("should return null for non-existent file", async () => {
    const buffer = await storageRead("nonexistent/file.pdf");
    expect(buffer).toBeNull();
  });
});

describe("File URL Signing & Verification", () => {
  it("should generate a signed URL with token and exp", () => {
    const fileKey = "gmail-invoices/1/msg-abc-12345678-invoice.pdf";
    const url = generateSignedFileUrl(fileKey);

    expect(url).toMatch(/^\/api\/files\//);
    expect(url).toContain("token=");
    expect(url).toContain("exp=");

    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe(`/api/files/${fileKey}`);

    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;
    expect(token).toBeTruthy();
    expect(exp).toBeTruthy();
    expect(parseInt(exp)).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("should verify a valid signed URL", () => {
    const fileKey = "gmail-invoices/1/msg-abc-12345678-invoice.pdf";
    const url = generateSignedFileUrl(fileKey);
    const parsed = new URL(url, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;

    expect(verifyFileSignature(fileKey, token, exp)).toBe(true);
  });

  it("should reject tampered token", () => {
    const fileKey = "gmail-invoices/1/msg-abc-12345678-invoice.pdf";
    const url = generateSignedFileUrl(fileKey);
    const parsed = new URL(url, "http://localhost");
    const exp = parsed.searchParams.get("exp")!;

    expect(verifyFileSignature(fileKey, "tampered-token-value-x", exp)).toBe(false);
  });

  it("should reject expired URL", () => {
    const fileKey = "gmail-invoices/1/msg-abc-12345678-invoice.pdf";
    const pastExp = Math.floor(Date.now() / 1000) - 100;
    const data = `${fileKey}:${pastExp}`;
    const secret = "test-secret-for-pdf-flow";
    const token = crypto.createHmac("sha256", secret).update(data).digest("hex");

    expect(verifyFileSignature(fileKey, token, pastExp.toString())).toBe(false);
  });

  it("should reject wrong fileKey", () => {
    const fileKey = "gmail-invoices/1/msg-abc-12345678-invoice.pdf";
    const url = generateSignedFileUrl(fileKey);
    const parsed = new URL(url, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;

    expect(verifyFileSignature("different/file.pdf", token, exp)).toBe(false);
  });

  it("should handle Hebrew characters in fileKey via URL encoding", () => {
    const fileKey = "gmail-invoices/1/msg-abc-12345678-חשבונית.pdf";
    const url = generateSignedFileUrl(fileKey);
    expect(url).toContain(encodeURIComponent("חשבונית"));

    const parsed = new URL(url, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;
    const decodedKey = decodeURIComponent(parsed.pathname.replace("/api/files/", ""));

    expect(verifyFileSignature(decodedKey, token, exp)).toBe(true);
  });
});

describe("End-to-End: Store → Sign → Verify → Serve", () => {
  it("should complete the full PDF lifecycle with sanitized filenames", async () => {
    const pdf = createMinimalPdf();
    const userId = 42;
    const messageId = "msg-realtest123";
    const suffix = crypto.randomBytes(4).toString("hex");
    const filename = "חשבונית_פלאפון_02-2026.pdf";
    const safeName = sanitizeFilename(filename);
    expect(safeName).toMatch(/^[a-zA-Z0-9._\-]+$/);
    const fileKey = `gmail-invoices/${userId}/${messageId}-${suffix}-${safeName}`;

    const { url } = await storagePut(fileKey, pdf, "application/pdf");
    expect(url).toBe(`/api/files/${fileKey}`);

    const buffer = await storageRead(fileKey);
    expect(buffer).not.toBeNull();
    expect(buffer!.length).toBe(pdf.length);

    const signedUrl = generateSignedFileUrl(fileKey);
    const parsed = new URL(signedUrl, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;

    expect(verifyFileSignature(fileKey, token, exp)).toBe(true);

    const filePath = path.join(TEST_STORAGE_PATH, fileKey);
    expect(fs.existsSync(filePath)).toBe(true);
    const served = fs.readFileSync(filePath);
    expect(served.equals(pdf)).toBe(true);
  });

  it("should handle legacy Hebrew fileKeys via decodeURIComponent", async () => {
    const pdf = createMinimalPdf();
    const hebrewKey = "gmail-invoices/42/msg-legacy-חשבונית.pdf";
    await storagePut(hebrewKey, pdf, "application/pdf");

    const signedUrl = generateSignedFileUrl(hebrewKey);
    const parsed = new URL(signedUrl, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;

    const encodedPath = parsed.pathname.replace("/api/files/", "");
    const decodedKey = decodeURIComponent(encodedPath);
    expect(decodedKey).toBe(hebrewKey);
    expect(verifyFileSignature(decodedKey, token, exp)).toBe(true);
  });
});

describe("getInvoices URL Signing Logic", () => {
  it("should extract fileKey from stored pdfUrl and sign it", () => {
    const storedPdfUrl = "/api/files/gmail-invoices/42/msg-abc-1a2b3c4d-invoice.pdf";

    const rawUrl = storedPdfUrl.split("?")[0];
    const fileKey = rawUrl.replace(/^\/api\/files\//, "");
    const signedUrl = generateSignedFileUrl(fileKey);

    expect(fileKey).toBe("gmail-invoices/42/msg-abc-1a2b3c4d-invoice.pdf");
    expect(signedUrl).toContain("token=");
    expect(signedUrl).toContain("exp=");

    const parsed = new URL(signedUrl, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;
    expect(verifyFileSignature(fileKey, token, exp)).toBe(true);
  });

  it("should handle pdfUrl that already has query params (re-signing)", () => {
    const oldSignedUrl =
      "/api/files/gmail-invoices/42/msg-abc-1a2b3c4d-invoice.pdf?token=oldtoken&exp=9999999";

    const rawUrl = oldSignedUrl.split("?")[0];
    const fileKey = rawUrl.replace(/^\/api\/files\//, "");
    const newSignedUrl = generateSignedFileUrl(fileKey);

    expect(fileKey).toBe("gmail-invoices/42/msg-abc-1a2b3c4d-invoice.pdf");

    const parsed = new URL(newSignedUrl, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;
    expect(verifyFileSignature(fileKey, token, exp)).toBe(true);
  });

  it("should handle pdfUrl with special characters in filename", () => {
    const storedPdfUrl = "/api/files/gmail-invoices/42/msg-abc-1a2b3c4d-_________02-2026.pdf";

    const rawUrl = storedPdfUrl.split("?")[0];
    const fileKey = rawUrl.replace(/^\/api\/files\//, "");
    const signedUrl = generateSignedFileUrl(fileKey);

    const parsed = new URL(signedUrl, "http://localhost");
    const token = parsed.searchParams.get("token")!;
    const exp = parsed.searchParams.get("exp")!;
    expect(verifyFileSignature(fileKey, token, exp)).toBe(true);
  });
});

describe("sanitizeFilename", () => {
  it("should replace Hebrew characters with underscores for ASCII-safe keys", () => {
    const result = sanitizeFilename("חשבונית.pdf");
    expect(result).toMatch(/^_+\.pdf$/);
    expect(result).not.toContain("חשבונית");
  });

  it("should preserve alphanumeric, dots, hyphens, underscores", () => {
    expect(sanitizeFilename("invoice-2026_03.pdf")).toBe("invoice-2026_03.pdf");
  });

  it("should replace dangerous characters", () => {
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).not.toContain("/");
    expect(result).not.toContain("..");
  });

  it("should handle empty string", () => {
    expect(sanitizeFilename("")).toBe("unnamed");
  });

  it("should strip path components", () => {
    expect(sanitizeFilename("/path/to/file.pdf")).toBe("file.pdf");
  });

  it("should replace spaces with underscores", () => {
    expect(sanitizeFilename("my invoice 2026.pdf")).toBe("my_invoice_2026.pdf");
  });
});

describe("extractedDataObj construction", () => {
  it("should include pdfUrl when PDF was downloaded", () => {
    const pdfUrl = "/api/files/gmail-invoices/42/msg-abc-12345678-invoice.pdf";
    const extracted = {
      provider: "פלאפון",
      category: "תקשורת",
      amount: 199.9,
      currency: "ILS",
    };

    const extractedDataObj = {
      ...(extracted ?? {}),
      pdfUrl: pdfUrl ?? undefined,
      pdfFilename: "invoice.pdf",
      fromEmail: "noreply@pelephone.co.il",
    };

    expect(extractedDataObj.pdfUrl).toBe(pdfUrl);
    const json = JSON.stringify(extractedDataObj);
    expect(json).toContain("pdfUrl");
    expect(JSON.parse(json).pdfUrl).toBe(pdfUrl);
  });

  it("should omit pdfUrl when PDF download failed (undefined is stripped by JSON.stringify)", () => {
    const pdfUrl: string | null = null;
    const extracted = {
      provider: "בזק",
      category: "תקשורת",
      amount: 150,
      currency: "ILS",
    };

    const extractedDataObj = {
      ...(extracted ?? {}),
      pdfUrl: pdfUrl ?? undefined,
      pdfFilename: undefined,
      fromEmail: "noreply@bezeq.co.il",
    };

    const json = JSON.stringify(extractedDataObj);
    const parsed = JSON.parse(json);
    expect(parsed.pdfUrl).toBeUndefined();
    expect("pdfUrl" in parsed).toBe(false);
  });
});

describe("LLM response content parsing", () => {
  it("should handle string content from LLM", () => {
    const rawContent: string | Array<{ type: string; text?: string }> =
      '{"provider":"פלאפון","amount":199.9}';

    let text = "";
    if (typeof rawContent === "string") {
      text = rawContent;
    } else if (Array.isArray(rawContent)) {
      text = rawContent
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
        .map((p) => p.text)
        .join("");
    }

    expect(text).toBe('{"provider":"פלאפון","amount":199.9}');
    const parsed = JSON.parse(text);
    expect(parsed.provider).toBe("פלאפון");
    expect(parsed.amount).toBe(199.9);
  });

  it("should handle array content from LLM (Gemini sometimes returns this)", () => {
    const rawContent: string | Array<{ type: string; text?: string }> = [
      { type: "text", text: '{"provider":"חברת החשמל",' },
      { type: "text", text: '"amount":450.0}' },
    ];

    let text = "";
    if (typeof rawContent === "string") {
      text = rawContent;
    } else if (Array.isArray(rawContent)) {
      text = rawContent
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
        .map((p) => p.text)
        .join("");
    }

    expect(text).toBe('{"provider":"חברת החשמל","amount":450.0}');
    const parsed = JSON.parse(text);
    expect(parsed.provider).toBe("חברת החשמל");
    expect(parsed.amount).toBe(450.0);
  });

  it("should handle PDF text extraction with array content", () => {
    const rawContent: string | Array<{ type: string; text?: string }> = [
      { type: "text", text: "שם ספק: פלאפון תקשורת בע\"מ\n" },
      { type: "text", text: "סכום לתשלום: 199.90 ₪\n" },
      { type: "text", text: "תאריך: 01/03/2026" },
    ];

    let text = "";
    if (typeof rawContent === "string") {
      text = rawContent;
    } else if (Array.isArray(rawContent)) {
      text = rawContent
        .filter((p): p is { type: "text"; text: string } => p.type === "text" && !!p.text)
        .map((p) => p.text)
        .join("\n");
    }

    expect(text).toContain("פלאפון");
    expect(text).toContain("199.90");
    expect(text.length).toBeGreaterThan(0);
  });
});

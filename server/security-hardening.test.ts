import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
  isEncrypted,
} from "./encryption";
import {
  fileSizeLimitMiddleware,
  geoBlockMiddleware,
} from "./security";

// Mock geoip-country (replaces geoip-lite for IPv6 support)
vi.mock("geoip-country", () => ({
  default: {
    lookup: (ip: string) => {
      const geoMap: Record<string, { country: string } | null> = {
        "1.2.3.4": { country: "US" },
        "5.6.7.8": { country: "IL" },
      };
      return geoMap[ip] ?? null;
    },
  },
}));

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    ip: "127.0.0.1",
    path: "/api/trpc/test",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): Response & { _headers: Record<string, string>; _statusCode: number; _body: any } {
  const res: any = {
    _headers: {},
    _statusCode: 200,
    _body: null,
    setHeader(name: string, value: string) {
      this._headers[name] = value;
      return this;
    },
    status(code: number) {
      this._statusCode = code;
      return this;
    },
    json(body: any) {
      this._body = body;
      return this;
    },
  };
  return res;
}

// ─── Encryption Tests ──────────────────────────────────────────────────────

describe("Field-level encryption (AES-256-GCM)", () => {
  it("should encrypt and decrypt a simple string", () => {
    const plaintext = "Hello, World!";
    const encrypted = encryptField(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should encrypt and decrypt Hebrew text", () => {
    const plaintext = "שלום עולם! זהו טקסט בעברית עם מספרים 12345";
    const encrypted = encryptField(plaintext);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should produce different ciphertexts for the same plaintext (random IV)", () => {
    const plaintext = "same text";
    const encrypted1 = encryptField(plaintext);
    const encrypted2 = encryptField(plaintext);
    expect(encrypted1).not.toBe(encrypted2); // Different IVs
    expect(decryptField(encrypted1)).toBe(plaintext);
    expect(decryptField(encrypted2)).toBe(plaintext);
  });

  it("should handle empty strings gracefully", () => {
    const result = encryptField("");
    expect(result).toBe("");
  });

  it("should handle null-like values gracefully", () => {
    const result = encryptField(null as any);
    expect(result).toBeFalsy();
  });

  it("should return unencrypted text as-is (legacy data)", () => {
    const legacyText = "This is unencrypted legacy data";
    const result = decryptField(legacyText);
    expect(result).toBe(legacyText);
  });

  it("should detect encrypted format correctly", () => {
    const encrypted = encryptField("test");
    expect(isEncrypted(encrypted)).toBe(true);
    expect(isEncrypted("not encrypted")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted("a:b")).toBe(false); // Only 2 parts
  });

  it("should encrypt and decrypt large text (policy analysis)", () => {
    const largeText = JSON.stringify({
      coverages: Array.from({ length: 50 }, (_, i) => ({
        id: `cov-${i}`,
        title: `כיסוי מספר ${i}`,
        details: "פרטים מפורטים על הכיסוי הזה כולל תנאים והחרגות שונות",
        copay: "50 ₪",
        maxReimbursement: "10,000 ₪",
      })),
    });
    const encrypted = encryptField(largeText);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(largeText);
  });
});

describe("JSON encryption/decryption", () => {
  it("should encrypt and decrypt a JSON object", () => {
    const obj = { provider: "בזק", amount: 150.50, items: ["אינטרנט", "טלפון"] };
    const encrypted = encryptJson(obj);
    expect(typeof encrypted).toBe("string");
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = decryptJson(encrypted);
    expect(decrypted).toEqual(obj);
  });

  it("should handle null input", () => {
    const result = encryptJson(null);
    expect(result).toBe("");
  });

  it("should handle undefined input", () => {
    const result = encryptJson(undefined);
    expect(result).toBe("");
  });

  it("should decrypt legacy unencrypted JSON", () => {
    const legacyJson = JSON.stringify({ provider: "test", amount: 100 });
    const result = decryptJson(legacyJson);
    expect(result).toEqual({ provider: "test", amount: 100 });
  });

  it("should return null for invalid encrypted data", () => {
    const result = decryptJson("not-valid-json-or-encrypted");
    expect(result).toBeNull();
  });
});

// ─── ENCRYPTION_KEY validation ─────────────────────────────────────────────

describe("ENCRYPTION_KEY environment variable", () => {
  it("should have ENCRYPTION_KEY set in environment", () => {
    // This validates that the secret was properly configured
    const key = process.env.ENCRYPTION_KEY;
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(0);
  });

  it("should produce valid encryption with the configured key", () => {
    const testData = "sensitive insurance data: פוליסה 12345";
    const encrypted = encryptField(testData);
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(testData);
  });
});

// ─── File Size Limit Tests ─────────────────────────────────────────────────

describe("File size limit middleware", () => {
  it("should allow normal-sized requests", () => {
    const req = createMockReq({
      headers: { "content-length": "1024" }, // 1KB
    });
    const res = createMockRes();
    const next = vi.fn();

    fileSizeLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._statusCode).toBe(200);
  });

  it("should allow requests up to 50MB", () => {
    const req = createMockReq({
      headers: { "content-length": String(49 * 1024 * 1024) }, // 49MB
    });
    const res = createMockRes();
    const next = vi.fn();

    fileSizeLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should block requests over 50MB", () => {
    const req = createMockReq({
      headers: { "content-length": String(51 * 1024 * 1024) }, // 51MB
    });
    const res = createMockRes();
    const next = vi.fn();

    fileSizeLimitMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(413);
    expect(res._body.error).toBe("Payload too large");
  });

  it("should allow requests with no content-length header", () => {
    const req = createMockReq({ headers: {} });
    const res = createMockRes();
    const next = vi.fn();

    fileSizeLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ─── Geo-blocking with Manus dev preview ──────────────────────────────────

describe("Geo-blocking Manus dev preview exemption", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should block non-IL IPs regardless of hostname", () => {
    const req = createMockReq({
      headers: {
        "x-forwarded-for": "1.2.3.4",
        host: "3000-abc123.sg1.manus.computer",
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });

  it("should block non-IL IPs on production domain", () => {
    const req = createMockReq({
      headers: {
        "x-forwarded-for": "1.2.3.4", // US IP
        host: "insurancedash-xhaymvtx.manus.space",
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });
});

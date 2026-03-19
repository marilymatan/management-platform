import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  geoBlockMiddleware,
  securityHeadersMiddleware,
  sanitizeHtml,
  hasSqlInjectionPatterns,
} from "./security";

// Mock geoip-country (replaces geoip-lite for IPv6 support)
vi.mock("geoip-country", () => ({
  default: {
    lookup: (ip: string) => {
      const geoMap: Record<string, { country: string } | null> = {
        "1.2.3.4": { country: "US" },
        "5.6.7.8": { country: "IL" },
        "9.10.11.12": { country: "BR" },
        "13.14.15.16": { country: "SG" },
        "200.200.200.200": null, // Unknown IP
        "2a00:a041:e010:900:3132:9cc9:1d84:5412": { country: "IL" }, // Israeli IPv6
        "2001:4860:4860::8888": { country: "US" }, // Google DNS IPv6
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

describe("Geo-blocking middleware", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("should allow requests from Israel", () => {
    const req = createMockReq({
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res._statusCode).toBe(200);
  });

  it("should block requests from US", () => {
    const req = createMockReq({
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
    expect(res._body.message).toContain("Israel");
  });

  it("should block requests from Brazil", () => {
    const req = createMockReq({
      headers: { "x-forwarded-for": "9.10.11.12" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });

  it("should block requests from Singapore", () => {
    const req = createMockReq({
      headers: { "x-forwarded-for": "13.14.15.16" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });

  it("should block unknown IPs", () => {
    const req = createMockReq({
      headers: { "x-forwarded-for": "200.200.200.200" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });

  it("should allow localhost/private IPs", () => {
    const req = createMockReq({
      ip: "127.0.0.1",
      headers: {},
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should allow private network IPs (192.168.x.x)", () => {
    const req = createMockReq({
      headers: { "x-forwarded-for": "192.168.1.100" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should skip geo-blocking in development mode", () => {
    process.env.NODE_ENV = "development";
    const req = createMockReq({
      headers: { "x-forwarded-for": "1.2.3.4" }, // US IP
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should skip geo-blocking for health check endpoint", () => {
    const req = createMockReq({
      path: "/api/health",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should allow Israeli IPv6 addresses via cf-connecting-ip", () => {
    const req = createMockReq({
      headers: { "cf-connecting-ip": "2a00:a041:e010:900:3132:9cc9:1d84:5412" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should block non-IL IPv6 addresses via cf-connecting-ip", () => {
    const req = createMockReq({
      headers: { "cf-connecting-ip": "2001:4860:4860::8888" },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });

  it("should prefer cf-connecting-ip over x-forwarded-for", () => {
    const req = createMockReq({
      headers: {
        "cf-connecting-ip": "5.6.7.8", // IL
        "x-forwarded-for": "1.2.3.4",  // US — should be ignored
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("should block non-IL IPs even with x-original-host header", () => {
    const req = createMockReq({
      headers: {
        "x-forwarded-for": "1.2.3.4",
        host: "bddsplhfze-yodbvlgx6a-uk.a.run.app",
        "x-original-host": "3000-abc123.sg1.manus.computer",
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });

  it("should NOT exempt manus.space from geo-blocking (production site must enforce geo-block)", () => {
    const req = createMockReq({
      headers: {
        "cf-connecting-ip": "1.2.3.4", // US IP
        host: "bddsplhfze-yodbvlgx6a-uk.a.run.app",
        "x-original-host": "insurancedash-xhaymvtx.manus.space",
      },
    });
    const res = createMockRes();
    const next = vi.fn();

    geoBlockMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._statusCode).toBe(403);
  });
});

describe("Security headers middleware", () => {
  it("should set all required security headers", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    securityHeadersMiddleware(req, res, next);

    expect(res._headers["X-Frame-Options"]).toBe("DENY");
    expect(res._headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(res._headers["X-XSS-Protection"]).toBe("1; mode=block");
    expect(res._headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(res._headers["Content-Security-Policy"]).toBeDefined();
    expect(res._headers["Permissions-Policy"]).toContain("camera=()");
    expect(next).toHaveBeenCalled();
  });

  it("should include frame-ancestors 'none' in CSP", () => {
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    securityHeadersMiddleware(req, res, next);

    expect(res._headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });
});

describe("sanitizeHtml", () => {
  it("should escape HTML special characters", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;&#x2F;script&gt;"
    );
  });

  it("should escape ampersands", () => {
    expect(sanitizeHtml("a & b")).toBe("a &amp; b");
  });

  it("should escape double quotes", () => {
    expect(sanitizeHtml('he said "hello"')).toBe("he said &quot;hello&quot;");
  });

  it("should handle empty strings", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("should handle strings without special characters", () => {
    expect(sanitizeHtml("Hello World")).toBe("Hello World");
  });
});

describe("hasSqlInjectionPatterns", () => {
  it("should detect SELECT injection", () => {
    expect(hasSqlInjectionPatterns("'; SELECT * FROM users --")).toBe(true);
  });

  it("should detect DROP TABLE injection", () => {
    expect(hasSqlInjectionPatterns("'; DROP TABLE users; --")).toBe(true);
  });

  it("should detect UNION injection", () => {
    expect(hasSqlInjectionPatterns("1 UNION SELECT password FROM users")).toBe(true);
  });

  it("should detect OR 1=1 injection", () => {
    expect(hasSqlInjectionPatterns("' OR 1=1 --")).toBe(true);
  });

  it("should detect SLEEP injection", () => {
    expect(hasSqlInjectionPatterns("'; SLEEP(5) --")).toBe(true);
  });

  it("should not flag normal text", () => {
    expect(hasSqlInjectionPatterns("Hello World")).toBe(false);
  });

  it("should not flag Hebrew text", () => {
    expect(hasSqlInjectionPatterns("שלום עולם")).toBe(false);
  });

  it("should not flag email addresses", () => {
    expect(hasSqlInjectionPatterns("user@example.com")).toBe(false);
  });
});

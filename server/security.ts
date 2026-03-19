import type { Request, Response, NextFunction, Express } from "express";
import geoip from "geoip-country";
import { audit } from "./auditLog";
import cors from "cors";

// ─── Geo-blocking: Israel only ──────────────────────────────────────────────

const ALLOWED_COUNTRIES = new Set(["IL"]); // Israel only

// Paths that should be exempt from geo-blocking (health checks, etc.)
const GEO_EXEMPT_PATHS = ["/api/health", "/api/oauth", "/api/gmail/callback", "/api/config"];

const GEO_EXEMPT_HOSTNAMES: string[] = [];

function getClientIp(req: Request): string {
  const cfIp = req.headers["cf-connecting-ip"];
  if (typeof cfIp === "string") {
    return cfIp.trim();
  }
  // x-forwarded-for: first IP is the original client
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string") {
    return realIp.trim();
  }
  return req.ip || req.socket.remoteAddress || "";
}

function getEffectiveHost(req: Request): string {
  const originalHost = req.headers["x-original-host"];
  if (typeof originalHost === "string") {
    return originalHost;
  }
  return req.headers.host || "";
}

function isPrivateIp(ip: string): boolean {
  // Allow localhost and private IPs (for development)
  return (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.20.") ||
    ip.startsWith("172.21.") ||
    ip.startsWith("172.22.") ||
    ip.startsWith("172.23.") ||
    ip.startsWith("172.24.") ||
    ip.startsWith("172.25.") ||
    ip.startsWith("172.26.") ||
    ip.startsWith("172.27.") ||
    ip.startsWith("172.28.") ||
    ip.startsWith("172.29.") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("169.254.") ||
    ip.startsWith("::ffff:10.") ||
    ip.startsWith("::ffff:172.") ||
    ip.startsWith("::ffff:192.168.") ||
    ip.startsWith("::ffff:169.254.")
  );
}

export function geoBlockMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip geo-blocking for exempt paths
  if (GEO_EXEMPT_PATHS.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  // Skip in development mode
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }

  // Skip geo-blocking for Manus dev preview hostnames
  // Use getEffectiveHost to handle CDN proxy (x-original-host header)
  const host = getEffectiveHost(req);
  if (GEO_EXEMPT_HOSTNAMES.some((h) => host.endsWith(h))) {
    next();
    return;
  }

  const ip = getClientIp(req);

  // Allow private/localhost IPs
  if (isPrivateIp(ip)) {
    next();
    return;
  }

  // Lookup country using geoip-country (supports both IPv4 and IPv6)
  const geo = geoip.lookup(ip);

  if (!geo || !ALLOWED_COUNTRIES.has(geo.country)) {
    const country = geo?.country || "UNKNOWN";
    console.warn(`[Security] Blocked request from ${country} (IP: ${ip}) to ${req.path}`);
    // Audit log geo-blocked request
    audit({
      action: "geo_blocked",
      resource: "security",
      ipAddress: ip,
      userAgent: req.headers["user-agent"] || undefined,
      details: JSON.stringify({ country, path: req.path }),
      status: "blocked",
    }).catch(() => {});
    res.status(403).json({
      error: "Access denied",
      message: "This service is only available in Israel.",
    });
    return;
  }

  next();
}

// ─── Security Headers ───────────────────────────────────────────────────────

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // XSS Protection (legacy browsers)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Referrer Policy
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions Policy - restrict dangerous features
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );

  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://accounts.google.com https://forge.butterfly-effect.dev",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://accounts.google.com https://generativelanguage.googleapis.com wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  // HSTS — only in production
  if (process.env.NODE_ENV !== "development") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  next();
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  });
}, 5 * 60 * 1000);

interface RateLimitOptions {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export function rateLimitMiddleware(options: RateLimitOptions & { perRoute?: boolean }) {
  const { windowMs, maxRequests, perRoute = false } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const routeKey = perRoute ? `${req.baseUrl}${req.path}` : (req.baseUrl || req.path);
    const key = `${ip}:${routeKey}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
      next();
      return;
    }

    entry.count++;

    if (entry.count > maxRequests) {
      const logKey = `ratelimit:${key}`;
      const lastLog = rateLimitStore.get(logKey);
      if (!lastLog || lastLog.resetAt < now) {
        console.warn(`[Security] Rate limit exceeded for IP: ${ip} on ${req.path} (${entry.count} reqs)`);
        rateLimitStore.set(logKey, { count: 1, resetAt: now + 10_000 });
      }
      audit({
        action: "rate_limited",
        resource: "security",
        ipAddress: ip,
        userAgent: req.headers["user-agent"] || undefined,
        details: JSON.stringify({ path: req.path, count: entry.count }),
        status: "blocked",
      }).catch(() => {});
      res.status(429).json({
        error: "Too many requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

// ─── Input Sanitization Helper ──────────────────────────────────────────────

/**
 * Sanitize a string to prevent XSS attacks.
 * Escapes HTML special characters.
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Check if a string contains potential SQL injection patterns.
 * This is a defense-in-depth measure — Drizzle ORM already uses parameterized queries.
 */
export function hasSqlInjectionPatterns(input: string): boolean {
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(';|";|`)/,
    /(\b(SLEEP|BENCHMARK|WAITFOR)\b\s*\()/i,
  ];
  return patterns.some((p) => p.test(input));
}

// ─── Register all security middleware ────────────────────────────────────────

// ─── CORS Whitelist ────────────────────────────────────────────────────────

const ALLOWED_ORIGINS: Array<string | RegExp> = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /\.up\.railway\.app$/,
];

if (process.env.APP_URL) {
  ALLOWED_ORIGINS.push(process.env.APP_URL);
}

// ─── File Size Limits ──────────────────────────────────────────────────────

const MAX_JSON_BODY_SIZE = "10mb";  // For API requests
const MAX_FILE_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB per file

export function fileSizeLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const contentLength = parseInt(req.headers["content-length"] || "0", 10);
  // Block excessively large requests (50MB total)
  if (contentLength > 50 * 1024 * 1024) {
    res.status(413).json({
      error: "Payload too large",
      message: "Request body exceeds the maximum allowed size (50MB).",
    });
    return;
  }
  next();
}

export function registerSecurityMiddleware(app: Express): void {
  // 0. CORS whitelist — only allow requests from our domains
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }
        const isAllowed = ALLOWED_ORIGINS.some((allowed) =>
          typeof allowed === "string" ? allowed === origin : allowed.test(origin)
        );
        if (isAllowed) {
          callback(null, true);
        } else {
          console.warn(`[Security] CORS blocked origin: ${origin}`);
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  // 1. Security headers on all responses
  app.use(securityHeadersMiddleware);

  // 1.5. File size limit
  app.use(fileSizeLimitMiddleware);

  // 2. Geo-blocking: Israel only (production)
  app.use(geoBlockMiddleware);

  // 3. Rate limiting on API endpoints (per-route so one procedure can't starve others)
  app.use(
    "/api/trpc",
    rateLimitMiddleware({
      windowMs: 60 * 1000,
      maxRequests: 120,
      perRoute: true,
    })
  );

  // 4. Stricter rate limiting on auth endpoints
  app.use(
    "/api/oauth",
    rateLimitMiddleware({
      windowMs: 60 * 1000,
      maxRequests: 10,        // 10 auth attempts per minute
    })
  );

  // 5. Stricter rate limiting on Gmail callback
  app.use(
    "/api/gmail",
    rateLimitMiddleware({
      windowMs: 60 * 1000,
      maxRequests: 10,
    })
  );

  // 6. Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  console.log("[Security] All security middleware registered");
}

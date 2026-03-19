import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { registerOAuthRoutes } from "./oauth";
import { registerGmailCallbackRoute } from "../gmailCallback";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerSecurityMiddleware } from "../security";
import { ENV } from "./env";
import { verifyFileSignature } from "../storage";

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn("[Migrate] DATABASE_URL not set, skipping migrations");
    return;
  }
  try {
    const db = drizzle(process.env.DATABASE_URL);

    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const existing = await db.execute(
      sql`SELECT count(*)::int as cnt FROM "drizzle"."__drizzle_migrations"`
    );
    const count = (existing.rows[0] as any)?.cnt ?? 0;

    if (count === 0) {
      const alreadyApplied = [
        { hash: "d44a864d46ccc0cb528b32ccceb823a3ca15b497c2f01a168b211a7e09f6e3e4", when: 1773946209358 },
        { hash: "88b794cb33faeae8a30e62f7770479e05520693869d7ad5faf8b0d107ef12503", when: 1773947415674 },
        { hash: "598c7bc6eb7a745152b6028f1bc6816f0ee304568a5933011d08e42c3413f5de", when: 1773952814543 },
      ];
      for (const m of alreadyApplied) {
        await db.execute(
          sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${m.hash}, ${m.when})`
        );
      }
      console.log("[Migrate] Seeded migration tracking for 3 pre-existing migrations");
    }

    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    await migrate(db, { migrationsFolder });
    console.log("[Migrate] Migrations applied successfully");
  } catch (error) {
    console.error("[Migrate] Migration failed:", error);
  }
}

async function startServer() {
  console.log("[Boot] Starting server...");
  await runMigrations();
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  registerSecurityMiddleware(app);

  app.get("/api/config", (_req, res) => {
    res.json({ googleClientId: ENV.googleClientId });
  });

  registerOAuthRoutes(app);
  registerGmailCallbackRoute(app);

  const storagePath = path.resolve(ENV.storagePath || "./data/uploads");
  app.use(
    "/api/files",
    (req: Request, res: Response, next: NextFunction) => {
      const token = req.query.token as string | undefined;
      const exp = req.query.exp as string | undefined;
      if (!token || !exp) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
      const fileKey = decodeURIComponent(req.path.replace(/^\/+/, ""));
      if (!verifyFileSignature(fileKey, token, exp)) {
        res.status(403).json({ error: "Invalid or expired file token" });
        return;
      }
      next();
    },
    express.static(storagePath)
  );

  app.use(
    "/api/trpc",
    express.json({ limit: "50mb" }),
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        console.error(`[tRPC] ${path}:`, error.code, error.message, error.cause || "");
      },
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, "0.0.0.0", () => {
    console.log(`[Boot] Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch((err) => {
  console.error("[Boot] Fatal error:", err);
  process.exit(1);
});

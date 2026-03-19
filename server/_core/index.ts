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

    const colCheck = await db.execute(sql`
      SELECT count(*)::int as cnt FROM information_schema.columns
      WHERE table_name = 'analyses' AND column_name = 'insurance_category'
    `);
    const hasInsuranceCategory = ((colCheck.rows[0] as any)?.cnt ?? 0) > 0;

    if (!hasInsuranceCategory) {
      console.log("[Migrate] Applying missing migration 0002 (insurance_category)...");
      await db.execute(sql`DO $$ BEGIN CREATE TYPE "public"."insurance_category_type" AS ENUM('health', 'life', 'car', 'home'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
      await db.execute(sql`ALTER TABLE "analyses" ADD COLUMN "insurance_category" "insurance_category_type"`);
      console.log("[Migrate] Migration 0002 applied");
    }

    const allMigrations = [
      { hash: "d44a864d46ccc0cb528b32ccceb823a3ca15b497c2f01a168b211a7e09f6e3e4", when: 1773946209358 },
      { hash: "88b794cb33faeae8a30e62f7770479e05520693869d7ad5faf8b0d107ef12503", when: 1773947415674 },
      { hash: "598c7bc6eb7a745152b6028f1bc6816f0ee304568a5933011d08e42c3413f5de", when: 1773952814543 },
      { hash: "580f14d6fe5881adc181e598a2e556d5722b30196080cb2c502c65089470b9e3", when: 1773953361210 },
      { hash: "1f86269cd68cc53cc50f8531b3d1775e1c8b01d3dc14f15efa7623bb4dc931f8", when: 1773954322547 },
      { hash: "598c769587b4cd5981fa6db3cd80a51367ca5742670281836548f076ddc3c921", when: 1773955965766 },
    ];

    const tracked = await db.execute(
      sql`SELECT count(*)::int as cnt FROM "drizzle"."__drizzle_migrations"`
    );
    const trackedCount = ((tracked.rows[0] as any)?.cnt ?? 0);

    if (trackedCount < allMigrations.length) {
      await db.execute(sql`TRUNCATE "drizzle"."__drizzle_migrations"`);
      for (const m of allMigrations) {
        await db.execute(
          sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${m.hash}, ${m.when})`
        );
      }
      console.log("[Migrate] Synced migration tracking (" + allMigrations.length + " migrations)");
    }

    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    await migrate(db, { migrationsFolder });
    console.log("[Migrate] Migrations up to date");
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

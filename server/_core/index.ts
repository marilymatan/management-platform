import "dotenv/config";
import crypto from "crypto";
import express from "express";
import fs from "fs";
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
import { policyAnalysisWorker } from "../policyAnalysisWorker";
import { registerPolicyUploadRoute } from "../policyUploadRoute";
import { registerSecurityMiddleware } from "../security";
import { ENV } from "./env";
import { verifyFileSignature } from "../storage";
import {
  ensureLegacySchemaCompatibility,
  hasExistingCoreSchema,
  shouldSyncMigrationTracking,
} from "../schemaCompatibility";

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

    await ensureLegacySchemaCompatibility(db);

    const journalPath = path.resolve(process.cwd(), "drizzle/meta/_journal.json");
    const migrationJournal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const allMigrations = migrationJournal.entries.map((entry) => {
      const migrationPath = path.resolve(process.cwd(), "drizzle", `${entry.tag}.sql`);
      const hash = crypto
        .createHash("sha256")
        .update(fs.readFileSync(migrationPath))
        .digest("hex");
      return { hash, when: entry.when };
    });

    const tracked = await db.execute(
      sql`SELECT count(*)::int as cnt FROM "drizzle"."__drizzle_migrations"`
    );
    const trackedCount = ((tracked.rows[0] as any)?.cnt ?? 0);

    const existingCoreSchema = await hasExistingCoreSchema(db);

    if (shouldSyncMigrationTracking(trackedCount, existingCoreSchema)) {
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

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/trpc")) return next();
    express.json({ limit: "5mb" })(req, res, next);
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api/trpc")) return next();
    express.urlencoded({ limit: "5mb", extended: true })(req, res, next);
  });

  registerSecurityMiddleware(app);

  app.get("/api/config", (_req, res) => {
    res.json({ googleClientId: ENV.googleClientId });
  });

  registerOAuthRoutes(app);
  registerGmailCallbackRoute(app);
  registerPolicyUploadRoute(app);

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

  policyAnalysisWorker.start();

  server.listen(port, "0.0.0.0", () => {
    console.log(`[Boot] Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch((err) => {
  console.error("[Boot] Fatal error:", err);
  process.exit(1);
});

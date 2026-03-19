import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGmailCallbackRoute } from "../gmailCallback";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerSecurityMiddleware } from "../security";
import { ENV } from "./env";
import { verifyFileSignature } from "../storage";

async function startServer() {
  console.log("[Boot] Starting server...");
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

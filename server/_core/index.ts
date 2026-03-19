import "dotenv/config";
import express from "express";
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

async function startServer() {
  console.log("[Boot] Starting server...");
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", true);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerSecurityMiddleware(app);
  app.get("/api/config", (_req, res) => {
    res.json({ googleClientId: ENV.googleClientId });
  });
  registerOAuthRoutes(app);
  registerGmailCallbackRoute(app);
  const storagePath = path.resolve(ENV.storagePath || "./data/uploads");
  app.use("/api/files", express.static(storagePath));
  app.use(
    "/api/trpc",
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

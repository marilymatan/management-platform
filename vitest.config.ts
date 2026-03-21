import { defineConfig } from "vitest/config";
import path from "path";
import { config } from "dotenv";

config({ path: path.resolve(import.meta.dirname, ".env") });

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      include: [
        "client/src/lib/analysisView.ts",
        "client/src/lib/familyCoverage.ts",
        "client/src/lib/insuranceOverview.ts",
        "server/analysisCleanup.ts",
        "server/auditLog.ts",
        "server/gmailCallback.ts",
        "server/gmailInsuranceDiscovery.ts",
        "server/invoiceSummary.ts",
        "shared/insurance.ts",
        "shared/scanNotificationTransitions.ts",
      ],
      thresholds: {
        lines: 95,
        statements: 95,
        functions: 95,
        branches: 90,
      },
    },
  },
});

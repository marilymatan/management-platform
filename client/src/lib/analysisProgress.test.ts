import { describe, expect, it } from "vitest";
import { summarizeAnalysisQueue } from "./analysisProgress";

describe("summarizeAnalysisQueue", () => {
  it("aggregates file progress across multiple in-flight analyses", () => {
    const summary = summarizeAnalysisQueue([
      {
        sessionId: "s-1",
        status: "processing",
        files: new Array(8).fill({}),
        processedFileCount: 3,
        activeBatchFileCount: 3,
      },
      {
        sessionId: "s-2",
        status: "pending",
        files: new Array(2).fill({}),
      },
    ]);

    expect(summary).toMatchObject({
      inFlightCount: 2,
      processingCount: 1,
      pendingCount: 1,
      totalFiles: 10,
      visibleFiles: 6,
      progressPercent: 60,
      firstSessionId: "s-1",
    });
  });
});

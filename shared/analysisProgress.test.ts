import { describe, expect, it } from "vitest";
import { getAnalysisProgressSnapshot } from "./analysisProgress";

describe("analysisProgress", () => {
  it("falls back to the batch size when a processing analysis has no persisted progress yet", () => {
    const snapshot = getAnalysisProgressSnapshot({
      status: "processing",
      files: new Array(8).fill({}),
    });

    expect(snapshot).toMatchObject({
      totalFiles: 8,
      visibleFileCount: 3,
      progressPercent: 37.5,
    });
  });

  it("uses persisted batch progress when the worker reports it", () => {
    const snapshot = getAnalysisProgressSnapshot({
      status: "processing",
      files: new Array(8).fill({}),
      processedFileCount: 3,
      activeBatchFileCount: 3,
    });

    expect(snapshot).toMatchObject({
      totalFiles: 8,
      processedFileCount: 3,
      activeBatchFileCount: 3,
      visibleFileCount: 6,
      progressPercent: 75,
    });
  });
});

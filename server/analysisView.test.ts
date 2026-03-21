import { describe, expect, it } from "vitest";
import { buildAnalysisViewUrl, getAnalysisCoveragePreset, pickAnalysisViewFileFilter } from "@/lib/analysisView";

describe("analysisView", () => {
  it("returns a preset coverage category only for car analyses", () => {
    expect(getAnalysisCoveragePreset("car")).toBe("רכב");
    expect(getAnalysisCoveragePreset("health")).toBeNull();
  });

  it("prefers the unique car source file when opening a car analysis", () => {
    expect(
      pickAnalysisViewFileFilter({
        insuranceCategory: "car",
        coverages: [
          { category: "רכב", sourceFile: "car-policy.pdf" },
          { category: "רכב", sourceFile: "car-policy.pdf" },
          { category: "אשפוז", sourceFile: "health-policy.pdf" },
        ],
      })
    ).toBe("car-policy.pdf");
  });

  it("prefers the explicit policy name when it matches an available source file", () => {
    expect(
      pickAnalysisViewFileFilter({
        preferredPolicyName: "  selected.pdf  ",
        coverages: [
          { category: "רכב", sourceFile: "selected.pdf" },
          { category: "רכב", sourceFile: "other.pdf" },
        ],
      })
    ).toBe("selected.pdf");
  });

  it("falls back to the only available source file when there is no preset", () => {
    expect(
      pickAnalysisViewFileFilter({
        insuranceCategory: "health",
        coverages: [
          { category: "אשפוז", sourceFile: "single.pdf" },
          { category: "שיניים", sourceFile: "single.pdf" },
        ],
      })
    ).toBe("single.pdf");
  });

  it("returns null when there is no single obvious file to focus on", () => {
    expect(
      pickAnalysisViewFileFilter({
        insuranceCategory: "health",
        coverages: [
          { category: "אשפוז", sourceFile: "a.pdf" },
          { category: "שיניים", sourceFile: "b.pdf" },
        ],
      })
    ).toBeNull();
  });

  it("builds a car analysis URL with the coverage preset even without a file match", () => {
    expect(
      buildAnalysisViewUrl({
        sessionId: "session-1",
        preferredPolicyName: "פוליסת רכב",
        insuranceCategory: "car",
        coverages: [
          { category: "רכב", sourceFile: "car-a.pdf" },
          { category: "רכב", sourceFile: "car-b.pdf" },
          { category: "אשפוז", sourceFile: "health.pdf" },
        ],
      })
    ).toBe("/insurance/session-1?coverageCategory=%D7%A8%D7%9B%D7%91");
  });

  it("builds a URL with both file and coverage preset when a single car file is detected", () => {
    expect(
      buildAnalysisViewUrl({
        sessionId: "session-2",
        insuranceCategory: "car",
        coverages: [
          { category: "רכב", sourceFile: "car-policy.pdf" },
          { category: "רכב", sourceFile: "car-policy.pdf" },
        ],
      })
    ).toBe("/insurance/session-2?file=car-policy.pdf&coverageCategory=%D7%A8%D7%9B%D7%91");
  });

  it("ignores empty source file values and returns a plain URL when there are no filters", () => {
    expect(
      pickAnalysisViewFileFilter({
        coverages: [
          { category: "רכב" },
          { category: "רכב", sourceFile: "   " },
        ],
      })
    ).toBeNull();

    expect(
      buildAnalysisViewUrl({
        sessionId: "session-3",
      })
    ).toBe("/insurance/session-3");
  });
});

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
});

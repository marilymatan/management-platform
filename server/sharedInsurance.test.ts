import { describe, expect, it } from "vitest";
import { inferInsuranceCategory } from "@shared/insurance";

describe("shared insurance helpers", () => {
  it("infers car insurance from the policy type", () => {
    expect(inferInsuranceCategory("ביטוח רכב מקיף")).toBe("car");
  });

  it("infers home insurance from coverage text", () => {
    expect(
      inferInsuranceCategory(undefined, [
        {
          id: "1",
          title: "נזקי צנרת",
          category: "מבנה",
          limit: "",
          details: "",
          eligibility: "",
          copay: "",
          maxReimbursement: "",
          exclusions: "",
          waitingPeriod: "",
        },
      ])
    ).toBe("home");
  });

  it("infers life insurance from policy wording", () => {
    expect(inferInsuranceCategory("ריסק ואובדן כושר עבודה")).toBe("life");
  });

  it("falls back to health when no stronger signal exists", () => {
    expect(
      inferInsuranceCategory(undefined, [
        {
          id: "1",
          title: "רפואה משלימה",
          category: "בריאות",
          limit: "",
          details: "",
          eligibility: "",
          copay: "",
          maxReimbursement: "",
          exclusions: "",
          waitingPeriod: "",
        },
      ])
    ).toBe("health");
  });
});

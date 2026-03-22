import { describe, expect, it } from "vitest";
import {
  INSURANCE_ANALYSIS_VERSION,
  inferInsuranceCategory,
  mergeNormalizedPolicyAnalyses,
  normalizePolicyAnalysis,
} from "@shared/insurance";

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

  it("upgrades a legacy flat analysis into policy coverage and clause hierarchy", () => {
    const normalized = normalizePolicyAnalysis({
      summary: "פוליסת בריאות ותיקה.",
      generalInfo: {
        policyName: "בריאות ישנה",
        insurerName: "הראל",
        policyNumber: "LEG-1",
        policyType: "ביטוח בריאות",
        insuranceCategory: "health",
        monthlyPremium: "120",
        annualPremium: "1440",
        startDate: "01/01/2026",
        endDate: "31/12/2026",
        importantNotes: [],
        fineprint: [],
      },
      coverages: [
        {
          id: "legacy-cov-1",
          title: "אמבולטורי",
          category: "בריאות",
          limit: "עד 5,000 ש\"ח",
          details: "כיסוי לטיפולים אמבולטוריים.",
          eligibility: "למבוטחים קיימים",
          copay: "50 ש\"ח",
          maxReimbursement: "5,000 ש\"ח",
          exclusions: "ללא חריגים מיוחדים",
          waitingPeriod: "30 יום",
          sourceFile: "legacy.pdf",
        },
      ],
      duplicateCoverages: [
        {
          id: "dup-1",
          title: "אמבולטורי",
          coverageIds: ["legacy-cov-1"],
          sourceFiles: ["legacy.pdf"],
          explanation: "נראתה חפיפה בכיסוי האמבולטורי.",
          recommendation: "כדאי להשוות בין הכיסויים לפני שמחליטים מה להשאיר.",
        },
      ],
    });

    expect(normalized.analysisVersion).toBe(INSURANCE_ANALYSIS_VERSION);
    expect(normalized.requiresReanalysis).toBe(true);
    expect(normalized.policies).toHaveLength(1);
    expect(normalized.coverageOverlapGroups).toHaveLength(1);
    expect(normalized.coverages).toHaveLength(1);
    expect(normalized.policies[0]?.coverages[0]?.clauses.map((clause) => clause.kind)).toEqual(
      expect.arrayContaining([
        "benefit_detail",
        "eligibility",
        "limit",
        "copay",
        "max_reimbursement",
        "exclusion",
        "waiting_period",
      ])
    );
  });

  it("derives policy-level overlap only when at least two coverages overlap across policies", () => {
    const normalized = normalizePolicyAnalysis({
      summary: "שתי פוליסות עם חפיפה רחבה.",
      policies: [
        {
          id: "policy-a",
          summary: "פוליסה א",
          sourceFiles: ["a.pdf"],
          generalInfo: {
            policyName: "בריאות א",
            insurerName: "הראל",
            policyNumber: "PA-1",
            policyType: "ביטוח בריאות",
            insuranceCategory: "health",
            premiumPaymentPeriod: "monthly",
            monthlyPremium: "100",
            annualPremium: "1200",
            startDate: "01/01/2026",
            endDate: "31/12/2026",
            importantNotes: [],
            fineprint: [],
          },
          coverages: [
            {
              id: "a-1",
              policyId: "policy-a",
              title: "אמבולטורי",
              category: "בריאות",
              summary: "כיסוי אמבולטורי א",
              sourceFile: "a.pdf",
              clauses: [
                {
                  id: "a-1-clause",
                  kind: "benefit_detail",
                  title: "פירוט הכיסוי",
                  text: "כיסוי אמבולטורי א",
                },
              ],
            },
            {
              id: "a-2",
              policyId: "policy-a",
              title: "ניתוחים פרטיים",
              category: "ניתוח",
              summary: "כיסוי ניתוחים א",
              sourceFile: "a.pdf",
              clauses: [
                {
                  id: "a-2-clause",
                  kind: "benefit_detail",
                  title: "פירוט הכיסוי",
                  text: "כיסוי ניתוחים א",
                },
              ],
            },
          ],
        },
        {
          id: "policy-b",
          summary: "פוליסה ב",
          sourceFiles: ["b.pdf"],
          generalInfo: {
            policyName: "בריאות ב",
            insurerName: "מגדל",
            policyNumber: "PB-1",
            policyType: "ביטוח בריאות",
            insuranceCategory: "health",
            premiumPaymentPeriod: "monthly",
            monthlyPremium: "180",
            annualPremium: "2160",
            startDate: "01/01/2026",
            endDate: "31/12/2026",
            importantNotes: [],
            fineprint: [],
          },
          coverages: [
            {
              id: "b-1",
              policyId: "policy-b",
              title: "אמבולטורי",
              category: "בריאות",
              summary: "כיסוי אמבולטורי ב",
              sourceFile: "b.pdf",
              clauses: [
                {
                  id: "b-1-clause",
                  kind: "benefit_detail",
                  title: "פירוט הכיסוי",
                  text: "כיסוי אמבולטורי ב",
                },
              ],
            },
            {
              id: "b-2",
              policyId: "policy-b",
              title: "ניתוחים פרטיים",
              category: "ניתוח",
              summary: "כיסוי ניתוחים ב",
              sourceFile: "b.pdf",
              clauses: [
                {
                  id: "b-2-clause",
                  kind: "benefit_detail",
                  title: "פירוט הכיסוי",
                  text: "כיסוי ניתוחים ב",
                },
              ],
            },
          ],
        },
      ],
      coverageOverlapGroups: [
        {
          id: "overlap-1",
          title: "אמבולטורי",
          coverageRefs: [
            { policyId: "policy-a", coverageId: "a-1" },
            { policyId: "policy-b", coverageId: "b-1" },
          ],
          matchedClauseIdsByCoverage: {
            "a-1": ["a-1-clause"],
            "b-1": ["b-1-clause"],
          },
          explanation: "כיסוי אמבולטורי דומה.",
          recommendation: "כדאי להשוות.",
        },
        {
          id: "overlap-2",
          title: "ניתוחים פרטיים",
          coverageRefs: [
            { policyId: "policy-a", coverageId: "a-2" },
            { policyId: "policy-b", coverageId: "b-2" },
          ],
          matchedClauseIdsByCoverage: {
            "a-2": ["a-2-clause"],
            "b-2": ["b-2-clause"],
          },
          explanation: "גם כיסוי הניתוחים דומה.",
          recommendation: "כדאי להשוות.",
        },
      ],
    });

    expect(normalized.policyOverlapGroups).toHaveLength(1);
    expect(normalized.policyOverlapGroups[0]?.overlapRatio).toBe(1);
    expect(normalized.policyOverlapGroups[0]?.coverageOverlapGroupIds).toEqual([
      "overlap-1",
      "overlap-2",
    ]);
  });

  it("merges normalized analyses by canonical policy identity", () => {
    const first = normalizePolicyAnalysis({
      summary: "חלק ראשון",
      policies: [
        {
          summary: "פוליסה חלק ראשון",
          sourceFiles: ["a.pdf"],
          generalInfo: {
            policyName: "בריאות מאוחדת",
            insurerName: "הראל",
            policyNumber: "MERGE-1",
            policyType: "ביטוח בריאות",
            insuranceCategory: "health",
            premiumPaymentPeriod: "monthly",
            monthlyPremium: "120",
            annualPremium: "1440",
            startDate: "01/01/2026",
            endDate: "31/12/2026",
            importantNotes: [],
            fineprint: [],
          },
          coverages: [
            {
              title: "אמבולטורי",
              category: "בריאות",
              summary: "כיסוי אמבולטורי",
              sourceFile: "a.pdf",
              clauses: [
                {
                  kind: "benefit_detail",
                  title: "פירוט הכיסוי",
                  text: "כיסוי אמבולטורי",
                },
              ],
            },
          ],
        },
      ],
    });
    const second = normalizePolicyAnalysis({
      summary: "חלק שני",
      policies: [
        {
          summary: "פוליסה חלק שני",
          sourceFiles: ["b.pdf"],
          generalInfo: {
            policyName: "בריאות מאוחדת",
            insurerName: "הראל",
            policyNumber: "MERGE-1",
            policyType: "ביטוח בריאות",
            insuranceCategory: "health",
            premiumPaymentPeriod: "monthly",
            monthlyPremium: "120",
            annualPremium: "1440",
            startDate: "01/01/2026",
            endDate: "31/12/2026",
            importantNotes: [],
            fineprint: [],
          },
          coverages: [
            {
              title: "תרופות מחוץ לסל",
              category: "תרופות",
              summary: "כיסוי תרופות",
              sourceFile: "b.pdf",
              clauses: [
                {
                  kind: "benefit_detail",
                  title: "פירוט הכיסוי",
                  text: "כיסוי תרופות",
                },
              ],
            },
          ],
        },
      ],
    });

    const merged = mergeNormalizedPolicyAnalyses([first, second]);

    expect(merged.policies).toHaveLength(1);
    expect(merged.policies[0]?.sourceFiles).toEqual(["a.pdf", "b.pdf"]);
    expect(merged.policies[0]?.coverages).toHaveLength(2);
  });
});

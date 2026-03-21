import { describe, expect, it } from "vitest";
import {
  buildActionItemsDraft,
  buildInsuranceScoreSnapshot,
  buildManualPolicyAnalysis,
  buildMonthlyReportDraft,
  buildSavingsReportDraft,
  buildWorkspaceDataHash,
} from "./insuranceHub";

const baseAnalyses = [
  {
    sessionId: "health-1",
    status: "completed",
    createdAt: new Date("2026-03-10T10:00:00.000Z"),
    insuranceCategory: "health" as const,
    files: [{ name: "health.pdf", fileKey: "policies/health.pdf" }],
    analysisResult: {
      generalInfo: {
        policyName: "בריאות משפחתית",
        insurerName: "הראל",
        policyNumber: "123",
        policyType: "בריאות",
        insuranceCategory: "health" as const,
        monthlyPremium: "210",
        annualPremium: "2520",
        startDate: "01/01/2026",
        endDate: "01/12/2026",
        importantNotes: [],
        fineprint: [],
      },
      summary: "פוליסת בריאות פעילה",
      coverages: [
        {
          id: "cov-1",
          title: "אמבולטורי",
          category: "בריאות",
          limit: "לא צוין",
          details: "כולל שירותים אמבולטוריים",
          eligibility: "מבוטחים",
          copay: "לא צוין",
          maxReimbursement: "לא צוין",
          exclusions: "לא צוין",
          waitingPeriod: "לא צוין",
        },
      ],
      duplicateCoverages: [
        {
          id: "dup-1",
          title: "אמבולטורי",
          coverageIds: ["cov-1"],
          sourceFiles: ["health.pdf"],
          explanation: "נראה שיש כיסוי חופף במסלול נוסף",
          recommendation: "כדאי לבדוק אם אפשר לצמצם כפילות",
        },
      ],
      personalizedInsights: [
        {
          id: "warn-1",
          type: "warning" as const,
          title: "בדיקת חידוש",
          description: "הפוליסה מתקרבת לחידוש",
          priority: "high" as const,
        },
      ],
    },
  },
];

describe("insuranceHub", () => {
  it("buildSavingsReportDraft surfaces duplicate and premium-change opportunities", () => {
    const report = buildSavingsReportDraft({
      analyses: baseAnalyses,
      profile: {
        maritalStatus: "married",
        numberOfChildren: 2,
        ownsApartment: true,
        hasActiveMortgage: true,
        numberOfVehicles: 1,
      },
      insuranceDiscoveries: [
        {
          id: 1,
          provider: "הראל",
          insuranceCategory: "health",
          artifactType: "premium_notice",
          premiumAmount: 285,
          documentDate: new Date("2026-03-18T00:00:00.000Z"),
        },
      ],
      invoices: [],
    });

    expect(report.opportunities.some((opportunity) => opportunity.type === "duplicate")).toBe(true);
    expect(report.opportunities.some((opportunity) => opportunity.type === "overpriced")).toBe(true);
    expect(report.totalMonthlySaving).toBeGreaterThan(0);
  });

  it("buildInsuranceScoreSnapshot returns a bounded score with savings", () => {
    const snapshot = buildInsuranceScoreSnapshot({
      analyses: baseAnalyses,
      profile: {
        maritalStatus: "married",
        numberOfChildren: 2,
        ownsApartment: true,
        hasActiveMortgage: true,
        numberOfVehicles: 1,
      },
      familyMembers: [
        {
          id: 10,
          fullName: "רן ישראלי",
          relation: "spouse",
        },
      ],
      insuranceDiscoveries: [
        {
          id: 1,
          artifactType: "renewal_notice",
          provider: "הראל",
        },
      ],
      invoices: [
        {
          provider: "הראל",
          category: "ביטוח",
          amount: "210",
          invoiceDate: new Date("2026-03-01T00:00:00.000Z"),
          flowDirection: "expense",
        },
      ],
      potentialSavings: 75,
    });

    expect(snapshot.score).toBeGreaterThanOrEqual(0);
    expect(snapshot.score).toBeLessThanOrEqual(100);
    expect(snapshot.potentialSavings).toBe(75);
    expect(snapshot.totalMonthlySpend).toBeGreaterThan(0);
  });

  it("buildMonthlyReportDraft detects changes between months", () => {
    const report = buildMonthlyReportDraft({
      invoices: [
        {
          provider: "הראל",
          category: "ביטוח",
          amount: "210",
          invoiceDate: new Date("2026-02-03T00:00:00.000Z"),
          flowDirection: "expense",
        },
        {
          provider: "הראל",
          category: "ביטוח",
          amount: "285",
          invoiceDate: new Date("2026-03-03T00:00:00.000Z"),
          flowDirection: "expense",
        },
        {
          provider: "מנורה",
          category: "ביטוח",
          amount: "99",
          invoiceDate: new Date("2026-03-09T00:00:00.000Z"),
          flowDirection: "expense",
        },
      ],
      currentScore: 74,
      previousScore: 68,
    });

    expect(report.month).toBe("2026-03");
    expect(report.changes.some((change) => change.type === "amount_change")).toBe(true);
    expect(report.changes.some((change) => change.type === "new_charge")).toBe(true);
    expect(report.scoreChange).toBe(6);
  });

  it("buildManualPolicyAnalysis creates a usable lightweight analysis", () => {
    const analysis = buildManualPolicyAnalysis({
      company: "מגדל",
      category: "life",
      monthlyPremium: 120,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      coveredMembers: ["רן ישראלי", "נועה ישראלי"],
    });

    expect(analysis.generalInfo.insurerName).toBe("מגדל");
    expect(analysis.generalInfo.insuranceCategory).toBe("life");
    expect(analysis.coverages.length).toBe(1);
    expect(analysis.generalInfo.importantNotes[0]).toContain("רן ישראלי");
  });

  it("buildSavingsReportDraft tracks completed savings and unmatched premium notices", () => {
    const report = buildSavingsReportDraft({
      analyses: baseAnalyses,
      profile: {
        maritalStatus: "married",
        numberOfChildren: 2,
        ownsApartment: false,
        hasActiveMortgage: false,
        numberOfVehicles: 0,
      },
      insuranceDiscoveries: [
        {
          id: 8,
          provider: "מנורה",
          insuranceCategory: "car",
          artifactType: "premium_notice",
          premiumAmount: 132,
        },
      ],
      previousStatuses: {
        "duplicate-health-1-1": "completed",
      },
    });

    expect(report.savedSoFar).toBeGreaterThan(0);
    expect(report.opportunities.some((opportunity) => opportunity.opportunityKey === "orphan-premium-8")).toBe(true);
  });

  it("buildActionItemsDraft combines savings renewals gaps and monitoring signals", () => {
    const renewingAnalyses = [
      {
        ...baseAnalyses[0],
        analysisResult: {
          ...baseAnalyses[0].analysisResult,
          generalInfo: {
            ...baseAnalyses[0].analysisResult.generalInfo,
            endDate: "01/04/2026",
          },
        },
      },
    ];

    const savings = buildSavingsReportDraft({
      analyses: renewingAnalyses,
      profile: {
        maritalStatus: "married",
        numberOfChildren: 2,
        ownsApartment: true,
        hasActiveMortgage: true,
        numberOfVehicles: 1,
      },
      insuranceDiscoveries: [
        {
          id: 1,
          provider: "הראל",
          insuranceCategory: "health",
          artifactType: "premium_notice",
          premiumAmount: 285,
        },
      ],
    });

    const actions = buildActionItemsDraft({
      opportunities: savings.opportunities.slice(0, 2),
      analyses: renewingAnalyses,
      profile: {
        maritalStatus: "married",
        numberOfChildren: 2,
        ownsApartment: true,
        hasActiveMortgage: true,
        numberOfVehicles: 1,
      },
      monitoringChanges: [
        {
          id: "chg-1",
          type: "amount_change",
          provider: "הראל",
          summary: "החיוב השתנה",
          currentAmount: 285,
          previousAmount: 210,
          month: "2026-03",
        },
      ],
      previousStatuses: {
        [`savings-${savings.opportunities[0].opportunityKey}`]: "completed",
      },
    });

    expect(actions.some((action) => action.type === "savings")).toBe(true);
    expect(actions.some((action) => action.type === "renewal")).toBe(true);
    expect(actions.some((action) => action.type === "gap")).toBe(true);
    expect(actions.some((action) => action.type === "monitoring")).toBe(true);
    expect(actions[0].priority).toBe("high");
    expect(actions.find((action) => action.type === "monitoring")?.potentialSaving).toBe(75);
  });

  it("buildMonthlyReportDraft explains when there is not enough history", () => {
    const report = buildMonthlyReportDraft({
      invoices: [],
      currentScore: 74,
    });

    expect(report.changes).toHaveLength(0);
    expect(report.summary).toContain("עדיין אין מספיק היסטוריה");
    expect(report.newActions).toHaveLength(1);
    expect(report.newActions[0]?.type).toBe("gap");
  });

  it("buildWorkspaceDataHash is deterministic and changes with the payload", () => {
    const first = buildWorkspaceDataHash({ score: 74, month: "2026-03" });
    const second = buildWorkspaceDataHash({ score: 74, month: "2026-03" });
    const third = buildWorkspaceDataHash({ score: 75, month: "2026-03" });

    expect(first).toBe(second);
    expect(third).not.toBe(first);
  });
});

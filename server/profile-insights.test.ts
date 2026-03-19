import { describe, expect, it } from "vitest";
import type { PersonalizedInsight, UserProfile, PolicyAnalysis } from "@shared/insurance";

describe("PersonalizedInsight type", () => {
  it("accepts valid warning insight", () => {
    const insight: PersonalizedInsight = {
      id: "warn-1",
      type: "warning",
      title: "חסר ביטוח ילדים",
      description: "על פי הפרופיל שלך, יש לך 2 ילדים אך אין כיסוי ביטוח תאונות ילדים",
      relevantCoverage: "ביטוח תאונות אישיות",
      priority: "high",
    };
    expect(insight.type).toBe("warning");
    expect(insight.priority).toBe("high");
  });

  it("accepts valid recommendation insight", () => {
    const insight: PersonalizedInsight = {
      id: "rec-1",
      type: "recommendation",
      title: "כדאי לשקול ביטוח משכנתא",
      description: "יש לך משכנתא פעילה, מומלץ לוודא שיש ביטוח חיים לכיסוי המשכנתא",
      priority: "medium",
    };
    expect(insight.type).toBe("recommendation");
    expect(insight.relevantCoverage).toBeUndefined();
  });

  it("accepts valid positive insight", () => {
    const insight: PersonalizedInsight = {
      id: "pos-1",
      type: "positive",
      title: "כיסוי בריאות מתאים",
      description: "הכיסוי הבריאותי שלך מתאים למצבך",
      relevantCoverage: "ביטוח בריאות",
      priority: "low",
    };
    expect(insight.type).toBe("positive");
  });
});

describe("UserProfile type", () => {
  it("accepts a complete profile", () => {
    const profile: UserProfile = {
      dateOfBirth: "1990-05-15",
      gender: "male",
      maritalStatus: "married",
      numberOfChildren: 2,
      childrenAges: "5, 8",
      employmentStatus: "salaried",
      incomeRange: "15k_25k",
      ownsApartment: true,
      hasActiveMortgage: true,
      numberOfVehicles: 1,
      hasExtremeSports: false,
      hasSpecialHealthConditions: false,
      healthConditionsDetails: null,
      hasPets: true,
    };
    expect(profile.maritalStatus).toBe("married");
    expect(profile.numberOfChildren).toBe(2);
    expect(profile.ownsApartment).toBe(true);
  });

  it("accepts a minimal profile with null fields", () => {
    const profile: UserProfile = {
      dateOfBirth: null,
      gender: null,
      maritalStatus: null,
      numberOfChildren: 0,
      childrenAges: null,
      employmentStatus: null,
      incomeRange: null,
      ownsApartment: false,
      hasActiveMortgage: false,
      numberOfVehicles: 0,
      hasExtremeSports: false,
      hasSpecialHealthConditions: false,
      healthConditionsDetails: null,
      hasPets: false,
    };
    expect(profile.numberOfChildren).toBe(0);
    expect(profile.dateOfBirth).toBeNull();
  });
});

describe("PolicyAnalysis with personalizedInsights", () => {
  it("supports personalizedInsights as optional field", () => {
    const analysis: PolicyAnalysis = {
      coverages: [],
      generalInfo: {
        policyName: "test",
        insurerName: "test",
        policyNumber: "123",
        policyType: "health",
        monthlyPremium: "100",
        annualPremium: "1200",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        importantNotes: [],
        fineprint: [],
      },
      summary: "test",
    };
    expect(analysis.personalizedInsights).toBeUndefined();
  });

  it("supports personalizedInsights with data", () => {
    const analysis: PolicyAnalysis = {
      coverages: [],
      generalInfo: {
        policyName: "test",
        insurerName: "test",
        policyNumber: "123",
        policyType: "health",
        monthlyPremium: "100",
        annualPremium: "1200",
        startDate: "2025-01-01",
        endDate: "2025-12-31",
        importantNotes: [],
        fineprint: [],
      },
      summary: "test",
      personalizedInsights: [
        {
          id: "1",
          type: "warning",
          title: "חסר כיסוי",
          description: "חסר ביטוח ילדים",
          priority: "high",
        },
        {
          id: "2",
          type: "positive",
          title: "כיסוי טוב",
          description: "יש כיסוי מתאים",
          relevantCoverage: "ביטוח בריאות",
          priority: "low",
        },
      ],
    };
    expect(analysis.personalizedInsights).toHaveLength(2);
    expect(analysis.personalizedInsights![0].type).toBe("warning");
    expect(analysis.personalizedInsights![1].type).toBe("positive");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInsuranceOverview,
  formatInsuranceCurrency,
  isInsuranceCategoryRelevant,
  parseInsuranceDate,
  parseInsuranceMoneyValue,
  resolveInsuranceCategory,
} from "@/lib/insuranceOverview";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("insuranceOverview", () => {
  it("parses money values in multiple formats and formats rounded currency", () => {
    expect(parseInsuranceMoneyValue("1,234.50 ₪")).toBe(1234.5);
    expect(parseInsuranceMoneyValue("1.234,50")).toBe(1234.5);
    expect(parseInsuranceMoneyValue("2,450")).toBe(2450);
    expect(parseInsuranceMoneyValue("12,5")).toBe(12.5);
    expect(parseInsuranceMoneyValue(4785)).toBe(4785);
    expect(parseInsuranceMoneyValue("")).toBe(0);
    expect(formatInsuranceCurrency(1234.5)).toBe("₪1,235");
  });

  it("parses insurance dates from local formats and ignores placeholders", () => {
    const fullYearDate = parseInsuranceDate("15/03/2026");
    const shortYearDate = parseInsuranceDate("15-03-26");

    expect(fullYearDate?.getFullYear()).toBe(2026);
    expect(fullYearDate?.getMonth()).toBe(2);
    expect(fullYearDate?.getDate()).toBe(15);
    expect(shortYearDate?.getFullYear()).toBe(2026);
    expect(shortYearDate?.getMonth()).toBe(2);
    expect(shortYearDate?.getDate()).toBe(15);
    expect(parseInsuranceDate("March 20, 2026")?.getFullYear()).toBe(2026);
    expect(parseInsuranceDate(new Date("2026-03-20T00:00:00.000Z"))?.getFullYear()).toBe(2026);
    expect(parseInsuranceDate("לא מצוין בפוליסה")).toBeNull();
    expect(parseInsuranceDate("not-a-date")).toBeNull();
  });

  it("resolves insurance categories from explicit values and text inference", () => {
    expect(
      resolveInsuranceCategory({
        sessionId: "explicit",
        status: "completed",
        createdAt: new Date(),
        insuranceCategory: "car",
      })
    ).toBe("car");

    expect(
      resolveInsuranceCategory({
        sessionId: "general-info",
        status: "completed",
        createdAt: new Date(),
        analysisResult: {
          generalInfo: {
            insuranceCategory: "home",
          },
        },
      })
    ).toBe("home");

    expect(
      resolveInsuranceCategory({
        sessionId: "inferred",
        status: "completed",
        createdAt: new Date(),
        analysisResult: {
          generalInfo: {
            policyType: "ריסק ואובדן כושר עבודה",
          },
          coverages: [],
        },
      })
    ).toBe("life");
  });

  it("calculates category relevance from the household profile", () => {
    expect(isInsuranceCategoryRelevant("health")).toBe(true);
    expect(isInsuranceCategoryRelevant("home")).toBe(false);
    expect(
      isInsuranceCategoryRelevant("life", {
        maritalStatus: "married",
        numberOfChildren: 0,
        hasActiveMortgage: false,
      })
    ).toBe(true);
    expect(
      isInsuranceCategoryRelevant("car", {
        numberOfVehicles: 2,
      })
    ).toBe(true);
    expect(
      isInsuranceCategoryRelevant("car", {
        numberOfVehicles: 0,
      })
    ).toBe(false);
    expect(
      isInsuranceCategoryRelevant("home", {
        ownsApartment: true,
      })
    ).toBe(true);
  });

  it("builds an overview with renewals, insights, gaps and prioritized policies", () => {
    const overview = buildInsuranceOverview(
      [
        {
          sessionId: "health-1",
          status: "completed",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          files: [{ name: "health-a.pdf" }, { name: "health-b.pdf" }],
          analysisResult: {
            generalInfo: {
              policyName: "בריאות משפחתית",
              insurerName: "הראל",
              monthlyPremium: "1,234.50 ₪",
              endDate: "15/03/2026",
              policyType: "בריאות",
              insuranceCategory: "health",
            },
            coverages: [{ id: "c1", title: "אמבולטורי", category: "בריאות" }],
            duplicateCoverages: [{ id: "dup-1", title: "אמבולטורי", coverageIds: ["c1"], sourceFiles: ["health-a.pdf"], explanation: "כפל", recommendation: "בדיקה" }],
            personalizedInsights: [
              {
                title: "בדיקה דחופה",
                description: "נדרש לעבור על תנאי החידוש",
                type: "warning",
                priority: "high",
              },
            ],
            summary: "פוליסת בריאות פעילה",
          },
        },
        {
          sessionId: "car-1",
          status: "completed",
          createdAt: new Date("2026-02-05T00:00:00.000Z"),
          files: [{ name: "car.pdf" }],
          analysisResult: {
            generalInfo: {
              policyName: "רכב משפחתי",
              insurerName: "מנורה",
              monthlyPremium: "450",
              endDate: "01/08/2026",
              policyType: "רכב",
              insuranceCategory: "car",
            },
            coverages: [{ id: "c2", title: "גרירה", category: "רכב" }],
            duplicateCoverages: [],
            personalizedInsights: [],
            summary: "פוליסת רכב פעילה",
          },
        },
        {
          sessionId: "pending-1",
          status: "processing",
          createdAt: new Date("2026-02-10T00:00:00.000Z"),
          analysisResult: null,
        },
      ],
      {
        maritalStatus: "married",
        numberOfChildren: 2,
        hasActiveMortgage: false,
        ownsApartment: false,
        numberOfVehicles: 0,
      }
    );

    expect(overview.totalPolicies).toBe(2);
    expect(overview.totalFiles).toBe(3);
    expect(overview.totalMonthlyPremium).toBeCloseTo(1684.5);
    expect(overview.renewals).toHaveLength(1);
    expect(overview.renewals[0].sessionId).toBe("health-1");
    expect(overview.duplicateGroups).toBe(1);
    expect(overview.categorySummaries.health.highlight).toContain("חידוש בעוד");
    expect(overview.categorySummaries.life.relevant).toBe(true);
    expect(overview.categorySummaries.life.hasData).toBe(false);
    expect(overview.coverageGaps.some((gap) => gap.category === "life")).toBe(true);
    expect(overview.insights.some((insight) => insight.title === "זוהו חפיפות בין כיסויים")).toBe(true);
    expect(overview.insights.some((insight) => insight.title === "בדיקה דחופה")).toBe(true);
    expect(overview.prioritizedPolicies[0].sessionId).toBe("health-1");
  });

  it("creates a positive summary insight when the portfolio looks clean", () => {
    const overview = buildInsuranceOverview([
      {
        sessionId: "health-1",
        status: "completed",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        files: [{ name: "health.pdf" }],
        analysisResult: {
          generalInfo: {
            policyName: "בריאות אישית",
            insurerName: "הפניקס",
            monthlyPremium: "99",
            endDate: "01/12/2026",
            policyType: "בריאות",
            insuranceCategory: "health",
          },
          coverages: [{ id: "c1", title: "ייעוץ", category: "בריאות" }],
          duplicateCoverages: [],
          personalizedInsights: [],
          summary: "פוליסת בריאות בסיסית",
        },
      },
    ]);

    expect(overview.coverageGaps).toHaveLength(0);
    expect(overview.insights).toEqual([
      {
        id: "positive-overview",
        title: "יש לך כבר שכבת ביטוח פעילה",
        description: "כרגע זוהו 1 פוליסות עם פרמיה חודשית כוללת של ₪99.",
        tone: "success",
      },
    ]);
  });

  it("fills policy defaults and prioritizes higher premiums when there is no renewal date", () => {
    const overview = buildInsuranceOverview(
      [
        {
          sessionId: "home-1",
          status: "completed",
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          analysisResult: {
            generalInfo: {
              policyType: "home",
              monthlyPremium: "0",
            },
            coverages: [],
            duplicateCoverages: [],
            personalizedInsights: [
              {
                title: "כיסוי חיובי",
                description: "נראה שיש הגנה טובה",
                type: "positive",
              },
              {
                title: "בדיקה כללית",
                description: "מומלץ לבדוק אחת לשנה",
              },
            ],
            summary: "",
          },
        },
        {
          sessionId: "health-1",
          status: "completed",
          createdAt: new Date("2026-02-02T00:00:00.000Z"),
          files: [{ name: "health.pdf" }],
          analysisResult: {
            generalInfo: {
              policyName: "בריאות",
              insurerName: "הפניקס",
              policyType: "health",
              monthlyPremium: "300",
            },
            coverages: [{ id: "c1", title: "אשפוז", category: "בריאות" }],
            duplicateCoverages: [],
            personalizedInsights: [],
            summary: "פוליסת בריאות",
          },
        },
      ],
      {
        ownsApartment: true,
      }
    );

    const homePolicy = overview.completedPolicies.find((policy) => policy.sessionId === "home-1");
    expect(homePolicy?.policyName).toBe("פוליסה");
    expect(homePolicy?.insurerName).toBe("לא ידוע");
    expect(homePolicy?.premiumLabel).toBe("לא זוהתה פרמיה");
    expect(homePolicy?.summary).toBe("אין סיכום זמין");
    expect(overview.categorySummaries.home.highlight).toBe("1 פוליסות פעילות");
    expect(overview.insights.some((insight) => insight.title === "כיסוי חיובי" && insight.tone === "success")).toBe(true);
    expect(overview.insights.some((insight) => insight.title === "בדיקה כללית" && insight.tone === "info")).toBe(true);
    expect(overview.prioritizedPolicies[0].sessionId).toBe("health-1");
  });

  it("treats annual premiums as annual labels and monthly equivalents for rollups", () => {
    const overview = buildInsuranceOverview([
      {
        sessionId: "car-annual-1",
        status: "completed",
        createdAt: new Date("2026-02-05T00:00:00.000Z"),
        files: [{ name: "car.pdf" }],
        analysisResult: {
          generalInfo: {
            policyName: "רכב חובה ומקיף",
            insurerName: "איי.די.איי",
            annualPremium: "4,785",
            premiumPaymentPeriod: "annual",
            policyType: "רכב",
            insuranceCategory: "car",
          },
          coverages: [{ id: "c2", title: "גרירה", category: "רכב" }],
          duplicateCoverages: [],
          personalizedInsights: [],
          summary: "פוליסת רכב שנתית",
        },
      },
    ]);

    expect(overview.totalMonthlyPremium).toBeCloseTo(398.75);
    expect(overview.completedPolicies[0]?.premiumLabel).toBe("₪4,785 לשנה");
    expect(overview.categorySummaries.car.highlight).toContain("לחודש");
  });
});

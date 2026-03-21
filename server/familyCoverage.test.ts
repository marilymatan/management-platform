import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFamilyCoverageSnapshot,
  getFamilyCoverageStatusClasses,
  getFamilyCoverageStatusLabel,
} from "@/lib/familyCoverage";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-20T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildFamilyCoverageSnapshot", () => {
  it("marks detected household categories and member review states", () => {
    const snapshot = buildFamilyCoverageSnapshot(
      [
        {
          sessionId: "health-1",
          status: "completed",
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          insuranceCategory: "health" as const,
          files: [{ name: "health.pdf" }],
          analysisResult: {
            generalInfo: {
              policyName: "בריאות משפחתית",
              insurerName: "מגדל",
              monthlyPremium: "120",
              insuranceCategory: "health" as const,
              endDate: "01/12/2026",
            },
            coverages: [{ name: "אמבולטורי" }],
            duplicateCoverages: [],
            personalizedInsights: [],
            summary: "פוליסת בריאות פעילה",
          },
        },
        {
          sessionId: "home-1",
          status: "completed",
          createdAt: new Date("2026-03-20T10:00:00.000Z"),
          insuranceCategory: "home" as const,
          files: [{ name: "home.pdf" }],
          analysisResult: {
            generalInfo: {
              policyName: "ביטוח דירה",
              insurerName: "הפניקס",
              monthlyPremium: "90",
              insuranceCategory: "home" as const,
              endDate: "15/01/2027",
            },
            coverages: [{ name: "מבנה" }],
            duplicateCoverages: [],
            personalizedInsights: [],
            summary: "ביטוח דירה פעיל",
          },
        },
      ],
      {
        ownsApartment: true,
        hasActiveMortgage: true,
        numberOfVehicles: 1,
        maritalStatus: "married",
      },
      [
        {
          id: 1,
          fullName: "נועה",
          relation: "spouse",
        },
        {
          id: 2,
          fullName: "אורי",
          relation: "child",
        },
      ],
    );

    expect(snapshot.householdSize).toBe(3);
    expect(snapshot.categoriesWithData).toBe(2);

    const primaryRow = snapshot.rows[0];
    const spouseRow = snapshot.rows[1];
    const childRow = snapshot.rows[2];

    expect(primaryRow.fullName).toBe("בעל/ת החשבון");
    expect(primaryRow.cells.find((cell) => cell.category === "health")?.status).toBe("household_covered");
    expect(primaryRow.cells.find((cell) => cell.category === "home")?.status).toBe("household_covered");
    expect(primaryRow.cells.find((cell) => cell.category === "life")?.status).toBe("missing");
    expect(primaryRow.cells.find((cell) => cell.category === "car")?.status).toBe("missing");

    expect(spouseRow.cells.find((cell) => cell.category === "health")?.status).toBe("needs_review");
    expect(spouseRow.cells.find((cell) => cell.category === "home")?.status).toBe("needs_review");
    expect(spouseRow.cells.find((cell) => cell.category === "car")?.status).toBe("missing");
    expect(spouseRow.cells.find((cell) => cell.category === "life")?.status).toBe("missing");

    expect(childRow.cells.find((cell) => cell.category === "health")?.status).toBe("needs_review");
    expect(childRow.cells.find((cell) => cell.category === "home")?.status).toBe("needs_review");
    expect(childRow.cells.find((cell) => cell.category === "car")?.status).toBe("not_relevant");
    expect(childRow.cells.find((cell) => cell.category === "life")?.status).toBe("missing");
  });

  it("marks missing information when the household still has no policies", () => {
    const snapshot = buildFamilyCoverageSnapshot(
      [],
      {
        ownsApartment: true,
        hasActiveMortgage: false,
        numberOfVehicles: 0,
        maritalStatus: "married",
      },
      [
        {
          id: 7,
          fullName: "דניאל",
          relation: "child",
        },
      ],
    );

    expect(snapshot.categoriesWithData).toBe(0);
    expect(snapshot.missingCount).toBeGreaterThan(0);

    const primaryRow = snapshot.rows[0];
    const childRow = snapshot.rows[1];

    expect(primaryRow.cells.find((cell) => cell.category === "home")?.status).toBe("missing");
    expect(primaryRow.cells.find((cell) => cell.category === "health")?.status).toBe("missing");
    expect(childRow.cells.find((cell) => cell.category === "health")?.status).toBe("missing");
    expect(childRow.cells.find((cell) => cell.category === "car")?.status).toBe("not_relevant");
  });

  it("uses age and notes to build member hints and keeps non-relevant categories out of focus", () => {
    const snapshot = buildFamilyCoverageSnapshot(
      [],
      undefined,
      [
        {
          id: 1,
          fullName: "רות",
          relation: "dependent",
          birthDate: "2016-03-10",
        },
        {
          id: 2,
          fullName: "אבי",
          relation: "parent",
          birthDate: "invalid-date",
          insuranceNotes: "זקוק לבדיקה תקופתית",
        },
        {
          id: 3,
          fullName: "ליה",
          relation: "other",
          medicalNotes: "רגישות לתרופות",
        },
      ],
    );

    expect(snapshot.rows[0].hint).toBe("הכיסוי הראשי בתיק");
    expect(snapshot.rows[0].cells.find((cell) => cell.category === "life")?.status).toBe("not_relevant");
    expect(snapshot.rows[1].relationLabel).toBe("בן בית");
    expect(snapshot.rows[1].hint).toBe("גיל 10");
    expect(snapshot.rows[2].relationLabel).toBe("הורה");
    expect(snapshot.rows[2].hint).toBe("זקוק לבדיקה תקופתית");
    expect(snapshot.rows[3].relationLabel).toBe("אחר");
    expect(snapshot.rows[3].hint).toBe("רגישות לתרופות");
  });

  it("returns readable labels and classes for every family coverage status", () => {
    expect(getFamilyCoverageStatusLabel("household_covered")).toBe("יש כיסוי");
    expect(getFamilyCoverageStatusLabel("needs_review")).toBe("לבדיקה");
    expect(getFamilyCoverageStatusLabel("missing")).toBe("חסר מידע");
    expect(getFamilyCoverageStatusLabel("not_relevant")).toBe("לא בולט");

    expect(getFamilyCoverageStatusClasses("household_covered")).toContain("text-success");
    expect(getFamilyCoverageStatusClasses("needs_review")).toContain("text-warning-foreground");
    expect(getFamilyCoverageStatusClasses("missing")).toContain("text-destructive");
    expect(getFamilyCoverageStatusClasses("not_relevant")).toContain("text-muted-foreground");
  });
});

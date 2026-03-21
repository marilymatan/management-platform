import type { InsuranceCategory } from "@shared/insurance";
import { buildInsuranceOverview, insuranceCategoryLabels, type InsuranceHubOverview } from "./insuranceOverview";

type FamilyMemberRelation = "spouse" | "child" | "parent" | "dependent" | "other";

type ProfileLike = Parameters<typeof buildInsuranceOverview>[1];
type AnalysesInput = Parameters<typeof buildInsuranceOverview>[0];

export type FamilyMemberLike = {
  id: number;
  fullName: string;
  relation: FamilyMemberRelation;
  birthDate?: string | Date | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  activities?: string | null;
  insuranceNotes?: string | null;
};

export type FamilyCoverageStatus = "household_covered" | "needs_review" | "missing" | "not_relevant";

export type FamilyCoverageCell = {
  category: InsuranceCategory;
  label: string;
  status: FamilyCoverageStatus;
  summary: string;
};

export type FamilyCoverageRow = {
  id: string;
  fullName: string;
  relationLabel: string;
  hint: string;
  kind: "primary" | "member";
  cells: FamilyCoverageCell[];
};

export type FamilyCoverageSnapshot = {
  overview: InsuranceHubOverview;
  rows: FamilyCoverageRow[];
  householdSize: number;
  categoriesWithData: number;
  missingCount: number;
  reviewCount: number;
  coveredCount: number;
};

const relationLabels: Record<FamilyMemberRelation, string> = {
  spouse: "בן/בת זוג",
  child: "ילד/ה",
  parent: "הורה",
  dependent: "בן בית",
  other: "אחר",
};

const categories: InsuranceCategory[] = ["health", "life", "car", "home"];

function calculateAge(dateValue: string | Date | null | undefined) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const hadBirthday =
    now.getMonth() > parsed.getMonth() ||
    (now.getMonth() === parsed.getMonth() && now.getDate() >= parsed.getDate());
  if (!hadBirthday) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}

function isCategoryRelevantForMember(
  category: InsuranceCategory,
  member: FamilyMemberLike,
  profile?: ProfileLike | null,
) {
  if (category === "health") {
    return true;
  }
  if (category === "life") {
    return member.relation === "spouse" || member.relation === "child" || member.relation === "dependent";
  }
  if (category === "car") {
    return (profile?.numberOfVehicles ?? 0) > 0 && member.relation !== "child";
  }
  return Boolean(profile?.ownsApartment || profile?.hasActiveMortgage);
}

function getPrimaryCellSummary(hasData: boolean, relevant: boolean, category: InsuranceCategory) {
  if (hasData) {
    return `יש מסמך או פוליסה מזוהים בקטגוריית ${insuranceCategoryLabels[category]}`;
  }
  if (relevant) {
    return `עדיין לא זוהה מסמך בקטגוריית ${insuranceCategoryLabels[category]}`;
  }
  return "כרגע אין צורך דחוף לסמן כיסוי בקטגוריה הזאת";
}

function getMemberHint(member: FamilyMemberLike) {
  const age = calculateAge(member.birthDate);
  if (age !== null) {
    return `גיל ${age}`;
  }
  if (member.insuranceNotes) {
    return member.insuranceNotes;
  }
  if (member.medicalNotes) {
    return member.medicalNotes;
  }
  return "עדיין אין שיוך ביטוחי מפורט";
}

function getMemberCellSummary(
  status: FamilyCoverageStatus,
  category: InsuranceCategory,
  member: FamilyMemberLike,
) {
  if (status === "household_covered") {
    return `זוהה כיסוי ביתי רלוונטי עבור ${member.fullName}`;
  }
  if (status === "needs_review") {
    return `יש מסמכים בקטגוריית ${insuranceCategoryLabels[category]}, אבל צריך לוודא את השיוך האישי`;
  }
  if (status === "missing") {
    return `לא זוהה עדיין מסמך שמאפשר לבדוק את ${insuranceCategoryLabels[category]} עבור ${member.fullName}`;
  }
  return "כרגע לא עולה צורך מובהק בקטגוריה הזאת";
}

export function getFamilyCoverageStatusLabel(status: FamilyCoverageStatus) {
  if (status === "household_covered") return "יש כיסוי";
  if (status === "needs_review") return "לבדיקה";
  if (status === "missing") return "חסר מידע";
  return "לא בולט";
}

export function getFamilyCoverageStatusClasses(status: FamilyCoverageStatus) {
  if (status === "household_covered") {
    return "border-success/20 bg-success/10 text-success";
  }
  if (status === "needs_review") {
    return "border-warning/30 bg-warning/10 text-warning-foreground";
  }
  if (status === "missing") {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  return "border-border bg-muted/40 text-muted-foreground";
}

export function buildFamilyCoverageSnapshot(
  analyses: AnalysesInput,
  profile?: ProfileLike | null,
  members: FamilyMemberLike[] = [],
): FamilyCoverageSnapshot {
  const overview = buildInsuranceOverview(analyses, profile);
  const categoriesWithData = categories.filter((category) => overview.categorySummaries[category].hasData).length;

  const primaryRow: FamilyCoverageRow = {
    id: "primary-user",
    fullName: "בעל/ת החשבון",
    relationLabel: "ראש המשפחה",
    hint: profile?.maritalStatus ? "הקשר הראשי של לומי לביטוחים ולמסמכים" : "הכיסוי הראשי בתיק",
    kind: "primary",
    cells: categories.map((category) => {
      const summary = overview.categorySummaries[category];
      const status: FamilyCoverageStatus = summary.hasData
        ? "household_covered"
        : summary.relevant
          ? "missing"
          : "not_relevant";
      return {
        category,
        label: insuranceCategoryLabels[category],
        status,
        summary: getPrimaryCellSummary(summary.hasData, summary.relevant, category),
      };
    }),
  };

  const memberRows: FamilyCoverageRow[] = members.map((member) => ({
    id: `member-${member.id}`,
    fullName: member.fullName,
    relationLabel: relationLabels[member.relation],
    hint: getMemberHint(member),
    kind: "member",
    cells: categories.map((category) => {
      const summary = overview.categorySummaries[category];
      const relevantForMember = isCategoryRelevantForMember(category, member, profile);
      const status: FamilyCoverageStatus = summary.hasData
        ? relevantForMember
          ? "needs_review"
          : "not_relevant"
        : relevantForMember
          ? "missing"
          : "not_relevant";
      return {
        category,
        label: insuranceCategoryLabels[category],
        status,
        summary: getMemberCellSummary(status, category, member),
      };
    }),
  }));

  const rows = [primaryRow, ...memberRows];
  let missingCount = 0;
  let reviewCount = 0;
  let coveredCount = 0;

  rows.forEach((row) => {
    row.cells.forEach((cell) => {
      if (cell.status === "missing") missingCount += 1;
      if (cell.status === "needs_review") reviewCount += 1;
      if (cell.status === "household_covered") coveredCount += 1;
    });
  });

  return {
    overview,
    rows,
    householdSize: members.length + 1,
    categoriesWithData,
    missingCount,
    reviewCount,
    coveredCount,
  };
}

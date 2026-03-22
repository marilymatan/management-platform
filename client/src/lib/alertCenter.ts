import type { InsuranceCategory } from "@shared/insurance";
import { differenceInCalendarDays } from "date-fns";
import { buildFamilyCoverageSnapshot, type FamilyCoverageSnapshot, type FamilyMemberLike } from "./familyCoverage";
import { insuranceCategoryLabels, parseInsuranceDate } from "./insuranceOverview";

type AnalysesInput = Parameters<typeof buildFamilyCoverageSnapshot>[0];
type ProfileInput = Parameters<typeof buildFamilyCoverageSnapshot>[1];

type AnalysisLike = {
  sessionId: string;
  status: string;
  createdAt?: string | Date | null;
  insuranceCategory?: InsuranceCategory | null;
  analysisResult?: {
    generalInfo?: {
      policyName?: string | null;
      endDate?: string | Date | null;
      insuranceCategory?: InsuranceCategory | null;
    } | null;
    duplicateCoverages?: unknown[] | null;
    coverageOverlapGroups?: unknown[] | null;
    policyOverlapGroups?: unknown[] | null;
    personalizedInsights?: Array<{
      title: string;
      description: string;
      type?: "warning" | "recommendation" | "positive";
      priority?: "high" | "medium" | "low";
    }> | null;
  } | null;
};

type InsuranceDiscoveryLike = {
  id: number;
  provider?: string | null;
  insuranceCategory?: string | null;
  artifactType?: string | null;
  documentDate?: string | Date | null;
  summary?: string | null;
  subject?: string | null;
  actionHint?: string | null;
  attachmentUrl?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  requiresExternalAccess?: boolean | null;
  externalAccessMode?: string | null;
};

type InvoiceLike = {
  id: number;
  provider?: string | null;
  amount?: string | number | null;
  status?: string | null;
  dueDate?: string | Date | null;
  invoiceDate?: string | Date | null;
  flowDirection?: string | null;
};

export type AlertPriority = "high" | "medium" | "low";
export type AlertSource = "policy_scan" | "gmail_scan" | "family" | "invoice";

export type AlertCenterItem = {
  id: string;
  priority: AlertPriority;
  source: AlertSource;
  sourceLabel: string;
  badgeLabel: string;
  title: string;
  description: string;
  actionLabel: string;
  actionPath?: string;
  actionUrl?: string;
  openInNewTab?: boolean;
  createdAtMs: number;
  contextLabel?: string;
};

export type AlertCenterSnapshot = {
  alerts: AlertCenterItem[];
  urgentCount: number;
  scanFindingCount: number;
  familyCount: number;
  paymentCount: number;
  coverageSnapshot: FamilyCoverageSnapshot;
};

const priorityRank: Record<AlertPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const discoveryBadgeLabels: Record<string, string> = {
  policy_document: "מסמך חדש",
  renewal_notice: "חידוש",
  premium_notice: "פרמיה",
  coverage_update: "עדכון כיסוי",
  claim_update: "תביעה",
  other: "ממצא חדש",
};

function getPriorityFromInsight(priority?: "high" | "medium" | "low") {
  if (priority === "high" || priority === "medium" || priority === "low") {
    return priority;
  }
  return "medium";
}

function getDiscoveryPriority(artifactType?: string | null): AlertPriority {
  if (artifactType === "renewal_notice" || artifactType === "claim_update") {
    return "high";
  }
  if (artifactType === "premium_notice" || artifactType === "coverage_update") {
    return "medium";
  }
  return "low";
}

function toTimestamp(value?: string | Date | null) {
  if (!value) {
    return Date.now();
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return Date.now();
  }
  return parsed.getTime();
}

function parseMoneyValue(raw?: string | number | null) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw !== "string") {
    return 0;
  }
  const normalized = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(normalized) ? normalized : 0;
}

function getAnalysisCategory(
  analysis: AnalysisLike,
): InsuranceCategory | null {
  const category = analysis.analysisResult?.generalInfo?.insuranceCategory ?? analysis.insuranceCategory ?? null;
  if (category === "health" || category === "life" || category === "car" || category === "home") {
    return category;
  }
  return null;
}

function getPolicyName(analysis: AnalysisLike) {
  const policyName = analysis.analysisResult?.generalInfo?.policyName?.trim();
  return policyName || "סריקת פוליסה";
}

function createCategoryContextLabel(category: InsuranceCategory | null) {
  return category ? insuranceCategoryLabels[category] : undefined;
}

function buildDiscoveryTitle(discovery: InsuranceDiscoveryLike) {
  const provider = discovery.provider?.trim() || "גוף ביטוחי";
  if (discovery.artifactType === "renewal_notice") {
    return `חידוש חדש מ-${provider}`;
  }
  if (discovery.artifactType === "premium_notice") {
    return `עדכון פרמיה מ-${provider}`;
  }
  if (discovery.artifactType === "coverage_update") {
    return `עדכון כיסוי מ-${provider}`;
  }
  if (discovery.artifactType === "claim_update") {
    return `עדכון תביעה מ-${provider}`;
  }
  return `נמצא מסמך ביטוחי מ-${provider}`;
}

function buildDiscoveryDescription(discovery: InsuranceDiscoveryLike) {
  if (discovery.actionHint?.trim()) {
    return discovery.actionHint.trim();
  }
  if (discovery.summary?.trim()) {
    return discovery.summary.trim();
  }
  if (discovery.subject?.trim()) {
    return discovery.subject.trim();
  }
  return "לומי זיהה מסמך או עדכון ביטוחי חדש מתוך סריקת Gmail.";
}

function getDiscoveryAction(discovery: InsuranceDiscoveryLike) {
  if (discovery.attachmentUrl?.trim()) {
    return {
      actionLabel: "פתח מסמך",
      actionUrl: discovery.attachmentUrl.trim(),
      openInNewTab: true,
    };
  }
  if (discovery.actionUrl?.trim()) {
    return {
      actionLabel:
        discovery.actionLabel?.trim()
        || (discovery.requiresExternalAccess
          ? discovery.externalAccessMode === "portal_login"
            ? "פתח והתחבר"
            : "פתח קישור"
          : "פתח ממצא"),
      actionUrl: discovery.actionUrl.trim(),
      openInNewTab: true,
    };
  }
  return {
    actionLabel: "לסריקת מיילים",
    actionPath: "/money",
    openInNewTab: false,
  };
}

function getInvoicePriority(status?: string | null, dueDate?: string | Date | null): AlertPriority | null {
  if (status === "overdue") {
    return "high";
  }
  if (status !== "pending") {
    return null;
  }
  const parsedDueDate = dueDate ? new Date(dueDate) : null;
  if (parsedDueDate && !Number.isNaN(parsedDueDate.getTime())) {
    const daysUntilDue = differenceInCalendarDays(parsedDueDate, new Date());
    if (daysUntilDue <= 3) {
      return "high";
    }
    if (daysUntilDue <= 14) {
      return "medium";
    }
  }
  return "low";
}

export function buildAlertCenterSnapshot({
  analyses,
  profile,
  familyMembers,
  insuranceDiscoveries,
  invoices,
}: {
  analyses: AnalysesInput;
  profile?: ProfileInput;
  familyMembers?: FamilyMemberLike[];
  insuranceDiscoveries?: InsuranceDiscoveryLike[] | null;
  invoices?: InvoiceLike[] | null;
}): AlertCenterSnapshot {
  const coverageSnapshot = buildFamilyCoverageSnapshot(analyses, profile, familyMembers ?? []);
  const analysisRows = ((analyses ?? []) as AnalysisLike[]).filter((analysis) => analysis.status === "completed");
  const alerts: AlertCenterItem[] = [];
  const now = new Date();

  analysisRows.forEach((analysis) => {
    const policyName = getPolicyName(analysis);
    const category = getAnalysisCategory(analysis);
    const contextLabel = createCategoryContextLabel(category);
    const createdAtMs = toTimestamp(analysis.createdAt);
    const actionPath = `/insurance/${analysis.sessionId}`;
    const coverageOverlapCount =
      analysis.analysisResult?.coverageOverlapGroups?.length ??
      analysis.analysisResult?.duplicateCoverages?.length ??
      0;
    const policyOverlapCount = analysis.analysisResult?.policyOverlapGroups?.length ?? 0;
    const duplicateCount = coverageOverlapCount + policyOverlapCount;
    const renewalDate = parseInsuranceDate(analysis.analysisResult?.generalInfo?.endDate);

    if (renewalDate) {
      const daysUntilRenewal = differenceInCalendarDays(renewalDate, now);
      if (daysUntilRenewal >= -30 && daysUntilRenewal <= 90) {
        alerts.push({
          id: `renewal-${analysis.sessionId}`,
          priority: daysUntilRenewal <= 14 ? "high" : daysUntilRenewal <= 45 ? "medium" : "low",
          source: "policy_scan",
          sourceLabel: "סריקת פוליסה",
          badgeLabel: "חידוש",
          title: `${policyName} מתקרבת לחידוש`,
          description:
            daysUntilRenewal < 0
              ? `הפוליסה כבר חרגה ממועד הסיום ב-${Math.abs(daysUntilRenewal)} ימים וצריך לבדוק את המשך הכיסוי.`
              : `נשארו ${daysUntilRenewal} ימים עד סיום הפוליסה, וזה זמן טוב לבדוק עלות, כיסויים וחפיפות.`,
          actionLabel: "פתח פוליסה",
          actionPath,
          createdAtMs: renewalDate.getTime(),
          contextLabel,
        });
      }
    }

    if (duplicateCount > 0) {
      alerts.push({
        id: `duplicates-${analysis.sessionId}`,
        priority: "high",
        source: "policy_scan",
        sourceLabel: "סריקת פוליסה",
        badgeLabel: "חפיפה",
        title: `זוהו חפיפות ב-${policyName}`,
        description:
          policyOverlapCount > 0
            ? `לומי מצא ${coverageOverlapCount} חפיפות כיסוי ו-${policyOverlapCount} חפיפות פוליסה שכדאי לבדוק.`
            : `לומי מצא ${coverageOverlapCount} חפיפות כיסוי אפשריות בתוך הסריקה הזאת שכדאי לבדוק כדי לא לשלם פעמיים.`,
        actionLabel: "לסריקה",
        actionPath,
        createdAtMs,
        contextLabel,
      });
    }

    (analysis.analysisResult?.personalizedInsights ?? [])
      .filter((insight) => insight.type !== "positive")
      .slice(0, 3)
      .forEach((insight, index) => {
        alerts.push({
          id: `insight-${analysis.sessionId}-${index}`,
          priority: getPriorityFromInsight(insight.priority),
          source: "policy_scan",
          sourceLabel: "סריקת פוליסה",
          badgeLabel: insight.type === "warning" ? "לבדיקה" : "המלצה",
          title: insight.title || `תובנה מתוך ${policyName}`,
          description: insight.description,
          actionLabel: "לסריקה",
          actionPath,
          createdAtMs,
          contextLabel,
        });
      });
  });

  coverageSnapshot.overview.coverageGaps.forEach((gap, index) => {
    alerts.push({
      id: `gap-${gap.id}-${index}`,
      priority: gap.tone === "warning" ? "high" : "medium",
      source: "family",
      sourceLabel: "התראה מערכתית",
      badgeLabel: "פער בכיסוי",
      title: gap.title,
      description: gap.description,
      actionLabel: gap.category ? "פתח קטגוריה" : "למסך הביטוחים",
      actionPath: gap.category ? `/insurance/category/${gap.category}` : "/insurance",
      createdAtMs: Date.now(),
      contextLabel: createCategoryContextLabel(gap.category ?? null),
    });
  });

  if (coverageSnapshot.reviewCount > 0) {
    alerts.push({
      id: "family-review",
      priority: "medium",
      source: "family",
      sourceLabel: "המשפחה שלי",
      badgeLabel: "לבדיקה",
      title: "יש שיוכים משפחתיים שדורשים מעבר",
      description: `נמצאו ${coverageSnapshot.reviewCount} שיוכים במשפחה שכדאי לאשר כדי שלומי יבין טוב יותר מי מכוסה ובמה.`,
      actionLabel: "למשפחה שלי",
      actionPath: "/family",
      createdAtMs: Date.now(),
    });
  }

  if (coverageSnapshot.missingCount > 0) {
    alerts.push({
      id: "family-missing",
      priority: coverageSnapshot.missingCount >= 4 ? "medium" : "low",
      source: "family",
      sourceLabel: "המשפחה שלי",
      badgeLabel: "מידע חסר",
      title: "יש פערי מידע בתמונת המשפחה",
      description: `עדיין חסר מידע ב-${coverageSnapshot.missingCount} נקודות כיסוי משפחתיות, וזה יכול להשפיע על הדיוק של ההמלצות.`,
      actionLabel: "למשפחה שלי",
      actionPath: "/family",
      createdAtMs: Date.now(),
    });
  }

  (insuranceDiscoveries ?? []).forEach((discovery) => {
    const action = getDiscoveryAction(discovery);
    alerts.push({
      id: `gmail-discovery-${discovery.id}`,
      priority: getDiscoveryPriority(discovery.artifactType),
      source: "gmail_scan",
      sourceLabel: "סריקת Gmail",
      badgeLabel: discoveryBadgeLabels[discovery.artifactType || "other"] ?? discoveryBadgeLabels.other,
      title: buildDiscoveryTitle(discovery),
      description: buildDiscoveryDescription(discovery),
      actionLabel: action.actionLabel,
      actionPath: action.actionPath,
      actionUrl: action.actionUrl,
      openInNewTab: action.openInNewTab,
      createdAtMs: toTimestamp(discovery.documentDate),
      contextLabel:
        discovery.insuranceCategory === "health"
        || discovery.insuranceCategory === "life"
        || discovery.insuranceCategory === "car"
        || discovery.insuranceCategory === "home"
          ? insuranceCategoryLabels[discovery.insuranceCategory]
          : undefined,
    });
  });

  (invoices ?? []).forEach((invoice) => {
    const priority = getInvoicePriority(invoice.status, invoice.dueDate ?? invoice.invoiceDate);
    if (!priority || invoice.flowDirection === "income") {
      return;
    }
    const amount = parseMoneyValue(invoice.amount);
    alerts.push({
      id: `invoice-${invoice.id}`,
      priority,
      source: "invoice",
      sourceLabel: "חיוב מהמייל",
      badgeLabel: invoice.status === "overdue" ? "באיחור" : "לתשלום",
      title: `מעקב על ${invoice.provider || "חיוב ביטוח"}`,
      description: amount > 0 ? `זוהה חיוב של ₪${Math.round(amount).toLocaleString("he-IL")} שדורש מעקב במסמכי המייל.` : "זוהה חיוב שדורש מעקב במסמכי המייל.",
      actionLabel: "לסריקת מיילים",
      actionPath: "/money",
      createdAtMs: toTimestamp(invoice.dueDate ?? invoice.invoiceDate),
    });
  });

  alerts.sort((left, right) => {
    if (priorityRank[left.priority] !== priorityRank[right.priority]) {
      return priorityRank[left.priority] - priorityRank[right.priority];
    }
    return right.createdAtMs - left.createdAtMs;
  });

  return {
    alerts,
    urgentCount: alerts.filter((alert) => alert.priority === "high").length,
    scanFindingCount: alerts.filter((alert) => alert.source === "policy_scan" || alert.source === "gmail_scan").length,
    familyCount: alerts.filter((alert) => alert.source === "family").length,
    paymentCount: alerts.filter((alert) => alert.source === "invoice").length,
    coverageSnapshot,
  };
}

import {
  inferInsuranceCategory,
  type InsuranceCategory,
  type PremiumPaymentPeriod,
} from "@shared/insurance";

type AnalysisLike = {
  sessionId: string;
  status: string;
  createdAt: string | Date;
  files?: unknown[];
  insuranceCategory?: InsuranceCategory | null;
  analysisResult?: {
    analysisVersion?: number;
    generalInfo?: {
      policyName?: string;
      insurerName?: string;
      monthlyPremium?: string | number | null;
      annualPremium?: string | number | null;
      endDate?: string | Date | null;
      insuranceCategory?: InsuranceCategory;
      policyType?: string;
      premiumPaymentPeriod?: PremiumPaymentPeriod;
    };
    coverages?: unknown[];
    duplicateCoverages?: Array<unknown>;
    coverageOverlapGroups?: Array<unknown>;
    policyOverlapGroups?: Array<unknown>;
    personalizedInsights?: Array<{
      title: string;
      description: string;
      type?: "warning" | "recommendation" | "positive";
      priority?: "high" | "medium" | "low";
    }>;
    summary?: string;
  } | null;
};

type AnalysisGeneralInfo = NonNullable<NonNullable<AnalysisLike["analysisResult"]>["generalInfo"]>;

type ProfileLike = {
  ownsApartment?: boolean;
  hasActiveMortgage?: boolean;
  numberOfVehicles?: number;
  numberOfChildren?: number;
  maritalStatus?: string | null;
  hasSpecialHealthConditions?: boolean;
};

export type InsuranceInsightTone = "warning" | "info" | "success";

export type InsuranceHubInsight = {
  id: string;
  title: string;
  description: string;
  tone: InsuranceInsightTone;
  category?: InsuranceCategory;
};

export type InsuranceHubPolicy = {
  sessionId: string;
  category: InsuranceCategory;
  policyName: string;
  insurerName: string;
  monthlyPremium: number;
  annualPremium: number;
  premiumPaymentPeriod: PremiumPaymentPeriod;
  premiumLabel: string;
  renewalDate: Date | null;
  daysUntilRenewal: number | null;
  coverageCount: number;
  summary: string;
  duplicateCount: number;
  coverageOverlapCount: number;
  policyOverlapCount: number;
  personalizedInsights: Array<{
    title: string;
    description: string;
    type?: "warning" | "recommendation" | "positive";
    priority?: "high" | "medium" | "low";
  }>;
  filesCount: number;
};

export type InsuranceHubCategorySummary = {
  category: InsuranceCategory;
  scans: number;
  pdfs: number;
  monthlyPremium: number;
  renewals: number;
  nextRenewalDays: number | null;
  relevant: boolean;
  hasData: boolean;
  highlight: string;
};

export type InsuranceHubOverview = {
  completedPolicies: InsuranceHubPolicy[];
  totalPolicies: number;
  totalFiles: number;
  totalMonthlyPremium: number;
  renewals: InsuranceHubPolicy[];
  duplicateGroups: number;
  coverageOverlapGroups: number;
  policyOverlapGroups: number;
  categorySummaries: Record<InsuranceCategory, InsuranceHubCategorySummary>;
  insights: InsuranceHubInsight[];
  coverageGaps: InsuranceHubInsight[];
  prioritizedPolicies: InsuranceHubPolicy[];
};

export const insuranceCategoryLabels: Record<InsuranceCategory, string> = {
  health: "ביטוחי בריאות",
  life: "ביטוחי חיים",
  car: "ביטוחי רכב",
  home: "ביטוחי דירה",
};

export function formatInsuranceCurrency(value: number) {
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}

function isKnownPremiumPeriod(value: unknown): value is PremiumPaymentPeriod {
  return value === "monthly" || value === "annual" || value === "unknown";
}

type ResolvedPremiumInfo = {
  annualPremium: number;
  monthlyPremium: number;
  premiumLabel: string;
  premiumPaymentPeriod: PremiumPaymentPeriod;
};

export function parseInsuranceMoneyValue(raw?: unknown) {
  if (!raw) return 0;
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : 0;
  }
  if (typeof raw !== "string") {
    return 0;
  }
  const cleaned = raw.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return 0;
  const commaCount = cleaned.split(",").length - 1;
  const dotCount = cleaned.split(".").length - 1;
  let normalized = cleaned;
  if (commaCount > 0 && dotCount > 0) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (commaCount > 0) {
    const parts = cleaned.split(",");
    normalized = parts.length > 2 || parts[parts.length - 1].length === 3
      ? parts.join("")
      : parts.join(".");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseInsuranceDate(raw?: unknown) {
  if (!raw || raw === "לא צוין בפוליסה" || raw === "לא מצוין בפוליסה") {
    return null;
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const parts = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (parts) {
    const day = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    let year = Number(parts[3]);
    if (year < 100) {
      year += 2000;
    }
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolvePremiumInfo(info?: AnalysisGeneralInfo): ResolvedPremiumInfo {
  const monthlyPremium = parseInsuranceMoneyValue(info?.monthlyPremium);
  const annualPremium = parseInsuranceMoneyValue(info?.annualPremium);
  const premiumPaymentPeriod = isKnownPremiumPeriod(info?.premiumPaymentPeriod)
    ? info.premiumPaymentPeriod
    : annualPremium > 0 && monthlyPremium <= 0
      ? "annual"
      : monthlyPremium > 0
        ? "monthly"
        : "unknown";

  if (premiumPaymentPeriod === "annual" && annualPremium > 0) {
    return {
      monthlyPremium: annualPremium / 12,
      annualPremium,
      premiumPaymentPeriod,
      premiumLabel: `${formatInsuranceCurrency(annualPremium)} לשנה`,
    };
  }

  if (monthlyPremium > 0) {
    return {
      monthlyPremium,
      annualPremium,
      premiumPaymentPeriod: premiumPaymentPeriod === "unknown" ? "monthly" : premiumPaymentPeriod,
      premiumLabel: `${formatInsuranceCurrency(monthlyPremium)} לחודש`,
    };
  }

  if (annualPremium > 0) {
    return {
      monthlyPremium: annualPremium / 12,
      annualPremium,
      premiumPaymentPeriod: "annual",
      premiumLabel: `${formatInsuranceCurrency(annualPremium)} לשנה`,
    };
  }

  return {
    monthlyPremium: 0,
    annualPremium: 0,
    premiumPaymentPeriod,
    premiumLabel: "לא זוהתה פרמיה",
  };
}

export function resolveInsuranceCategory(analysis: AnalysisLike): InsuranceCategory {
  return (
    analysis.insuranceCategory ??
    analysis.analysisResult?.generalInfo?.insuranceCategory ??
    inferInsuranceCategory(
      analysis.analysisResult?.generalInfo?.policyType,
      analysis.analysisResult?.coverages as any
    )
  );
}

export function isInsuranceCategoryRelevant(category: InsuranceCategory, profile?: ProfileLike | null) {
  if (!profile) {
    return category === "health";
  }
  if (category === "health") {
    return true;
  }
  if (category === "life") {
    return Boolean(
      profile.hasActiveMortgage ||
      (profile.numberOfChildren ?? 0) > 0 ||
      profile.maritalStatus === "married"
    );
  }
  if (category === "car") {
    return (profile.numberOfVehicles ?? 0) > 0;
  }
  return Boolean(profile.ownsApartment || profile.hasActiveMortgage);
}

function policyPriority(policy: InsuranceHubPolicy) {
  if (policy.daysUntilRenewal !== null) {
    return policy.daysUntilRenewal;
  }
  return 10_000 - policy.monthlyPremium;
}

export function buildInsuranceOverview(analyses: AnalysisLike[] | undefined, profile?: ProfileLike | null): InsuranceHubOverview {
  const completedPolicies = (analyses ?? [])
    .filter((analysis) => analysis.status === "completed" && analysis.analysisResult)
    .map((analysis) => {
      const info = analysis.analysisResult?.generalInfo;
      const premiumInfo = resolvePremiumInfo(info);
      const renewalDate = parseInsuranceDate(info?.endDate);
      const daysUntilRenewal = renewalDate
        ? Math.ceil((renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        sessionId: analysis.sessionId,
        category: resolveInsuranceCategory(analysis),
        policyName: info?.policyName || "פוליסה",
        insurerName: info?.insurerName || "לא ידוע",
        monthlyPremium: premiumInfo.monthlyPremium,
        annualPremium: premiumInfo.annualPremium,
        premiumPaymentPeriod: premiumInfo.premiumPaymentPeriod,
        premiumLabel: premiumInfo.premiumLabel,
        renewalDate,
        daysUntilRenewal,
        coverageCount: analysis.analysisResult?.coverages?.length ?? 0,
        summary: analysis.analysisResult?.summary || "אין סיכום זמין",
        duplicateCount:
          (analysis.analysisResult?.coverageOverlapGroups?.length ?? 0) +
          (analysis.analysisResult?.policyOverlapGroups?.length ?? 0) ||
          (analysis.analysisResult?.duplicateCoverages?.length ?? 0),
        coverageOverlapCount:
          analysis.analysisResult?.coverageOverlapGroups?.length ??
          analysis.analysisResult?.duplicateCoverages?.length ??
          0,
        policyOverlapCount: analysis.analysisResult?.policyOverlapGroups?.length ?? 0,
        personalizedInsights: analysis.analysisResult?.personalizedInsights ?? [],
        filesCount: analysis.files?.length ?? 0,
      } satisfies InsuranceHubPolicy;
    });

  const totalFiles = completedPolicies.reduce((sum, policy) => sum + policy.filesCount, 0);
  const totalMonthlyPremium = completedPolicies.reduce((sum, policy) => sum + policy.monthlyPremium, 0);
  const renewals = completedPolicies
    .filter((policy) => policy.daysUntilRenewal !== null && policy.daysUntilRenewal >= 0 && policy.daysUntilRenewal <= 90)
    .sort((a, b) => (a.daysUntilRenewal ?? 999) - (b.daysUntilRenewal ?? 999));
  const coverageOverlapGroups = completedPolicies.reduce(
    (sum, policy) => sum + policy.coverageOverlapCount,
    0,
  );
  const policyOverlapGroups = completedPolicies.reduce(
    (sum, policy) => sum + policy.policyOverlapCount,
    0,
  );
  const duplicateGroups = coverageOverlapGroups + policyOverlapGroups;

  const categorySummaries = (["health", "life", "car", "home"] as InsuranceCategory[]).reduce(
    (acc, category) => {
      const categoryPolicies = completedPolicies.filter((policy) => policy.category === category);
      const nextRenewalDays = categoryPolicies
        .map((policy) => policy.daysUntilRenewal)
        .filter((value): value is number => value !== null && value >= 0)
        .sort((a, b) => a - b)[0] ?? null;
      const monthlyPremium = categoryPolicies.reduce((sum, policy) => sum + policy.monthlyPremium, 0);
      const relevant = isInsuranceCategoryRelevant(category, profile);
      const highlight = !categoryPolicies.length
        ? relevant
          ? "כדאי להשלים כיסוי"
          : "מוכן כשתעלה פוליסה"
        : nextRenewalDays !== null
          ? `חידוש בעוד ${nextRenewalDays} ימים`
          : monthlyPremium > 0
            ? `${formatInsuranceCurrency(monthlyPremium)} לחודש`
            : `${categoryPolicies.length} פוליסות פעילות`;
      acc[category] = {
        category,
        scans: categoryPolicies.length,
        pdfs: categoryPolicies.reduce((sum, policy) => sum + policy.filesCount, 0),
        monthlyPremium,
        renewals: categoryPolicies.filter((policy) => policy.daysUntilRenewal !== null && policy.daysUntilRenewal >= 0 && policy.daysUntilRenewal <= 90).length,
        nextRenewalDays,
        relevant,
        hasData: categoryPolicies.length > 0,
        highlight,
      };
      return acc;
    },
    {} as Record<InsuranceCategory, InsuranceHubCategorySummary>
  );

  const coverageGaps: InsuranceHubInsight[] = [];

  if (categorySummaries.home.relevant && !categorySummaries.home.hasData) {
    coverageGaps.push({
      id: "gap-home",
      title: "אין עדיין תמונת כיסוי לדירה",
      description: "יש סימנים לבית או משכנתא בפרופיל, אבל עדיין לא נטענה פוליסת דירה.",
      tone: "warning",
      category: "home",
    });
  }
  if (categorySummaries.car.relevant && !categorySummaries.car.hasData) {
    coverageGaps.push({
      id: "gap-car",
      title: "רכבים בלי בדיקת כיסוי",
      description: "מופיעים רכבים בפרופיל, אבל אין עדיין מסמכי ביטוח רכב שנותחו.",
      tone: "warning",
      category: "car",
    });
  }
  if (categorySummaries.life.relevant && !categorySummaries.life.hasData) {
    coverageGaps.push({
      id: "gap-life",
      title: "כדאי לבדוק שכבת הגנה למשפחה",
      description: "משפחה, ילדים או משכנתא לרוב מצדיקים בדיקה של ביטוח חיים או הגנה דומה.",
      tone: "info",
      category: "life",
    });
  }
  if (categorySummaries.health.relevant && !categorySummaries.health.hasData) {
    coverageGaps.push({
      id: "gap-health",
      title: "אין עדיין מיפוי כיסוי בריאותי",
      description: "כדאי להעלות לפחות פוליסת בריאות אחת כדי שלומי יוכל לזהות כיסויים, חפיפות וחוסרים.",
      tone: "info",
      category: "health",
    });
  }

  const personalizedInsights = completedPolicies
    .flatMap((policy) =>
      policy.personalizedInsights.map((insight, index) => ({
        id: `${policy.sessionId}-${index}`,
        title: insight.title,
        description: insight.description,
        tone: (
          insight.type === "warning"
            ? "warning"
            : insight.type === "positive"
              ? "success"
              : "info"
        ) as InsuranceInsightTone,
        category: policy.category,
        priority: insight.priority ?? "medium",
      }))
    )
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority as keyof typeof order] - order[b.priority as keyof typeof order];
    });

  const insights: InsuranceHubInsight[] = [
    ...(renewals[0]
      ? [{
          id: `renewal-${renewals[0].sessionId}`,
          title: "יש חידוש ביטוח שקרוב אליך",
          description: `${renewals[0].policyName} מתקרבת לחידוש בעוד ${renewals[0].daysUntilRenewal} ימים.`,
          tone: "info" as InsuranceInsightTone,
          category: renewals[0].category,
        }]
      : []),
    ...(duplicateGroups > 0
      ? [{
          id: "duplicates",
          title: policyOverlapGroups > 0 ? "זוהו חפיפות בכיסויים ובפוליסות" : "זוהו חפיפות בין כיסויים",
          description:
            policyOverlapGroups > 0
              ? `לומי זיהה ${coverageOverlapGroups} חפיפות כיסוי ו-${policyOverlapGroups} חפיפות פוליסה שכדאי לבדוק.`
              : `לומי זיהה ${coverageOverlapGroups} חפיפות כיסוי שכדאי לבדוק.`,
          tone: "warning" as InsuranceInsightTone,
        }]
      : []),
    ...coverageGaps,
    ...personalizedInsights.slice(0, 3).map(({ priority, ...insight }) => insight),
  ]
    .filter((insight, index, allInsights) => allInsights.findIndex((item) => item.title === insight.title) === index)
    .slice(0, 4);

  if (!insights.length && completedPolicies.length > 0) {
    insights.push({
      id: "positive-overview",
      title: "יש לך כבר שכבת ביטוח פעילה",
      description: `כרגע זוהו ${completedPolicies.length} פוליסות עם פרמיה חודשית כוללת של ${formatInsuranceCurrency(totalMonthlyPremium)}.`,
      tone: "success" as InsuranceInsightTone,
    });
  }

  return {
    completedPolicies,
    totalPolicies: completedPolicies.length,
    totalFiles,
    totalMonthlyPremium,
    renewals,
    duplicateGroups,
    coverageOverlapGroups,
    policyOverlapGroups,
    categorySummaries,
    insights,
    coverageGaps,
    prioritizedPolicies: [...completedPolicies].sort((a, b) => policyPriority(a) - policyPriority(b)).slice(0, 4),
  };
}

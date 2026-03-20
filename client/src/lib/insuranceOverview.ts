import { inferInsuranceCategory, type InsuranceCategory } from "@shared/insurance";

type AnalysisLike = {
  sessionId: string;
  status: string;
  createdAt: string | Date;
  files?: unknown[];
  insuranceCategory?: InsuranceCategory | null;
  analysisResult?: {
    generalInfo?: {
      policyName?: string;
      insurerName?: string;
      monthlyPremium?: string;
      endDate?: string;
      insuranceCategory?: InsuranceCategory;
      policyType?: string;
    };
    coverages?: unknown[];
    duplicateCoverages?: Array<unknown>;
    personalizedInsights?: Array<{
      title: string;
      description: string;
      type?: "warning" | "recommendation" | "positive";
      priority?: "high" | "medium" | "low";
    }>;
    summary?: string;
  } | null;
};

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
  premiumLabel: string;
  renewalDate: Date | null;
  daysUntilRenewal: number | null;
  coverageCount: number;
  summary: string;
  duplicateCount: number;
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

export function parseInsuranceMoneyValue(raw?: string | null) {
  if (!raw) return 0;
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

export function parseInsuranceDate(raw?: string | null) {
  if (!raw || raw === "לא צוין בפוליסה" || raw === "לא מצוין בפוליסה") {
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
      const monthlyPremium = parseInsuranceMoneyValue(info?.monthlyPremium);
      const renewalDate = parseInsuranceDate(info?.endDate);
      const daysUntilRenewal = renewalDate
        ? Math.ceil((renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      return {
        sessionId: analysis.sessionId,
        category: resolveInsuranceCategory(analysis),
        policyName: info?.policyName || "פוליסה",
        insurerName: info?.insurerName || "לא ידוע",
        monthlyPremium,
        premiumLabel: monthlyPremium > 0 ? formatInsuranceCurrency(monthlyPremium) : "לא זוהתה פרמיה",
        renewalDate,
        daysUntilRenewal,
        coverageCount: analysis.analysisResult?.coverages?.length ?? 0,
        summary: analysis.analysisResult?.summary || "אין סיכום זמין",
        duplicateCount: analysis.analysisResult?.duplicateCoverages?.length ?? 0,
        personalizedInsights: analysis.analysisResult?.personalizedInsights ?? [],
        filesCount: analysis.files?.length ?? 0,
      } satisfies InsuranceHubPolicy;
    });

  const totalFiles = completedPolicies.reduce((sum, policy) => sum + policy.filesCount, 0);
  const totalMonthlyPremium = completedPolicies.reduce((sum, policy) => sum + policy.monthlyPremium, 0);
  const renewals = completedPolicies
    .filter((policy) => policy.daysUntilRenewal !== null && policy.daysUntilRenewal >= 0 && policy.daysUntilRenewal <= 90)
    .sort((a, b) => (a.daysUntilRenewal ?? 999) - (b.daysUntilRenewal ?? 999));
  const duplicateGroups = completedPolicies.reduce((sum, policy) => sum + policy.duplicateCount, 0);

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
          title: "זוהו חפיפות בין כיסויים",
          description: `לומי זיהה ${duplicateGroups} קבוצות של כיסויים כפולים שכדאי לבדוק.`,
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
    categorySummaries,
    insights,
    coverageGaps,
    prioritizedPolicies: [...completedPolicies].sort((a, b) => policyPriority(a) - policyPriority(b)).slice(0, 4),
  };
}

import crypto from "crypto";
import type { InsuranceCategory, PolicyAnalysis } from "@shared/insurance";
import {
  buildInsuranceOverview,
  formatInsuranceCurrency,
  insuranceCategoryLabels,
  parseInsuranceMoneyValue,
} from "../client/src/lib/insuranceOverview";
import { buildFamilyCoverageSnapshot } from "../client/src/lib/familyCoverage";

export type InsuranceHubAnalysis = {
  id?: number;
  sessionId: string;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date | null;
  insuranceCategory?: InsuranceCategory | null;
  files?: Array<{ name?: string; size?: number; fileKey?: string; mimeType?: string }>;
  analysisResult?: PolicyAnalysis | null;
};

export type InsuranceHubProfile = {
  id?: number;
  userId?: number;
  maritalStatus?: string | null;
  numberOfChildren?: number | null;
  ownsApartment?: boolean | null;
  hasActiveMortgage?: boolean | null;
  numberOfVehicles?: number | null;
  hasSpecialHealthConditions?: boolean | null;
  onboardingCompleted?: boolean | null;
  updatedAt?: string | Date | null;
};

export type InsuranceHubFamilyMember = {
  id: number;
  fullName: string;
  relation: "spouse" | "child" | "parent" | "dependent" | "other";
  birthDate?: string | Date | null;
  ageLabel?: string | null;
  gender?: string | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  activities?: string | null;
  insuranceNotes?: string | null;
  notes?: string | null;
  updatedAt?: string | Date | null;
};

export type InsuranceHubDiscovery = {
  id?: number;
  provider?: string | null;
  insuranceCategory?: string | null;
  artifactType?: string | null;
  confidence?: number | null;
  premiumAmount?: number | string | null;
  policyNumber?: string | null;
  documentDate?: string | Date | null;
  subject?: string | null;
  summary?: string | null;
  actionHint?: string | null;
  attachmentFilename?: string | null;
  attachmentUrl?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  extractedData?: unknown;
};

export type InsuranceHubInvoice = {
  id?: number;
  provider?: string | null;
  category?: string | null;
  customCategory?: string | null;
  amount?: number | string | null;
  invoiceDate?: string | Date | null;
  dueDate?: string | Date | null;
  flowDirection?: string | null;
  status?: string | null;
  createdAt?: string | Date | null;
};

export type SavingsOpportunityType = "duplicate" | "overpriced" | "unnecessary" | "gap";
export type SavingsOpportunityStatus = "open" | "completed" | "dismissed";
export type ActionItemType = "savings" | "renewal" | "gap" | "monitoring";
export type ActionItemStatus = "pending" | "completed" | "dismissed";
export type PriorityLevel = "high" | "medium" | "low";

export type SavingsOpportunityDraft = {
  opportunityKey: string;
  type: SavingsOpportunityType;
  title: string;
  description: string;
  monthlySaving: number;
  annualSaving: number;
  priority: PriorityLevel;
  actionSteps: string[];
  relatedSessionIds: string[];
  status: SavingsOpportunityStatus;
};

export type ActionItemDraft = {
  actionKey: string;
  relatedOpportunityKey?: string | null;
  type: ActionItemType;
  title: string;
  description: string;
  instructions: string[];
  potentialSaving: number;
  priority: PriorityLevel;
  status: ActionItemStatus;
  dueDate: Date | null;
};

export type MonitoringChange = {
  id: string;
  type: "new_charge" | "amount_change" | "missing_charge";
  provider: string;
  summary: string;
  currentAmount: number | null;
  previousAmount: number | null;
  month: string;
};

export type InsuranceScoreSnapshot = {
  score: number;
  breakdown: {
    completeness: number;
    duplicates: number;
    warnings: number;
    renewals: number;
    family: number;
    discoveries: number;
  };
  totalMonthlySpend: number;
  potentialSavings: number;
  overview: ReturnType<typeof buildInsuranceOverview>;
  coverageSnapshot: ReturnType<typeof buildFamilyCoverageSnapshot>;
};

export type SavingsReportDraft = {
  overview: string;
  totalMonthlySaving: number;
  totalAnnualSaving: number;
  savedSoFar: number;
  opportunities: SavingsOpportunityDraft[];
};

export type MonthlyReportDraft = {
  month: string;
  scoreAtTime: number;
  scoreChange: number;
  changes: MonitoringChange[];
  newActions: ActionItemDraft[];
  summary: string;
};

const priorityOrder: Record<PriorityLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function toDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function getMonthKey(dateValue: string | Date | null | undefined) {
  const parsed = toDate(dateValue);
  if (!parsed) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function getInsuranceInvoiceTotal(invoices: InsuranceHubInvoice[]) {
  return invoices
    .filter((invoice) => {
      const category = invoice.customCategory ?? invoice.category ?? "";
      return category.includes("ביטוח") && (invoice.flowDirection ?? "expense") === "expense";
    })
    .reduce((sum, invoice) => sum + toNumber(invoice.amount), 0);
}

function normalizeProfile(profile?: InsuranceHubProfile | null) {
  if (!profile) return null;
  return {
    ...profile,
    numberOfChildren: profile.numberOfChildren ?? 0,
    ownsApartment: Boolean(profile.ownsApartment),
    hasActiveMortgage: Boolean(profile.hasActiveMortgage),
    numberOfVehicles: profile.numberOfVehicles ?? 0,
    hasSpecialHealthConditions: Boolean(profile.hasSpecialHealthConditions),
  };
}

function getPolicyMonthlyPremium(analysis: InsuranceHubAnalysis) {
  const info = analysis.analysisResult?.generalInfo;
  const monthlyPremium = parseInsuranceMoneyValue(info?.monthlyPremium);
  const annualPremium = parseInsuranceMoneyValue(info?.annualPremium);
  if (info?.premiumPaymentPeriod === "annual" && annualPremium > 0) {
    return annualPremium / 12;
  }
  if (monthlyPremium > 0) {
    return monthlyPremium;
  }
  if (annualPremium > 0) {
    return annualPremium / 12;
  }
  return 0;
}

function getPolicyProvider(analysis: InsuranceHubAnalysis) {
  return analysis.analysisResult?.generalInfo?.insurerName?.trim() || "";
}

function getRelevantFamilyCellCount(coverageSnapshot: ReturnType<typeof buildFamilyCoverageSnapshot>) {
  return coverageSnapshot.rows.reduce((sum, row) => {
    return sum + row.cells.filter((cell) => cell.status !== "not_relevant").length;
  }, 0);
}

export function buildWorkspaceDataHash(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function buildSavingsReportDraft(params: {
  analyses: InsuranceHubAnalysis[];
  profile?: InsuranceHubProfile | null;
  familyMembers?: InsuranceHubFamilyMember[];
  insuranceDiscoveries?: InsuranceHubDiscovery[];
  invoices?: InsuranceHubInvoice[];
  previousStatuses?: Record<string, SavingsOpportunityStatus>;
}) {
  const normalizedProfile = normalizeProfile(params.profile);
  const overview = buildInsuranceOverview(params.analyses, normalizedProfile);
  const opportunities: SavingsOpportunityDraft[] = [];
  const discoveries = params.insuranceDiscoveries ?? [];

  params.analyses
    .filter((analysis) => analysis.status === "completed" && analysis.analysisResult)
    .forEach((analysis) => {
      const policyName = analysis.analysisResult?.generalInfo?.policyName || "פוליסה";
      const provider = getPolicyProvider(analysis) || "חברת הביטוח";
      const monthlyPremium = getPolicyMonthlyPremium(analysis);
      (analysis.analysisResult?.duplicateCoverages ?? []).forEach((duplicate, index) => {
        const monthlySaving = monthlyPremium > 0 ? Math.max(35, Math.round(monthlyPremium * 0.18)) : 75;
        const annualSaving = monthlySaving * 12;
        const opportunityKey = `duplicate-${analysis.sessionId}-${index + 1}`;
        opportunities.push({
          opportunityKey,
          type: "duplicate",
          title: `ייתכן כפל כיסוי ב-${duplicate.title}`,
          description: `${duplicate.explanation} בפוליסה ${policyName} של ${provider}.`,
          monthlySaving,
          annualSaving,
          priority: "high",
          actionSteps: [
            `לפתוח את ${policyName} ולבדוק את כיסוי ${duplicate.title}.`,
            "להשוות מול שאר הפוליסות מאותה קטגוריה בתיק.",
            "להחליט אם לצמצם, לאחד או לבטל כיסוי כפול.",
          ],
          relatedSessionIds: [analysis.sessionId],
          status: params.previousStatuses?.[opportunityKey] ?? "open",
        });
      });
    });

  overview.coverageGaps.forEach((gap) => {
    const opportunityKey = `gap-${gap.category ?? gap.id}`;
    opportunities.push({
      opportunityKey,
      type: "gap",
      title: gap.title,
      description: gap.description,
      monthlySaving: 0,
      annualSaving: 0,
      priority: gap.tone === "warning" ? "high" : "medium",
      actionSteps: [
        "להעלות מסמך רלוונטי או להוסיף פוליסה ידנית.",
        "לבדוק עם לומי אם הפער הזה באמת חשוב למבנה המשפחה הנוכחי.",
      ],
      relatedSessionIds: [],
      status: params.previousStatuses?.[opportunityKey] ?? "open",
    });
  });

  discoveries.forEach((discovery, index) => {
    if (discovery.artifactType !== "premium_notice" && discovery.artifactType !== "renewal_notice") {
      return;
    }
    const discoveryPremium = toNumber(discovery.premiumAmount);
    const matchingAnalyses = params.analyses.filter((analysis) => {
      if (analysis.status !== "completed" || !analysis.analysisResult) return false;
      const provider = getPolicyProvider(analysis).toLowerCase();
      const discoveryProvider = (discovery.provider ?? "").toLowerCase();
      const sameProvider = provider && discoveryProvider && provider.includes(discoveryProvider);
      const sameCategory =
        discovery.insuranceCategory &&
        (analysis.insuranceCategory ?? analysis.analysisResult?.generalInfo?.insuranceCategory) === discovery.insuranceCategory;
      return sameProvider || sameCategory;
    });
    const baselinePremium = matchingAnalyses[0] ? getPolicyMonthlyPremium(matchingAnalyses[0]) : 0;
    const increase = discoveryPremium > 0 && baselinePremium > 0 ? discoveryPremium - baselinePremium : 0;
    const categoryLabel =
      discovery.insuranceCategory &&
      (discovery.insuranceCategory === "health" ||
        discovery.insuranceCategory === "life" ||
        discovery.insuranceCategory === "car" ||
        discovery.insuranceCategory === "home")
        ? insuranceCategoryLabels[discovery.insuranceCategory]
        : "ביטוח";

    if (increase >= 20) {
      const opportunityKey = `premium-change-${discovery.id ?? index + 1}`;
      opportunities.push({
        opportunityKey,
        type: "overpriced",
        title: `נראית עליית פרמיה ב-${discovery.provider || categoryLabel}`,
        description: `במייל זוהתה פרמיה של ${formatInsuranceCurrency(discoveryPremium)} לעומת ${formatInsuranceCurrency(baselinePremium)} בתיק הקיים.`,
        monthlySaving: increase,
        annualSaving: increase * 12,
        priority: increase >= 60 ? "high" : "medium",
        actionSteps: [
          "להשוות בין תנאי החידוש לבין הפוליסה שכבר נותחה.",
          "לבקש הצעה מעודכנת או הסבר על ההתייקרות.",
          "להחליט אם לאשר, לשפר תנאים או לעבור למסלול אחר.",
        ],
        relatedSessionIds: matchingAnalyses.map((analysis) => analysis.sessionId),
        status: params.previousStatuses?.[opportunityKey] ?? "open",
      });
      return;
    }

    if (discoveryPremium > 0 && matchingAnalyses.length === 0) {
      const opportunityKey = `orphan-premium-${discovery.id ?? index + 1}`;
      opportunities.push({
        opportunityKey,
        type: "gap",
        title: `יש חיוב ${categoryLabel} בלי פוליסה מנותחת`,
        description: `${discovery.provider || "גוף ביטוחי"} שלח עדכון פרמיה, אבל עדיין אין בתיק פוליסה מסודרת שמסבירה את החיוב.`,
        monthlySaving: 0,
        annualSaving: 0,
        priority: "medium",
        actionSteps: [
          "לייבא את המסמך מהמייל או להעלות את הפוליסה הרלוונטית.",
          "לבדוק עם לומי מה בדיוק כולל החיוב הזה.",
        ],
        relatedSessionIds: [],
        status: params.previousStatuses?.[opportunityKey] ?? "open",
      });
    }
  });

  const deduped = Array.from(
    new Map(opportunities.map((opportunity) => [opportunity.opportunityKey, opportunity])).values()
  ).sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.annualSaving - a.annualSaving;
  });

  const totalMonthlySaving = deduped.reduce((sum, opportunity) => sum + opportunity.monthlySaving, 0);
  const totalAnnualSaving = deduped.reduce((sum, opportunity) => sum + opportunity.annualSaving, 0);
  const savedSoFar = deduped
    .filter((opportunity) => opportunity.status === "completed")
    .reduce((sum, opportunity) => sum + opportunity.annualSaving, 0);

  let overviewText = "עדיין אין מספיק נתונים כדי לזהות הזדמנויות חיסכון ממוקדות.";
  if (deduped.length > 0) {
    overviewText =
      totalMonthlySaving > 0
        ? `זוהו ${deduped.length} הזדמנויות פעולה עם פוטנציאל חיסכון של ${formatInsuranceCurrency(totalMonthlySaving)} לחודש.`
        : `זוהו ${deduped.length} נקודות שדורשות פעולה כדי לשפר את התיק הביטוחי.`;
  } else if (overview.renewals.length > 0 || discoveries.length > 0) {
    overviewText = "אין כרגע חיסכון ישיר ברור, אבל יש חידושים ומסמכי Gmail שכדאי לבדוק כדי למנוע התייקרויות.";
  }

  return {
    overview: overviewText,
    totalMonthlySaving,
    totalAnnualSaving,
    savedSoFar,
    opportunities: deduped,
  } satisfies SavingsReportDraft;
}

export function buildInsuranceScoreSnapshot(params: {
  analyses: InsuranceHubAnalysis[];
  profile?: InsuranceHubProfile | null;
  familyMembers?: InsuranceHubFamilyMember[];
  insuranceDiscoveries?: InsuranceHubDiscovery[];
  invoices?: InsuranceHubInvoice[];
  potentialSavings?: number;
}) {
  const normalizedProfile = normalizeProfile(params.profile);
  const overview = buildInsuranceOverview(params.analyses, normalizedProfile);
  const coverageSnapshot = buildFamilyCoverageSnapshot(
    params.analyses,
    normalizedProfile,
    params.familyMembers ?? []
  );
  const relevantCategories = Object.values(overview.categorySummaries).filter((category) => category.relevant);
  const coveredCategories = relevantCategories.filter((category) => category.hasData).length;
  const completeness = relevantCategories.length > 0
    ? Math.round((coveredCategories / relevantCategories.length) * 40)
    : 20;
  const duplicates = Math.max(0, 20 - overview.duplicateGroups * 4);
  const warningCount = params.analyses.reduce((sum, analysis) => {
    return sum + (analysis.analysisResult?.personalizedInsights ?? []).filter((insight) => insight.type === "warning").length;
  }, 0);
  const warnings = Math.max(0, 15 - warningCount * 3);
  const expiringSoon = overview.renewals.filter((policy) => (policy.daysUntilRenewal ?? 999) <= 30).length;
  const renewals = Math.max(0, 15 - expiringSoon * 5 - Math.max(0, overview.renewals.length - expiringSoon) * 2);
  const relevantFamilyCells = getRelevantFamilyCellCount(coverageSnapshot);
  const familyProtectedCells = coverageSnapshot.rows.reduce((sum, row) => {
    return sum + row.cells.filter((cell) => cell.status === "household_covered").length;
  }, 0);
  const family = relevantFamilyCells > 0
    ? Math.round((familyProtectedCells / relevantFamilyCells) * 10)
    : 10;
  const discoveries = (params.insuranceDiscoveries?.length ?? 0) > 0 ? 5 : 0;
  const score = Math.max(0, Math.min(100, completeness + duplicates + warnings + renewals + family + discoveries));
  const totalMonthlySpend = Math.max(overview.totalMonthlyPremium, getInsuranceInvoiceTotal(params.invoices ?? []));

  return {
    score,
    breakdown: {
      completeness,
      duplicates,
      warnings,
      renewals,
      family,
      discoveries,
    },
    totalMonthlySpend,
    potentialSavings: Math.max(0, params.potentialSavings ?? 0),
    overview,
    coverageSnapshot,
  } satisfies InsuranceScoreSnapshot;
}

export function buildActionItemsDraft(params: {
  opportunities: SavingsOpportunityDraft[];
  analyses: InsuranceHubAnalysis[];
  profile?: InsuranceHubProfile | null;
  familyMembers?: InsuranceHubFamilyMember[];
  monitoringChanges?: MonitoringChange[];
  previousStatuses?: Record<string, ActionItemStatus>;
}) {
  const normalizedProfile = normalizeProfile(params.profile);
  const overview = buildInsuranceOverview(params.analyses, normalizedProfile);
  const actions: ActionItemDraft[] = params.opportunities.map((opportunity) => ({
    actionKey: `savings-${opportunity.opportunityKey}`,
    relatedOpportunityKey: opportunity.opportunityKey,
    type: "savings",
    title: opportunity.title,
    description: opportunity.description,
    instructions: opportunity.actionSteps,
    potentialSaving: opportunity.monthlySaving,
    priority: opportunity.priority,
    status: params.previousStatuses?.[`savings-${opportunity.opportunityKey}`] ?? "pending",
    dueDate: null,
  }));

  overview.renewals.slice(0, 3).forEach((renewal) => {
    const actionKey = `renewal-${renewal.sessionId}`;
    actions.push({
      actionKey,
      type: "renewal",
      title: `${renewal.policyName} מתקרבת לחידוש`,
      description: `נשארו ${renewal.daysUntilRenewal ?? 0} ימים עד החידוש של ${renewal.insurerName}.`,
      instructions: [
        "לבדוק אם המחיר והכיסוי עדיין מתאימים למבנה המשפחה.",
        "להשוות מול מסמכים או חידושים חדשים מהמייל.",
        "להחליט אם לאשר, לנהל משא ומתן או לשנות מסלול.",
      ],
      potentialSaving: 0,
      priority: (renewal.daysUntilRenewal ?? 999) <= 30 ? "high" : "medium",
      status: params.previousStatuses?.[actionKey] ?? "pending",
      dueDate: renewal.renewalDate,
    });
  });

  overview.coverageGaps.slice(0, 3).forEach((gap) => {
    const actionKey = `gap-${gap.category ?? gap.id}`;
    actions.push({
      actionKey,
      type: "gap",
      title: gap.title,
      description: gap.description,
      instructions: [
        "להעלות מסמך רלוונטי או להזין פוליסה ידנית.",
        "להצליב את הפער הזה מול המשפחה והצרכים הקיימים.",
      ],
      potentialSaving: 0,
      priority: gap.tone === "warning" ? "high" : "medium",
      status: params.previousStatuses?.[actionKey] ?? "pending",
      dueDate: null,
    });
  });

  (params.monitoringChanges ?? []).slice(0, 5).forEach((change) => {
    const actionKey = `monitoring-${change.id}`;
    actions.push({
      actionKey,
      type: "monitoring",
      title:
        change.type === "new_charge"
          ? `נוצר חיוב חדש אצל ${change.provider}`
          : change.type === "missing_charge"
            ? `נעלם חיוב צפוי אצל ${change.provider}`
            : `הסכום אצל ${change.provider} השתנה`,
      description: change.summary,
      instructions: [
        "להיכנס למסמך או למייל הרלוונטי ולוודא מה השתנה.",
        "להחליט אם צריך לעדכן את התיק או לפנות לחברת הביטוח.",
      ],
      potentialSaving: Math.max(0, (change.currentAmount ?? 0) - (change.previousAmount ?? 0)),
      priority: change.type === "amount_change" ? "high" : "medium",
      status: params.previousStatuses?.[actionKey] ?? "pending",
      dueDate: null,
    });
  });

  return Array.from(new Map(actions.map((action) => [action.actionKey, action])).values()).sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.potentialSaving - a.potentialSaving;
  });
}

export function buildMonthlyReportDraft(params: {
  invoices: InsuranceHubInvoice[];
  currentScore: number;
  previousScore?: number | null;
  previousStatuses?: Record<string, ActionItemStatus>;
}) {
  const monthlyInsuranceTotals = new Map<string, Map<string, number>>();

  params.invoices.forEach((invoice) => {
    const category = invoice.customCategory ?? invoice.category ?? "";
    if (!category.includes("ביטוח") || (invoice.flowDirection ?? "expense") !== "expense") {
      return;
    }
    const provider = invoice.provider?.trim() || "ספק לא מזוהה";
    const month = getMonthKey(invoice.invoiceDate);
    if (!month) {
      return;
    }
    const amount = toNumber(invoice.amount);
    if (!monthlyInsuranceTotals.has(month)) {
      monthlyInsuranceTotals.set(month, new Map());
    }
    const bucket = monthlyInsuranceTotals.get(month)!;
    bucket.set(provider, (bucket.get(provider) ?? 0) + amount);
  });

  const availableMonths = Array.from(monthlyInsuranceTotals.keys()).sort();
  const month = availableMonths[availableMonths.length - 1] ?? getMonthKey(new Date()) ?? "0000-00";
  const previousMonth = availableMonths.length > 1 ? availableMonths[availableMonths.length - 2] : null;
  const currentTotals = monthlyInsuranceTotals.get(month) ?? new Map<string, number>();
  const priorTotals = previousMonth ? monthlyInsuranceTotals.get(previousMonth) ?? new Map<string, number>() : new Map<string, number>();
  const changes: MonitoringChange[] = [];

  currentTotals.forEach((amount, provider) => {
    if (!priorTotals.has(provider)) {
      changes.push({
        id: `${month}-${provider}-new`,
        type: "new_charge",
        provider,
        summary: `זוהה אצל ${provider} חיוב חדש של ${formatInsuranceCurrency(amount)} בחודש ${month}.`,
        currentAmount: amount,
        previousAmount: null,
        month,
      });
      return;
    }
    const previousAmount = priorTotals.get(provider) ?? 0;
    if (Math.abs(amount - previousAmount) >= 20) {
      changes.push({
        id: `${month}-${provider}-delta`,
        type: "amount_change",
        provider,
        summary: `החיוב אצל ${provider} השתנה מ-${formatInsuranceCurrency(previousAmount)} ל-${formatInsuranceCurrency(amount)}.`,
        currentAmount: amount,
        previousAmount,
        month,
      });
    }
  });

  priorTotals.forEach((amount, provider) => {
    if (!currentTotals.has(provider)) {
      changes.push({
        id: `${month}-${provider}-missing`,
        type: "missing_charge",
        provider,
        summary: `בחודש הקודם היה אצל ${provider} חיוב של ${formatInsuranceCurrency(amount)}, ובחודש ${month} הוא לא הופיע.`,
        currentAmount: null,
        previousAmount: amount,
        month,
      });
    }
  });

  const newActions = buildActionItemsDraft({
    opportunities: [],
    analyses: [],
    monitoringChanges: changes,
    previousStatuses: params.previousStatuses,
  }).slice(0, 5);

  const scoreChange = params.currentScore - (params.previousScore ?? params.currentScore);
  let summary = "לא זוהו שינויי חיוב ביטוחיים מהותיים בין החודש הנוכחי לחודש הקודם.";
  if (changes.length > 0) {
    summary = `זוהו ${changes.length} שינויי חיוב ביטוחיים בחודש ${month}, כולל חיובים חדשים, חיובים שנעלמו או סכומים שהשתנו.`;
  } else if (!previousMonth) {
    summary = "עדיין אין מספיק היסטוריה חודשית כדי להשוות שינויי חיוב ביטוחיים.";
  }

  return {
    month,
    scoreAtTime: params.currentScore,
    scoreChange,
    changes,
    newActions,
    summary,
  } satisfies MonthlyReportDraft;
}

export function buildManualPolicyAnalysis(params: {
  company: string;
  category: InsuranceCategory;
  monthlyPremium?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  coveredMembers?: string[];
}) {
  const categoryLabel = insuranceCategoryLabels[params.category];
  const premium = params.monthlyPremium && params.monthlyPremium > 0
    ? formatInsuranceCurrency(params.monthlyPremium)
    : "לא צוין";
  const coveredMembersText = (params.coveredMembers ?? []).filter(Boolean);

  return {
    generalInfo: {
      policyName: `${categoryLabel} ידני`,
      insurerName: params.company,
      policyNumber: "manual-entry",
      policyType: params.category,
      insuranceCategory: params.category,
      premiumPaymentPeriod: params.monthlyPremium && params.monthlyPremium > 0 ? "monthly" : "unknown",
      monthlyPremium: premium,
      annualPremium: params.monthlyPremium && params.monthlyPremium > 0 ? formatInsuranceCurrency(params.monthlyPremium * 12) : "לא צוין",
      startDate: params.startDate || "לא צוין",
      endDate: params.endDate || "לא צוין",
      importantNotes: coveredMembersText.length > 0 ? [`כיסוי מדווח עבור: ${coveredMembersText.join(", ")}`] : [],
      fineprint: ["פוליסה זו הוזנה ידנית ולכן כדאי להשלים מסמך מלא בהמשך."],
    },
    summary: `פוליסה ידנית בקטגוריית ${categoryLabel} אצל ${params.company}.`,
    coverages: [
      {
        id: "manual-coverage",
        title: categoryLabel,
        category: categoryLabel,
        limit: "לא צוין",
        details: "הוזן ידנית על ידי המשתמש",
        eligibility: coveredMembersText.length > 0 ? coveredMembersText.join(", ") : "לא צוין",
        copay: "לא צוין",
        maxReimbursement: "לא צוין",
        exclusions: "לא צוין",
        waitingPeriod: "לא צוין",
      },
    ],
    duplicateCoverages: [],
    personalizedInsights: [
      {
        id: "manual-followup",
        type: "recommendation" as const,
        title: "כדאי להשלים מסמך מלא",
        description: "הזנה ידנית נותנת ללומי הקשר ראשוני, אבל מסמך מלא יאפשר זיהוי מדויק יותר של כיסויים וחפיפות.",
        priority: "medium" as const,
      },
    ],
  } satisfies PolicyAnalysis;
}

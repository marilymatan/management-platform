import type { InsuranceCategory, PolicyAnalysis } from "@shared/insurance";
import { summarizeMonthlyInvoices } from "./invoiceSummary";
import { buildProfileContext, formatIls, formatMonthLabel } from "./helpers";

type AssistantTone = "neutral" | "info" | "success" | "warning";

type AssistantChip = {
  label: string;
  tone: AssistantTone;
};

type AssistantAnalysis = {
  createdAt?: string | Date | null;
  status?: string | null;
  files?: unknown[] | null;
  insuranceCategory?: InsuranceCategory | null;
  analysisResult?: PolicyAnalysis | null;
};

type AssistantInvoice = {
  provider?: string | null;
  amount?: string | null;
  status?: string | null;
  flowDirection?: string | null;
  invoiceDate?: string | Date | null;
  dueDate?: string | Date | null;
  createdAt: string | Date;
  category?: string | null;
  customCategory?: string | null;
  subject?: string | null;
  rawText?: string | null;
  extractedData?: unknown;
};

type AssistantInsuranceDiscovery = {
  provider?: string | null;
  insuranceCategory?: InsuranceCategory | string | null;
  artifactType?: string | null;
  confidence?: number | string | null;
  premiumAmount?: number | string | null;
  policyNumber?: string | null;
  documentDate?: string | Date | null;
  subject?: string | null;
  summary?: string | null;
  actionHint?: string | null;
  attachmentFilename?: string | null;
  attachmentUrl?: string | null;
  extractedData?: unknown;
};

type AssistantFamilyMember = {
  id?: number | null;
  relation?: string | null;
  fullName?: string | null;
  ageLabel?: string | null;
  birthDate?: string | Date | null;
  allergies?: string | null;
  medicalNotes?: string | null;
  activities?: string | null;
  insuranceNotes?: string | null;
  notes?: string | null;
};

type AssistantDocumentClassification = {
  documentKey: string;
  sourceType?: string | null;
  sourceId?: string | null;
  manualType?: string | null;
  familyMemberId?: number | null;
  updatedAt?: string | Date | null;
};

type QuestionSignals = {
  terms: string[];
  matchedCategories: InsuranceCategory[];
  isInsuranceQuestion: boolean;
  isMoneyQuestion: boolean;
  isFamilyQuestion: boolean;
  isDocumentQuestion: boolean;
  domainCount: number;
};

type RelevantPolicy = {
  analysis: AssistantAnalysis;
  score: number;
  matchedCoverageCount: number;
  matchedTermCount: number;
  hasCategoryMatch: boolean;
};

type RelevantInvoice = {
  invoice: AssistantInvoice;
  score: number;
};

type RelevantInsuranceDiscovery = {
  discovery: AssistantInsuranceDiscovery;
  score: number;
};

type RelevantDocument = {
  document: AssistantDocumentClassification;
  score: number;
};

export type AssistantHomeContext = {
  greeting: string;
  chips: AssistantChip[];
  suggestedPrompts: string[];
};

export type AssistantPromptMeta = {
  domainCount: number;
  termCount: number;
  relevantPolicyCount: number;
  relevantInvoiceCount: number;
  relevantDocumentCount: number;
  matchedCoverageCount: number;
  matchedCategories: InsuranceCategory[];
  suggestedHistoryLimit: number;
};

export type AssistantPromptResult = {
  systemPrompt: string;
  meta: AssistantPromptMeta;
};

const GENERIC_TERMS = new Set([
  "האם",
  "איך",
  "מה",
  "כמה",
  "למה",
  "מתי",
  "איפה",
  "יש",
  "של",
  "שלי",
  "שלנו",
  "הוא",
  "היא",
  "אני",
  "אנחנו",
  "עם",
  "בלי",
  "על",
  "זה",
  "זאת",
  "זו",
  "או",
  "אם",
  "גם",
  "כל",
  "כרגע",
  "עכשיו",
  "מתוך",
  "בתוך",
  "עבור",
  "אפשר",
  "יכול",
  "יכולה",
  "רוצה",
  "לדעת",
  "לומר",
  "לי",
  "לנו",
]);

const INSURANCE_KEYWORDS = [
  "ביטוח",
  "פוליסה",
  "חידוש",
  "חידושים",
  "פרמיה",
  "פרמיות",
  "כיסוי",
  "כיסויים",
  "השתתפות",
  "אכשרה",
  "החזר",
  "החזרים",
  "חריג",
  "החרגה",
  "ניתוח",
  "שיניים",
  "רפואה",
  "בריאות",
  "חיים",
  "רכב",
  "דירה",
  "תביעה",
  "סוכן",
  "ביטוחים",
];

const MONEY_KEYWORDS = [
  "הוצאה",
  "הוצאות",
  "הכנסה",
  "הכנסות",
  "תשלום",
  "תשלומים",
  "חשבונית",
  "חשבוניות",
  "חיוב",
  "זיכוי",
  "כסף",
  "תקציב",
  "נטו",
  "סכום",
  "שילמתי",
  "שולם",
];

const FAMILY_KEYWORDS = [
  "ילד",
  "ילדה",
  "ילדים",
  "משפחה",
  "בן",
  "בת",
  "בעלי",
  "אשתי",
  "הורים",
  "משפחתי",
  "תלוי",
  "תלויים",
];

const DOCUMENT_KEYWORDS = [
  "מסמך",
  "מסמכים",
  "קובץ",
  "קבצים",
  "pdf",
  "מייל",
  "מיילים",
  "gmail",
  "מסמכ",
];

const COMPLEX_QUERY_KEYWORDS = [
  "מכוסה",
  "כיסוי",
  "כיסויים",
  "זכאות",
  "השתתפות",
  "אכשרה",
  "החרגה",
  "החרגות",
  "מגבלה",
  "מגבלות",
  "חריג",
  "חסר",
  "פער",
  "פערים",
  "כדאי",
  "צריך",
];

const CATEGORY_KEYWORDS: Record<InsuranceCategory, string[]> = {
  health: [
    "בריאות",
    "רפואה",
    "שיניים",
    "אישפוז",
    "אשפוז",
    "תרופות",
    "קלינאית",
    "תקשורת",
    "פיזיותרפיה",
    "התפתחות",
    "ילד",
    "ילדים",
    "רופא",
  ],
  life: [
    "חיים",
    "ריסק",
    "מוות",
    "נכות",
    "סיעוד",
    "אובדן",
    "כושר",
    "משכנתא",
    "שארים",
  ],
  car: [
    "רכב",
    "רכבים",
    "נהג",
    "נהיגה",
    "תאונה",
    "מקיף",
    "צד",
    "חובה",
  ],
  home: [
    "דירה",
    "בית",
    "מבנה",
    "תכולה",
    "משכנתא",
    "צנרת",
    "רעידת",
    "אדמה",
  ],
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getExtractedDataRecord(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function extractSearchTerms(message: string) {
  const normalized = normalizeText(message);
  return uniqueStrings(
    normalized
      .split(" ")
      .filter((term) => term && (term.length > 1 || /^\d+$/.test(term)))
      .filter((term) => !GENERIC_TERMS.has(term))
  );
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function countTermMatches(text: string, terms: string[]) {
  if (!text || !terms.length) return 0;
  return terms.reduce((count, term) => (text.includes(term) ? count + 1 : count), 0);
}

function parseFlexibleDate(dateValue?: string | Date | null) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }
  const parsed = new Date(dateValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePolicyDate(dateStr?: string | null) {
  if (!dateStr || dateStr === "לא צוין בפוליסה" || dateStr === "לא צוין") return null;
  const parts = dateStr.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (parts) {
    const day = parseInt(parts[1], 10);
    const month = parseInt(parts[2], 10) - 1;
    let year = parseInt(parts[3], 10);
    if (year < 100) year += 2000;
    const parsed = new Date(year, month, day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return parseFlexibleDate(dateStr);
}

function formatOptionalValue(value?: string | null) {
  return value && value.trim() ? value.trim() : "לא ידוע";
}

function formatAmount(value: AssistantInvoice["amount"], extractedData?: unknown) {
  const extractedDataRecord = getExtractedDataRecord(extractedData);
  const rawValue = parseFloat(value ?? "");
  if (!Number.isNaN(rawValue) && rawValue > 0) {
    return `₪${rawValue.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
  }
  const extractedAmount = extractedDataRecord?.amount;
  if (typeof extractedAmount === "number") {
    return `₪${extractedAmount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
  }
  if (typeof extractedAmount === "string" && extractedAmount.trim()) {
    return extractedAmount;
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return "לא ידוע";
}

function formatDiscoveryAmount(value: AssistantInsuranceDiscovery["premiumAmount"]) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `₪${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return `₪${parsed.toLocaleString("he-IL", { maximumFractionDigits: 2 })}`;
    }
    return value;
  }
  return "לא ידוע";
}

function formatInsuranceDiscoveryType(artifactType?: string | null) {
  const labels: Record<string, string> = {
    policy_document: "מסמך פוליסה",
    renewal_notice: "חידוש",
    premium_notice: "עדכון פרמיה",
    coverage_update: "עדכון כיסוי",
    claim_update: "עדכון תביעה",
    other: "איתות ביטוחי",
  };
  if (!artifactType) return "איתות ביטוחי";
  return labels[artifactType] ?? artifactType;
}

function getDocumentCount(
  analyses: AssistantAnalysis[],
  invoices: AssistantInvoice[],
  documentClassifications: AssistantDocumentClassification[]
) {
  const policyFilesCount = analyses.reduce((sum, analysis) => sum + ((analysis.files ?? []) as unknown[]).length, 0);
  const invoicePdfCount = invoices.filter((invoice) => Boolean(getExtractedDataRecord(invoice.extractedData)?.pdfUrl)).length;
  return Math.max(policyFilesCount + invoicePdfCount, documentClassifications.length);
}

function buildQuestionSignals(message: string): QuestionSignals {
  const normalized = normalizeText(message);
  const terms = extractSearchTerms(message);
  const matchedCategories = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => includesAny(normalized, keywords))
    .map(([category]) => category as InsuranceCategory);
  const isInsuranceQuestion = includesAny(normalized, INSURANCE_KEYWORDS) || matchedCategories.length > 0;
  const isMoneyQuestion = includesAny(normalized, MONEY_KEYWORDS);
  const isFamilyQuestion = includesAny(normalized, FAMILY_KEYWORDS);
  const isDocumentQuestion = includesAny(normalized, DOCUMENT_KEYWORDS);
  const domainCount = [
    isInsuranceQuestion,
    isMoneyQuestion,
    isFamilyQuestion,
    isDocumentQuestion,
  ].filter(Boolean).length;
  return {
    terms,
    matchedCategories,
    isInsuranceQuestion,
    isMoneyQuestion,
    isFamilyQuestion,
    isDocumentQuestion,
    domainCount,
  };
}

function buildPolicySearchText(analysis: AssistantAnalysis) {
  const result = analysis.analysisResult;
  if (!result) return "";
  return normalizeText([
    result.generalInfo.policyName,
    result.generalInfo.insurerName,
    result.generalInfo.policyNumber,
    result.generalInfo.policyType,
    result.generalInfo.insuranceCategory,
    result.generalInfo.monthlyPremium,
    result.generalInfo.annualPremium,
    result.generalInfo.startDate,
    result.generalInfo.endDate,
    result.summary,
    ...(result.generalInfo.importantNotes ?? []),
    ...(result.generalInfo.fineprint ?? []),
    ...(result.coverages ?? []).flatMap((coverage) => [
      coverage.title,
      coverage.category,
      coverage.details,
      coverage.eligibility,
      coverage.copay,
      coverage.maxReimbursement,
      coverage.exclusions,
      coverage.waitingPeriod,
      coverage.limit,
      coverage.sourceFile,
    ]),
    ...((result.coverageOverlapGroups as any[] | undefined) ?? (result.duplicateCoverages as any[] | undefined) ?? []).flatMap((overlap) => [
      overlap.title,
      overlap.explanation,
      overlap.recommendation,
      ...((overlap.coverageRefs ?? overlap.coverageIds ?? []).map((ref: any) =>
        typeof ref === "string" ? ref : `${ref.policyId} ${ref.coverageId}`
      )),
    ]),
    ...(result.policyOverlapGroups ?? []).flatMap((overlap) => [
      overlap.explanation,
      overlap.recommendation,
      ...overlap.policyIds,
    ]),
  ].filter(Boolean).join(" "));
}

function scorePolicy(analysis: AssistantAnalysis, signals: QuestionSignals) {
  const result = analysis.analysisResult;
  if (!result) {
    return {
      score: -1,
      matchedCoverageCount: 0,
      matchedTermCount: 0,
      hasCategoryMatch: false,
    };
  }
  const policyCategory = result.generalInfo.insuranceCategory ?? analysis.insuranceCategory ?? null;
  const searchableText = buildPolicySearchText(analysis);
  const coverageMatches = (result.coverages ?? []).filter((coverage) => {
    const coverageText = normalizeText([
      coverage.title,
      coverage.category,
      coverage.details,
      coverage.eligibility,
      coverage.copay,
      coverage.maxReimbursement,
      coverage.exclusions,
      coverage.waitingPeriod,
      coverage.limit,
      coverage.sourceFile,
    ].filter(Boolean).join(" "));
    return countTermMatches(coverageText, signals.terms) > 0;
  }).length;
  const matchedTermCount = countTermMatches(searchableText, signals.terms);
  const hasCategoryMatch = Boolean(policyCategory && signals.matchedCategories.includes(policyCategory));

  let score = 0;
  if (signals.isInsuranceQuestion) score += 18;
  if (signals.isFamilyQuestion && signals.isInsuranceQuestion) score += 8;
  if (hasCategoryMatch) score += 40;
  score += matchedTermCount * 6;
  score += coverageMatches * 10;

  const endDate = parsePolicyDate(result.generalInfo.endDate);
  if (endDate && endDate.getTime() >= Date.now()) {
    score += 4;
  }

  const createdAt = parseFlexibleDate(analysis.createdAt);
  if (createdAt) {
    score += createdAt.getTime() / 10_000_000_000_000;
  }

  return {
    score,
    matchedCoverageCount: coverageMatches,
    matchedTermCount,
    hasCategoryMatch,
  };
}

function buildInvoiceSearchText(invoice: AssistantInvoice) {
  return normalizeText([
    invoice.provider,
    invoice.subject,
    invoice.rawText?.slice(0, 200),
    invoice.category,
    invoice.customCategory,
    invoice.status,
    invoice.flowDirection,
    getExtractedDataRecord(invoice.extractedData) ? JSON.stringify(getExtractedDataRecord(invoice.extractedData)) : "",
  ].filter(Boolean).join(" "));
}

function buildInsuranceDiscoverySearchText(discovery: AssistantInsuranceDiscovery) {
  return normalizeText([
    discovery.provider,
    discovery.insuranceCategory,
    discovery.artifactType,
    discovery.policyNumber,
    discovery.subject,
    discovery.summary,
    discovery.actionHint,
    discovery.attachmentFilename,
    discovery.extractedData ? JSON.stringify(discovery.extractedData) : "",
  ].filter(Boolean).join(" "));
}

function scoreInvoice(invoice: AssistantInvoice, signals: QuestionSignals) {
  const searchableText = buildInvoiceSearchText(invoice);
  let score = 0;
  if (signals.isMoneyQuestion) score += 16;
  if (signals.isDocumentQuestion && Boolean(getExtractedDataRecord(invoice.extractedData)?.pdfUrl)) score += 6;
  score += countTermMatches(searchableText, signals.terms) * 5;
  if ((invoice.status === "pending" || invoice.status === "overdue") && signals.isMoneyQuestion) {
    score += 4;
  }
  const createdAt = parseFlexibleDate(invoice.invoiceDate ?? invoice.createdAt);
  if (createdAt) {
    score += createdAt.getTime() / 10_000_000_000_000;
  }
  return score;
}

function scoreInsuranceDiscovery(discovery: AssistantInsuranceDiscovery, signals: QuestionSignals) {
  const searchableText = buildInsuranceDiscoverySearchText(discovery);
  const discoveryCategory =
    discovery.insuranceCategory === "health" ||
    discovery.insuranceCategory === "life" ||
    discovery.insuranceCategory === "car" ||
    discovery.insuranceCategory === "home"
      ? discovery.insuranceCategory
      : null;

  let score = 0;
  if (signals.isInsuranceQuestion) score += 18;
  if (signals.isDocumentQuestion && Boolean(discovery.attachmentFilename || discovery.attachmentUrl)) score += 8;
  if (signals.isMoneyQuestion && discovery.artifactType === "premium_notice") score += 8;
  if (signals.isFamilyQuestion && signals.isInsuranceQuestion) score += 6;
  if (discoveryCategory && signals.matchedCategories.includes(discoveryCategory)) score += 20;
  if (discovery.artifactType === "renewal_notice" && signals.isInsuranceQuestion) score += 8;
  score += countTermMatches(searchableText, signals.terms) * 6;

  const createdAt = parseFlexibleDate(discovery.documentDate);
  if (createdAt) {
    score += createdAt.getTime() / 10_000_000_000_000;
  }

  return score;
}

function scoreDocument(document: AssistantDocumentClassification, signals: QuestionSignals) {
  const searchableText = normalizeText([
    document.documentKey,
    document.sourceType,
    document.sourceId,
    document.manualType,
    document.familyMemberId ? String(document.familyMemberId) : "",
  ].filter(Boolean).join(" "));
  let score = 0;
  if (signals.isDocumentQuestion) score += 14;
  if (signals.isInsuranceQuestion && (document.manualType === "insurance" || document.manualType === "health")) {
    score += 8;
  }
  if (signals.isMoneyQuestion && document.manualType === "money") {
    score += 8;
  }
  if (signals.isFamilyQuestion && document.manualType === "family") {
    score += 8;
  }
  score += countTermMatches(searchableText, signals.terms) * 4;
  const updatedAt = parseFlexibleDate(document.updatedAt);
  if (updatedAt) {
    score += updatedAt.getTime() / 10_000_000_000_000;
  }
  return score;
}

function pickRelevantPolicies(analyses: AssistantAnalysis[], signals: QuestionSignals) {
  const completedAnalyses = analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  const scored = completedAnalyses
    .map((analysis) => {
      const { score, matchedCoverageCount, matchedTermCount, hasCategoryMatch } = scorePolicy(analysis, signals);
      return { analysis, score, matchedCoverageCount, matchedTermCount, hasCategoryMatch };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (!signals.isInsuranceQuestion) {
    return scored.filter((entry) => entry.score > 14).slice(0, 2);
  }

  const strongMatches = scored.filter(
    (entry) => entry.hasCategoryMatch || entry.matchedCoverageCount > 0 || entry.matchedTermCount >= 2
  );
  if (strongMatches.length > 0) {
    return strongMatches.slice(0, 3);
  }

  return scored.slice(0, Math.min(2, scored.length));
}

function pickRelevantInvoices(invoices: AssistantInvoice[], signals: QuestionSignals) {
  const scored = invoices
    .map((invoice) => ({
      invoice,
      score: scoreInvoice(invoice, signals),
    }))
    .sort((a, b) => b.score - a.score);

  if (!signals.isMoneyQuestion && !signals.isDocumentQuestion) {
    return scored.filter((entry) => entry.score > 10).slice(0, 3);
  }

  return scored.filter((entry) => entry.score > 8).slice(0, 5);
}

function pickRelevantInsuranceDiscoveries(
  discoveries: AssistantInsuranceDiscovery[],
  signals: QuestionSignals
) {
  const scored = discoveries
    .map((discovery) => ({
      discovery,
      score: scoreInsuranceDiscovery(discovery, signals),
    }))
    .sort((a, b) => b.score - a.score);

  if (!signals.isInsuranceQuestion && !signals.isDocumentQuestion && !signals.isMoneyQuestion) {
    return scored.filter((entry) => entry.score > 12).slice(0, 3);
  }

  return scored.filter((entry) => entry.score > 8).slice(0, 4);
}

function pickRelevantDocuments(
  documentClassifications: AssistantDocumentClassification[],
  signals: QuestionSignals
) {
  const scored = documentClassifications
    .map((document) => ({
      document,
      score: scoreDocument(document, signals),
    }))
    .sort((a, b) => b.score - a.score);

  if (!signals.isDocumentQuestion && signals.domainCount < 2) {
    return scored.filter((entry) => entry.score > 10).slice(0, 3);
  }

  return scored.filter((entry) => entry.score > 6).slice(0, 6);
}

function formatRelevantInsuranceDiscoveriesSection(
  relevantDiscoveries: RelevantInsuranceDiscovery[]
) {
  if (!relevantDiscoveries.length) {
    return "לא זוהו ממצאי Gmail ביטוחיים שרלוונטיים במיוחד לשאלה הנוכחית.";
  }

  return relevantDiscoveries.map(({ discovery }) => {
    const discoveryDate = parseFlexibleDate(discovery.documentDate);
    return [
      `- ${discovery.provider || "גוף ביטוחי"} | סוג: ${formatInsuranceDiscoveryType(discovery.artifactType)} | קטגוריה: ${formatOptionalValue(typeof discovery.insuranceCategory === "string" ? discovery.insuranceCategory : null)}`,
      discovery.policyNumber ? `  מספר פוליסה: ${discovery.policyNumber}` : null,
      discovery.premiumAmount != null ? `  פרמיה מזוהה: ${formatDiscoveryAmount(discovery.premiumAmount)}` : null,
      discoveryDate ? `  תאריך מסמך: ${discoveryDate.toISOString().slice(0, 10)}` : null,
      discovery.summary ? `  סיכום: ${discovery.summary}` : null,
      discovery.actionHint ? `  פעולה מוצעת: ${discovery.actionHint}` : null,
      discovery.attachmentFilename ? `  קובץ מצורף: ${discovery.attachmentFilename}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n");
}

function selectRelevantCoverages(policy: AssistantAnalysis, signals: QuestionSignals) {
  const coverages = policy.analysisResult?.coverages ?? [];
  const scored = coverages
    .map((coverage) => ({
      coverage,
      score: countTermMatches(
        normalizeText([
          coverage.title,
          coverage.category,
          coverage.details,
          coverage.eligibility,
          coverage.copay,
          coverage.maxReimbursement,
          coverage.exclusions,
          coverage.waitingPeriod,
          coverage.limit,
          coverage.sourceFile,
        ].filter(Boolean).join(" ")),
        signals.terms
      ),
    }))
    .sort((a, b) => b.score - a.score);

  if (signals.terms.length === 0) {
    return scored.slice(0, 4).map((entry) => entry.coverage);
  }

  const matched = scored.filter((entry) => entry.score > 0);
  if (matched.length > 0) {
    return matched.slice(0, 5).map((entry) => entry.coverage);
  }

  return scored.slice(0, 3).map((entry) => entry.coverage);
}

function summarizePolicies(analyses: AssistantAnalysis[]) {
  const completedAnalyses = analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  return completedAnalyses.slice(0, 6).map((analysis) => {
    const info = analysis.analysisResult?.generalInfo;
    return `- ${info?.policyName || "פוליסה"} | ${info?.insurerName || "לא ידוע"} | קטגוריה: ${info?.insuranceCategory || "לא ידוע"} | פרמיה חודשית: ${info?.monthlyPremium || "לא ידוע"} | תוקף עד: ${info?.endDate || "לא ידוע"}`;
  });
}

function formatRelevantPoliciesSection(relevantPolicies: RelevantPolicy[], signals: QuestionSignals) {
  if (!relevantPolicies.length) {
    return "אין פוליסות רלוונטיות במיוחד לשאלה הנוכחית.";
  }

  return relevantPolicies.map(({ analysis }) => {
    const result = analysis.analysisResult!;
    const relevantCoverages = selectRelevantCoverages(analysis, signals);
    const insightLines = (result.personalizedInsights ?? [])
      .slice(0, 3)
      .map((insight) => `  - ${insight.title}: ${insight.description}`);
    const coverageOverlapLines = ((result.coverageOverlapGroups as any[] | undefined) ?? (result.duplicateCoverages as any[] | undefined) ?? [])
      .slice(0, 2)
      .map((overlap) => `  - ${overlap.title}: ${overlap.explanation}. המלצה: ${overlap.recommendation}`);
    const policyOverlapLines = (result.policyOverlapGroups ?? [])
      .slice(0, 1)
      .map((overlap) => `  - חפיפת פוליסה: ${overlap.explanation}. המלצה: ${overlap.recommendation}`);
    const coverageLines = relevantCoverages.map((coverage) => {
      return `  - ${coverage.title} | קטגוריה: ${coverage.category} | מגבלה: ${formatOptionalValue(coverage.limit)} | השתתפות עצמית: ${formatOptionalValue(coverage.copay)} | תקרת החזר: ${formatOptionalValue(coverage.maxReimbursement)} | תקופת אכשרה: ${formatOptionalValue(coverage.waitingPeriod)} | החרגות: ${formatOptionalValue(coverage.exclusions)} | פירוט: ${formatOptionalValue(coverage.details)}`;
    });

    const lines = [
      `- פוליסה: ${result.generalInfo.policyName}`,
      `  חברה: ${formatOptionalValue(result.generalInfo.insurerName)}`,
      `  קטגוריה: ${formatOptionalValue(result.generalInfo.insuranceCategory)}`,
      `  מספר פוליסה: ${formatOptionalValue(result.generalInfo.policyNumber)}`,
      `  פרמיה חודשית: ${formatOptionalValue(result.generalInfo.monthlyPremium)}`,
      `  תוקף: ${formatOptionalValue(result.generalInfo.startDate)} עד ${formatOptionalValue(result.generalInfo.endDate)}`,
      `  סיכום: ${formatOptionalValue(result.summary)}`,
    ];

    if (result.generalInfo.importantNotes?.length) {
      lines.push(`  הערות חשובות: ${result.generalInfo.importantNotes.join(" | ")}`);
    }
    if (result.generalInfo.fineprint?.length) {
      lines.push(`  אותיות קטנות: ${result.generalInfo.fineprint.join(" | ")}`);
    }
    if (coverageLines.length) {
      lines.push("  כיסויים רלוונטיים:");
      lines.push(...coverageLines);
    }
    if (insightLines.length) {
      lines.push("  תובנות מותאמות לפרופיל:");
      lines.push(...insightLines);
    }
    if (coverageOverlapLines.length || policyOverlapLines.length) {
      lines.push("  חפיפות שזוהו:");
      lines.push(...coverageOverlapLines, ...policyOverlapLines);
    }

    return lines.join("\n");
  }).join("\n");
}

function formatRelevantInvoicesSection(relevantInvoices: RelevantInvoice[]) {
  if (!relevantInvoices.length) {
    return "אין תנועות או חשבוניות רלוונטיות במיוחד לשאלה הנוכחית.";
  }

  return relevantInvoices.map(({ invoice }) => {
    const invoiceDate = parseFlexibleDate(invoice.invoiceDate);
    const dueDate = parseFlexibleDate(invoice.dueDate);
    const category = invoice.customCategory ?? invoice.category ?? "אחר";
    const flowDirection =
      invoice.flowDirection === "income"
        ? "הכנסה"
        : invoice.flowDirection === "expense"
          ? "הוצאה"
          : "לא מסווג";

    return [
      `- ${invoice.provider || "ללא ספק"} | ${flowDirection} | סכום: ${formatAmount(invoice.amount, invoice.extractedData)} | קטגוריה: ${category} | סטטוס: ${invoice.status || "לא ידוע"}`,
      invoice.subject ? `  נושא: ${invoice.subject}` : null,
      invoiceDate ? `  תאריך חשבונית: ${invoiceDate.toISOString().slice(0, 10)}` : null,
      dueDate ? `  תאריך יעד: ${dueDate.toISOString().slice(0, 10)}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n");
}

function buildFamilyMemberNameMap(familyMembers: AssistantFamilyMember[]) {
  return new Map(
    familyMembers
      .filter((member) => member.id && member.fullName)
      .map((member) => [member.id as number, member.fullName as string])
  );
}

function formatDocumentType(
  manualType?: string | null,
  familyMemberId?: number | null,
  familyMembersMap?: Map<number, string>
) {
  if (manualType === "family") {
    return familyMemberId ? familyMembersMap?.get(familyMemberId) ?? "בן משפחה" : "בן משפחה";
  }

  const labels: Record<string, string> = {
    insurance: "ביטוח",
    money: "כסף",
    health: "בריאות",
    education: "חינוך",
    family: "משפחה",
    other: "אחר",
  };
  if (!manualType) return "לא מסווג";
  return labels[manualType] ?? manualType;
}

function formatRelevantDocumentsSection(relevantDocuments: RelevantDocument[], familyMembers: AssistantFamilyMember[]) {
  if (!relevantDocuments.length) {
    return "אין מסמכים מסווגים שרלוונטיים במיוחד לשאלה הנוכחית.";
  }

  const familyMembersMap = buildFamilyMemberNameMap(familyMembers);
  return relevantDocuments.map(({ document }) => {
    return `- ${document.documentKey} | סוג מסמך: ${formatDocumentType(document.manualType, document.familyMemberId, familyMembersMap)} | מקור: ${document.sourceType || "לא ידוע"}${document.sourceId ? ` | מקור מזהה: ${document.sourceId}` : ""}`;
  }).join("\n");
}

function buildDocumentSummary(
  documentClassifications: AssistantDocumentClassification[],
  familyMembers: AssistantFamilyMember[]
) {
  if (!documentClassifications.length) {
    return "- אין עדיין מסמכים מסווגים";
  }

  const familyMembersMap = buildFamilyMemberNameMap(familyMembers);
  const counts = documentClassifications.reduce<Record<string, number>>((acc, document) => {
    const key =
      document.manualType === "family"
        ? `family:${formatDocumentType(document.manualType, document.familyMemberId, familyMembersMap)}`
        : document.manualType || "other";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      if (type.startsWith("family:")) {
        return `- ${type.replace("family:", "")}: ${count}`;
      }
      return `- ${formatDocumentType(type)}: ${count}`;
    })
    .join("\n");
}

function buildPolicyPortfolioSnapshot(analyses: AssistantAnalysis[]) {
  const policySummaries = summarizePolicies(analyses);
  return policySummaries.length ? policySummaries.join("\n") : "- אין עדיין פוליסות מנותחות";
}

function buildHouseholdSnapshot(params: {
  profile: any;
  analyses: AssistantAnalysis[];
  invoices: AssistantInvoice[];
  insuranceDiscoveries: AssistantInsuranceDiscovery[];
  familyMembers: AssistantFamilyMember[];
  gmailConnections: Array<{ id: number }>;
  documentClassifications: AssistantDocumentClassification[];
}) {
  const completedAnalyses = params.analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  const monthlySummary = summarizeMonthlyInvoices(params.invoices);
  const currentMonth = monthlySummary[0] ?? null;
  const documentCount = getDocumentCount(params.analyses, params.invoices, params.documentClassifications);

  return [
    `- Gmail מחובר: ${params.gmailConnections.length > 0 ? "כן" : "לא"}`,
    `- מספר פוליסות שנותחו: ${completedAnalyses.length}`,
    `- מספר תנועות כספיות: ${params.invoices.length}`,
    `- ממצאים ביטוחיים מהמייל: ${params.insuranceDiscoveries.length}`,
    `- מספר בני בית מנוהלים: ${params.familyMembers.length + 1}`,
    `- מסמכים זמינים או מסווגים: ${documentCount}`,
    currentMonth
      ? `- נטו ${formatMonthLabel(currentMonth.month)}: ${currentMonth.netTotal >= 0 ? "+" : "-"}${formatIls(Math.abs(currentMonth.netTotal))}`
      : "- אין עדיין סיכום כספי חודשי",
  ].join("\n");
}

function getSuggestedHistoryLimit(
  meta: Omit<AssistantPromptMeta, "suggestedHistoryLimit">,
  hasComplexQuerySignal: boolean,
  isDocumentQuestion: boolean
) {
  if (
    meta.domainCount >= 2 &&
    meta.relevantPolicyCount > 0 &&
    (hasComplexQuerySignal || meta.termCount >= 7)
  ) {
    return 20;
  }
  let limit = 12;
  if (
    meta.domainCount >= 2 &&
    (
      hasComplexQuerySignal ||
      meta.termCount >= 7 ||
      meta.relevantInvoiceCount > 0 ||
      (isDocumentQuestion && meta.relevantDocumentCount > 0)
    )
  ) {
    limit += 4;
  }
  if (meta.relevantPolicyCount > 1 || meta.relevantInvoiceCount > 2) limit += 4;
  return Math.min(limit, 20);
}

export function shouldUseComplexLumiModel(params: {
  message: string;
  meta: Omit<AssistantPromptMeta, "suggestedHistoryLimit">;
}) {
  const normalizedMessage = normalizeText(params.message);
  const normalizedLength = normalizedMessage.length;
  const hasComplexQuerySignal = includesAny(normalizedMessage, COMPLEX_QUERY_KEYWORDS);
  if (
    params.meta.domainCount >= 2 &&
    params.meta.relevantPolicyCount > 0 &&
    (hasComplexQuerySignal || params.meta.termCount >= 7 || normalizedLength > 90)
  ) {
    return true;
  }
  if (params.meta.relevantPolicyCount > 1 && hasComplexQuerySignal) return true;
  if (params.meta.matchedCoverageCount > 2 && hasComplexQuerySignal) return true;
  if (params.meta.termCount >= 8) return true;
  if (normalizedLength > 180 && params.meta.domainCount > 0) return true;
  return false;
}

export function getAssistantSessionId(userId: number) {
  return `assistant-home-${userId}`;
}

export function buildFamilyMembersContext(members: AssistantFamilyMember[]) {
  if (!members.length) {
    return "לא הוזנו עדיין בני בית נפרדים במודל המשפחה.";
  }
  return members
    .map((member) => {
      const birthDate = parseFlexibleDate(member.birthDate);
      const details = [
        `שם: ${member.fullName}`,
        `קשר: ${member.relation}`,
        member.ageLabel ? `גיל או שלב: ${member.ageLabel}` : null,
        birthDate ? `תאריך לידה: ${birthDate.toISOString().slice(0, 10)}` : null,
        member.allergies ? `אלרגיות: ${member.allergies}` : null,
        member.medicalNotes ? `בריאות: ${member.medicalNotes}` : null,
        member.activities ? `שגרה או חוגים: ${member.activities}` : null,
        member.insuranceNotes ? `דגשי ביטוח: ${member.insuranceNotes}` : null,
        member.notes ? `הערות: ${member.notes}` : null,
      ].filter(Boolean);
      return `- ${details.join(" | ")}`;
    })
    .join("\n");
}

export function buildAssistantHomeContext(params: {
  userName?: string | null;
  profile: any;
  analyses: AssistantAnalysis[];
  invoices: AssistantInvoice[];
  insuranceDiscoveries: AssistantInsuranceDiscovery[];
  familyMembers: AssistantFamilyMember[];
  gmailConnections: Array<{ id: number }>;
  documentClassifications: AssistantDocumentClassification[];
}): AssistantHomeContext {
  const completedAnalyses = params.analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  const monthlySummary = summarizeMonthlyInvoices(params.invoices);
  const currentMonth = monthlySummary[0] ?? null;
  const pendingInvoices = params.invoices.filter((invoice) => invoice.status === "pending" || invoice.status === "overdue");
  const documentCount = getDocumentCount(params.analyses, params.invoices, params.documentClassifications);
  const renewalDiscoveries = params.insuranceDiscoveries.filter((discovery) => discovery.artifactType === "renewal_notice");
  const policyDocumentsFromMail = params.insuranceDiscoveries.filter((discovery) => discovery.artifactType === "policy_document");
  const upcomingRenewals = completedAnalyses
    .map((analysis) => {
      const endDate = parsePolicyDate(analysis.analysisResult?.generalInfo?.endDate);
      if (!endDate) return null;
      const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return {
        title: analysis.analysisResult?.generalInfo?.policyName || "פוליסה",
        daysLeft,
      };
    })
    .filter((item): item is { title: string; daysLeft: number } => Boolean(item))
    .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 45)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const chips: AssistantChip[] = [];
  const prompts: string[] = [];
  const familyMembersCount = params.familyMembers.length;
  const childrenCount =
    params.familyMembers.filter((member) => member.relation === "child").length ||
    (params.profile?.numberOfChildren ?? 0);

  if (!params.gmailConnections.length) {
    chips.push({ label: "Gmail עדיין לא מחובר", tone: "warning" });
    prompts.push("איך מחברים את Gmail כדי שלומי יזהה הוצאות והכנסות?");
  }

  if (params.insuranceDiscoveries.length > 0) {
    chips.push({
      label: `${params.insuranceDiscoveries.length} גילויי ביטוח מהמייל`,
      tone: "info",
    });
    prompts.push("אילו מסמכי ביטוח או חידושים זוהו לי מהמייל ועדיין צריך לבדוק?");
  }

  if (pendingInvoices.length > 0) {
    chips.push({
      label: `${pendingInvoices.length} תשלומים פתוחים`,
      tone: pendingInvoices.some((invoice) => invoice.status === "overdue") ? "warning" : "info",
    });
    prompts.push("איזה תשלומים פתוחים מחכים לי עכשיו?");
  }

  if (upcomingRenewals.length > 0) {
    chips.push({
      label: `חידוש פוליסה בעוד ${upcomingRenewals[0].daysLeft} ימים`,
      tone: "info",
    });
    prompts.push("יש לי חידושי ביטוח קרובים או פערים בכיסוי?");
  }

  if (renewalDiscoveries.length > 0) {
    prompts.push("יש חידוש ביטוחי מהמייל שכדאי לטפל בו עכשיו?");
  }

  if (policyDocumentsFromMail.length > 0) {
    prompts.push("אילו מסמכי פוליסה כבר זוהו לי מהמייל ואיך הם משתלבים בתיק?");
  }

  if (familyMembersCount > 0) {
    chips.push({
      label: `${familyMembersCount + 1} בני בית מנוהלים`,
      tone: "success",
    });
  }

  if (childrenCount > 0) {
    chips.push({
      label: `${childrenCount} ילדים במשפחה`,
      tone: "success",
    });
    prompts.push("יש משהו חשוב שמתקרב לילדים או למשפחה שלי?");
  }

  if (documentCount > 0) {
    chips.push({
      label: `${documentCount} מסמכים זמינים`,
      tone: "neutral",
    });
    prompts.push("עשה לי סדר במסמכים החשובים שלי.");
  }

  if (currentMonth) {
    const monthLabel = formatMonthLabel(currentMonth.month);
    chips.push({
      label: `נטו ${monthLabel}: ${currentMonth.netTotal >= 0 ? "+" : "-"}${formatIls(Math.abs(currentMonth.netTotal))}`,
      tone: currentMonth.netTotal >= 0 ? "success" : "warning",
    });
    prompts.push("איך נראות ההוצאות וההכנסות שלי החודש?");
  }

  if (!params.profile?.incomeRange || !params.profile?.employmentStatus) {
    prompts.push("איזה מידע חסר ללומי כדי לעזור לי טוב יותר?");
  }

  if (!completedAnalyses.length) {
    prompts.push("איך מתחילים להעלות ולנתח ביטוחים בלומי?");
  }

  const greetingName = params.userName?.split(" ")[0] || "";

  return {
    greeting: `${greetingName ? `שלום ${greetingName}, ` : ""}אני כאן כדי לעזור לך להבין מה קורה בבית, בכסף, במסמכים ובביטוחים. אפשר לשאול אותי כל דבר או לבחור אחת מהשאלות המומלצות.`,
    chips: chips.slice(0, 5),
    suggestedPrompts: Array.from(new Set(prompts)).slice(0, 5),
  };
}

export function buildAssistantSystemPrompt(params: {
  message: string;
  profile: any;
  analyses: AssistantAnalysis[];
  invoices: AssistantInvoice[];
  insuranceDiscoveries: AssistantInsuranceDiscovery[];
  familyMembers: AssistantFamilyMember[];
  gmailConnections: Array<{ id: number }>;
  documentClassifications: AssistantDocumentClassification[];
}): AssistantPromptResult {
  const signals = buildQuestionSignals(params.message);
  const normalizedMessage = normalizeText(params.message);
  const hasComplexQuerySignal = includesAny(normalizedMessage, COMPLEX_QUERY_KEYWORDS);
  const completedAnalyses = params.analyses.filter((analysis) => analysis.status === "completed" && analysis.analysisResult);
  const monthlySummary = summarizeMonthlyInvoices(params.invoices);
  const currentMonth = monthlySummary[0] ?? null;
  const relevantPolicies = pickRelevantPolicies(completedAnalyses, signals);
  const relevantInvoices = pickRelevantInvoices(params.invoices, signals);
  const relevantInsuranceDiscoveries = pickRelevantInsuranceDiscoveries(params.insuranceDiscoveries, signals);
  const relevantDocuments = pickRelevantDocuments(params.documentClassifications, signals);

  const metaBase = {
    domainCount: signals.domainCount,
    termCount: signals.terms.length,
    relevantPolicyCount: relevantPolicies.length,
    relevantInvoiceCount: relevantInvoices.length,
    relevantDocumentCount: relevantDocuments.length,
    matchedCoverageCount: relevantPolicies.reduce((sum, policy) => sum + policy.matchedCoverageCount, 0),
    matchedCategories: signals.matchedCategories,
  };

  const suggestedHistoryLimit = getSuggestedHistoryLimit(
    metaBase,
    hasComplexQuerySignal,
    signals.isDocumentQuestion
  );
  const meta: AssistantPromptMeta = {
    ...metaBase,
    suggestedHistoryLimit,
  };

  const policyPortfolioSnapshot = buildPolicyPortfolioSnapshot(completedAnalyses);
  const documentSummary = buildDocumentSummary(params.documentClassifications, params.familyMembers);
  const profileText = params.profile ? buildProfileContext(params.profile) || "לא הוזן פרופיל מפורט" : "לא הוזן פרופיל מפורט";
  const familyText = buildFamilyMembersContext(params.familyMembers);

  const systemPrompt = `אתה לומי, עוזר אישי חכם וחוצה-מערכות לניהול החיים השוטפים של משק בית בישראל.

ענה בעברית, בגובה העיניים, בצורה פרקטית וברורה.
השתמש אך ורק במידע שסופק לך. אם מידע חסר, אמור זאת במפורש והצע מה כדאי להשלים.
אם אפשר, סיים כל תשובה בהמלצה קצרה לפעולה הבאה.
אל תמציא נתונים שלא קיימים.
אל תתן ייעוץ משפטי, ביטוחי או פיננסי מחייב. תסביר, תסכם ותמליץ בזהירות.
אם השאלה ביטוחית, תעדף את פרטי הפוליסות הרלוונטיות, הכיסויים, המגבלות, ההחרגות, תקופות האכשרה וגם ממצאי Gmail ביטוחיים רלוונטיים.
אם השאלה משלבת בין תחומים, חבר במפורש בין ביטוחים, כסף, משפחה ומסמכים במקום לענות על כל תחום בנפרד.
אם נשאלת שאלה על ילד, בן משפחה או מצב אישי, בדוק גם את פרופיל הלקוח וגם את מודל המשפחה לפני המענה.

שאלת המשתמש הנוכחית:
${params.message}

אותות שזוהו לשאלה:
- ביטוח: ${signals.isInsuranceQuestion ? "כן" : "לא"}
- כסף: ${signals.isMoneyQuestion ? "כן" : "לא"}
- משפחה: ${signals.isFamilyQuestion ? "כן" : "לא"}
- מסמכים: ${signals.isDocumentQuestion ? "כן" : "לא"}
- קטגוריות ביטוח שזוהו: ${signals.matchedCategories.length ? signals.matchedCategories.join(", ") : "לא זוהתה קטגוריה מפורשת"}

תמונת מצב כללית:
${buildHouseholdSnapshot(params)}

פרופיל הלקוח:
${profileText}

בני הבית:
${familyText}

פוליסות בתיק:
${policyPortfolioSnapshot}

פוליסות רלוונטיות לשאלה:
${formatRelevantPoliciesSection(relevantPolicies, signals)}

כסף:
- מספר תנועות: ${params.invoices.length}
${currentMonth ? `- הוצאות ${formatMonthLabel(currentMonth.month)}: ${formatIls(currentMonth.expenseTotal)}
- הכנסות ${formatMonthLabel(currentMonth.month)}: ${formatIls(currentMonth.incomeTotal)}
- נטו ${formatMonthLabel(currentMonth.month)}: ${currentMonth.netTotal >= 0 ? "+" : "-"}${formatIls(Math.abs(currentMonth.netTotal))}` : "- אין עדיין סיכום חודשי"}

תנועות או מסמכים כספיים רלוונטיים:
${formatRelevantInvoicesSection(relevantInvoices)}

ממצאים ביטוחיים מהמייל שרלוונטיים לשאלה:
${formatRelevantInsuranceDiscoveriesSection(relevantInsuranceDiscoveries)}

מסמכים:
${documentSummary}

מסמכים מסווגים רלוונטיים:
${formatRelevantDocumentsSection(relevantDocuments, params.familyMembers)}

חיבורים:
- Gmail מחובר: ${params.gmailConnections.length > 0 ? "כן" : "לא"}`;

  return {
    systemPrompt,
    meta,
  };
}

export type InsuranceCategory = "health" | "life" | "car" | "home";
export type PremiumPaymentPeriod = "monthly" | "annual" | "unknown";

export const INSURANCE_ANALYSIS_VERSION = 2;
export const INSURANCE_HUB_SCHEMA_VERSION = 2;
export const POLICY_NOT_SPECIFIED = "לא מצוין בפוליסה";

export type PolicyClauseKind =
  | "benefit_detail"
  | "eligibility"
  | "limit"
  | "copay"
  | "max_reimbursement"
  | "exclusion"
  | "waiting_period"
  | "other";

const CLAUSE_KIND_SET = new Set<PolicyClauseKind>([
  "benefit_detail",
  "eligibility",
  "limit",
  "copay",
  "max_reimbursement",
  "exclusion",
  "waiting_period",
  "other",
]);

const CLAUSE_TITLES: Record<PolicyClauseKind, string> = {
  benefit_detail: "פירוט הכיסוי",
  eligibility: "תנאי זכאות",
  limit: "מגבלה",
  copay: "השתתפות עצמית",
  max_reimbursement: "תקרת החזר",
  exclusion: "החרגה",
  waiting_period: "תקופת אכשרה",
  other: "פרט נוסף",
};

/** @deprecated Legacy flat coverage shape kept for compatibility. */
export interface Coverage {
  id: string;
  title: string;
  category: string;
  limit: string;
  details: string;
  eligibility: string;
  copay: string;
  maxReimbursement: string;
  exclusions: string;
  waitingPeriod: string;
  sourceFile?: string;
  policyId?: string;
  summary?: string;
  clauseIds?: string[];
}

/** General financial and policy information. */
export interface GeneralInfo {
  policyName: string;
  policyNames?: string[];
  insurerName: string;
  policyNumber: string;
  policyType: string;
  insuranceCategory?: InsuranceCategory;
  premiumPaymentPeriod?: PremiumPaymentPeriod;
  monthlyPremium: string;
  annualPremium: string;
  startDate: string;
  endDate: string;
  importantNotes: string[];
  fineprint: string[];
}

/** @deprecated Legacy overlap shape kept for compatibility. */
export interface DuplicateCoverageGroup {
  id: string;
  title: string;
  coverageIds: string[];
  sourceFiles: string[];
  explanation: string;
  recommendation: string;
}

export interface PolicyClause {
  id: string;
  coverageId: string;
  kind: PolicyClauseKind;
  title: string;
  text: string;
}

export interface PolicyCoverage {
  id: string;
  policyId: string;
  title: string;
  category: string;
  summary: string;
  sourceFile?: string;
  clauses: PolicyClause[];
}

export interface InsurancePolicy {
  id: string;
  generalInfo: GeneralInfo;
  summary: string;
  sourceFiles: string[];
  coverages: PolicyCoverage[];
}

export interface CoverageOverlapReference {
  policyId: string;
  coverageId: string;
}

export interface CoverageOverlapGroup {
  id: string;
  title: string;
  coverageRefs: CoverageOverlapReference[];
  matchedClauseIdsByCoverage: Record<string, string[]>;
  explanation: string;
  recommendation: string;
}

export interface PolicyOverlapGroup {
  id: string;
  policyIds: string[];
  coverageOverlapGroupIds: string[];
  overlapRatio: number;
  explanation: string;
  recommendation: string;
}

export interface PersonalizedInsight {
  id: string;
  type: "warning" | "recommendation" | "positive";
  title: string;
  description: string;
  relevantCoverage?: string;
  priority: "high" | "medium" | "low";
}

export type InsuranceSummaryTone = "warning" | "info" | "success";

export interface InsuranceCategorySummaryHighlight {
  id: string;
  title: string;
  description: string;
  tone: InsuranceSummaryTone;
}

export interface InsuranceCategoryLlmSummary {
  category: InsuranceCategory;
  overview: string;
  highlights: InsuranceCategorySummaryHighlight[];
  recommendedActions: string[];
  recommendedQuestions: string[];
}

export interface UserProfile {
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  numberOfChildren: number;
  childrenAges: string | null;
  employmentStatus: string | null;
  incomeRange: string | null;
  ownsApartment: boolean;
  hasActiveMortgage: boolean;
  numberOfVehicles: number;
  hasExtremeSports: boolean;
  hasSpecialHealthConditions: boolean;
  healthConditionsDetails: string | null;
  hasPets: boolean;
  businessName: string | null;
  businessTaxId: string | null;
  businessEmailDomains: string | null;
}

/** Full analysis result returned by the AI. */
export interface PolicyAnalysis {
  analysisVersion?: number;
  summary: string;
  policies?: InsurancePolicy[];
  coverageOverlapGroups?: CoverageOverlapGroup[];
  policyOverlapGroups?: PolicyOverlapGroup[];
  personalizedInsights?: PersonalizedInsight[];
  requiresReanalysis?: boolean;
  /** @deprecated Legacy aggregate fields kept for compatibility. */
  generalInfo: GeneralInfo;
  /** @deprecated Legacy flat coverages kept for compatibility. */
  coverages: Coverage[];
  /** @deprecated Legacy overlap groups kept for compatibility. */
  duplicateCoverages?: DuplicateCoverageGroup[];
}

export type NormalizedPolicyAnalysis = PolicyAnalysis & {
  analysisVersion: typeof INSURANCE_ANALYSIS_VERSION;
  policies: InsurancePolicy[];
  coverageOverlapGroups: CoverageOverlapGroup[];
  policyOverlapGroups: PolicyOverlapGroup[];
  personalizedInsights: PersonalizedInsight[];
  generalInfo: GeneralInfo;
  coverages: Coverage[];
  duplicateCoverages: DuplicateCoverageGroup[];
};

type LegacyCoverageLike = Partial<Coverage> & { id?: string; title?: string; category?: string };
type LegacyDuplicateLike = Partial<DuplicateCoverageGroup> & { coverageIds?: string[] };
type LegacyAnalysisLike = Partial<PolicyAnalysis> & {
  generalInfo?: Partial<GeneralInfo>;
  coverages?: LegacyCoverageLike[];
  duplicateCoverages?: LegacyDuplicateLike[];
  personalizedInsights?: Partial<PersonalizedInsight>[];
};

type RawPolicyClauseLike = {
  id?: string;
  kind?: string;
  title?: string;
  text?: string;
};

type RawPolicyCoverageLike = {
  id?: string;
  policyId?: string;
  title?: string;
  category?: string;
  summary?: string;
  sourceFile?: string;
  clauses?: RawPolicyClauseLike[];
};

type RawInsurancePolicyLike = {
  id?: string;
  generalInfo?: Partial<GeneralInfo>;
  summary?: string;
  sourceFiles?: string[];
  coverages?: RawPolicyCoverageLike[];
};

type RawCoverageOverlapLike = {
  id?: string;
  title?: string;
  coverageRefs?: Array<Partial<CoverageOverlapReference>>;
  coverageIds?: string[];
  matchedClauseIdsByCoverage?: Record<string, string[]>;
  explanation?: string;
  recommendation?: string;
};

type RawPolicyAnalysisLike = {
  analysisVersion?: number;
  summary?: string;
  policies?: RawInsurancePolicyLike[];
  coverageOverlapGroups?: RawCoverageOverlapLike[];
  policyOverlapGroups?: Partial<PolicyOverlapGroup>[];
  personalizedInsights?: Partial<PersonalizedInsight>[];
  requiresReanalysis?: boolean;
  generalInfo?: Partial<GeneralInfo>;
  coverages?: LegacyCoverageLike[];
  duplicateCoverages?: LegacyDuplicateLike[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMeaningfulText(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim() !== POLICY_NOT_SPECIFIED &&
    value.trim() !== "לא צוין בפוליסה" &&
    value.trim() !== "לא צוין"
  );
}

function normalizeTextValue(value: unknown, fallback: string = POLICY_NOT_SPECIFIED) {
  if (!isMeaningfulText(value)) {
    return fallback;
  }
  return String(value).trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!isMeaningfulText(value)) {
      continue;
    }
    const trimmed = String(value).trim();
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function buildOrdinalId(prefix: string, parts: string[], ordinal: number) {
  return `${prefix}-${parts.map(slugify).join("-")}-${ordinal}`;
}

function getPolicyIdentity(generalInfo?: Partial<GeneralInfo>) {
  if (isMeaningfulText(generalInfo?.policyNumber)) {
    return `policy-number-${slugify(generalInfo!.policyNumber!.trim())}`;
  }
  if (isMeaningfulText(generalInfo?.policyName) && isMeaningfulText(generalInfo?.insurerName)) {
    return `policy-name-${slugify(generalInfo!.policyName!.trim())}-${slugify(generalInfo!.insurerName!.trim())}`;
  }
  if (isMeaningfulText(generalInfo?.policyName)) {
    return `policy-name-${slugify(generalInfo!.policyName!.trim())}`;
  }
  return "";
}

function normalizeCategory(value: unknown): InsuranceCategory | undefined {
  if (value === "health" || value === "life" || value === "car" || value === "home") {
    return value;
  }
  return undefined;
}

function parseMoneyValue(raw?: unknown) {
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
    normalized =
      parts.length > 2 || parts[parts.length - 1].length === 3
        ? parts.join("")
        : parts.join(".");
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoneyValue(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return POLICY_NOT_SPECIFIED;
  }
  return `₪${Math.round(value).toLocaleString("he-IL")}`;
}

function normalizeDateValue(value: unknown) {
  return normalizeTextValue(value);
}

function normalizePremiumPaymentPeriod(value: unknown): PremiumPaymentPeriod {
  if (value === "monthly" || value === "annual" || value === "unknown") {
    return value;
  }
  return "unknown";
}

export function normalizePremiumGeneralInfo<T extends GeneralInfo>(generalInfo: T): T {
  const normalized = {
    ...generalInfo,
    premiumPaymentPeriod: normalizePremiumPaymentPeriod(generalInfo.premiumPaymentPeriod),
    monthlyPremium: normalizeTextValue(generalInfo.monthlyPremium),
    annualPremium: normalizeTextValue(generalInfo.annualPremium),
  };

  if (normalized.premiumPaymentPeriod === "annual") {
    const annualSource = isMeaningfulText(normalized.annualPremium)
      ? normalized.annualPremium
      : normalized.monthlyPremium;
    normalized.annualPremium = annualSource ?? POLICY_NOT_SPECIFIED;
    if (!isMeaningfulText(normalized.monthlyPremium) || normalized.monthlyPremium === annualSource) {
      normalized.monthlyPremium = POLICY_NOT_SPECIFIED;
    }
  }

  if (normalized.premiumPaymentPeriod === "monthly") {
    const monthlySource = isMeaningfulText(normalized.monthlyPremium)
      ? normalized.monthlyPremium
      : normalized.annualPremium;
    normalized.monthlyPremium = monthlySource ?? POLICY_NOT_SPECIFIED;
    if (!isMeaningfulText(normalized.annualPremium) || normalized.annualPremium === monthlySource) {
      normalized.annualPremium = POLICY_NOT_SPECIFIED;
    }
  }

  return normalized as T;
}

function normalizeGeneralInfo(generalInfo?: Partial<GeneralInfo>): GeneralInfo {
  return normalizePremiumGeneralInfo({
    policyName: normalizeTextValue(generalInfo?.policyName),
    policyNames: uniqueStrings(generalInfo?.policyNames ?? []),
    insurerName: normalizeTextValue(generalInfo?.insurerName),
    policyNumber: normalizeTextValue(generalInfo?.policyNumber),
    policyType: normalizeTextValue(generalInfo?.policyType),
    insuranceCategory: normalizeCategory(generalInfo?.insuranceCategory),
    premiumPaymentPeriod: normalizePremiumPaymentPeriod(generalInfo?.premiumPaymentPeriod),
    monthlyPremium: normalizeTextValue(generalInfo?.monthlyPremium),
    annualPremium: normalizeTextValue(generalInfo?.annualPremium),
    startDate: normalizeDateValue(generalInfo?.startDate),
    endDate: normalizeDateValue(generalInfo?.endDate),
    importantNotes: uniqueStrings(generalInfo?.importantNotes ?? []),
    fineprint: uniqueStrings(generalInfo?.fineprint ?? []),
  });
}

function normalizeClauseKind(value: unknown): PolicyClauseKind {
  return typeof value === "string" && CLAUSE_KIND_SET.has(value as PolicyClauseKind)
    ? (value as PolicyClauseKind)
    : "other";
}

function buildClauseTitle(kind: PolicyClauseKind, value: unknown) {
  return isMeaningfulText(value) ? String(value).trim() : CLAUSE_TITLES[kind];
}

function buildLegacyClauseSeed(coverage: LegacyCoverageLike) {
  return [
    {
      kind: "benefit_detail" as const,
      title: "פירוט הכיסוי",
      text: coverage.details,
    },
    {
      kind: "eligibility" as const,
      title: "תנאי זכאות",
      text: coverage.eligibility,
    },
    {
      kind: "limit" as const,
      title: "מגבלה",
      text: coverage.limit,
    },
    {
      kind: "copay" as const,
      title: "השתתפות עצמית",
      text: coverage.copay,
    },
    {
      kind: "max_reimbursement" as const,
      title: "תקרת החזר",
      text: coverage.maxReimbursement,
    },
    {
      kind: "exclusion" as const,
      title: "החרגות",
      text: coverage.exclusions,
    },
    {
      kind: "waiting_period" as const,
      title: "תקופת אכשרה",
      text: coverage.waitingPeriod,
    },
  ];
}

function getCoverageClauseValue(coverage: PolicyCoverage, kind: PolicyClauseKind) {
  const clause = coverage.clauses.find((item) => item.kind === kind && isMeaningfulText(item.text));
  return clause?.text ?? POLICY_NOT_SPECIFIED;
}

function buildLegacyCoverage(coverage: PolicyCoverage): Coverage {
  return {
    id: coverage.id,
    title: coverage.title,
    category: coverage.category,
    limit: getCoverageClauseValue(coverage, "limit"),
    details: getCoverageClauseValue(coverage, "benefit_detail"),
    eligibility: getCoverageClauseValue(coverage, "eligibility"),
    copay: getCoverageClauseValue(coverage, "copay"),
    maxReimbursement: getCoverageClauseValue(coverage, "max_reimbursement"),
    exclusions: getCoverageClauseValue(coverage, "exclusion"),
    waitingPeriod: getCoverageClauseValue(coverage, "waiting_period"),
    sourceFile: coverage.sourceFile,
    policyId: coverage.policyId,
    summary: coverage.summary,
    clauseIds: coverage.clauses.map((clause) => clause.id),
  };
}

function mergePolicyGeneralInfo(left: GeneralInfo, right: GeneralInfo): GeneralInfo {
  const monthlyPremium = parseMoneyValue(left.monthlyPremium) + parseMoneyValue(right.monthlyPremium);
  const annualPremium = parseMoneyValue(left.annualPremium) + parseMoneyValue(right.annualPremium);
  const category =
    left.insuranceCategory ??
    right.insuranceCategory ??
    inferInsuranceCategory(left.policyType || right.policyType);

  return normalizePremiumGeneralInfo({
    policyName: normalizeTextValue(
      uniqueStrings([left.policyName, right.policyName])[0] ?? left.policyName
    ),
    policyNames: uniqueStrings([...(left.policyNames ?? []), left.policyName, ...(right.policyNames ?? []), right.policyName]),
    insurerName: uniqueStrings([left.insurerName, right.insurerName]).join(", ") || POLICY_NOT_SPECIFIED,
    policyNumber:
      uniqueStrings([left.policyNumber, right.policyNumber]).length === 1
        ? uniqueStrings([left.policyNumber, right.policyNumber])[0]
        : POLICY_NOT_SPECIFIED,
    policyType:
      uniqueStrings([left.policyType, right.policyType]).length === 1
        ? uniqueStrings([left.policyType, right.policyType])[0]
        : normalizeTextValue(left.policyType),
    insuranceCategory: category,
    premiumPaymentPeriod:
      left.premiumPaymentPeriod === right.premiumPaymentPeriod
        ? left.premiumPaymentPeriod
        : "unknown",
    monthlyPremium: formatMoneyValue(monthlyPremium),
    annualPremium: formatMoneyValue(annualPremium),
    startDate:
      uniqueStrings([left.startDate, right.startDate])[0] ?? POLICY_NOT_SPECIFIED,
    endDate:
      uniqueStrings([left.endDate, right.endDate])[0] ?? POLICY_NOT_SPECIFIED,
    importantNotes: uniqueStrings([...(left.importantNotes ?? []), ...(right.importantNotes ?? [])]),
    fineprint: uniqueStrings([...(left.fineprint ?? []), ...(right.fineprint ?? [])]),
  });
}

function deriveAggregateGeneralInfo(policies: InsurancePolicy[]) {
  if (policies.length === 0) {
    return normalizeGeneralInfo();
  }
  if (policies.length === 1) {
    const policyInfo = normalizeGeneralInfo(policies[0].generalInfo);
    return {
      ...policyInfo,
      policyNames: uniqueStrings([...(policyInfo.policyNames ?? []), policyInfo.policyName]),
    };
  }

  return policies
    .map((policy) => normalizeGeneralInfo(policy.generalInfo))
    .reduce((acc, item) => mergePolicyGeneralInfo(acc, item));
}

function deriveAggregateSummary(policies: InsurancePolicy[], providedSummary?: unknown) {
  if (isMeaningfulText(providedSummary)) {
    return String(providedSummary).trim();
  }
  const summaries = uniqueStrings(policies.map((policy) => policy.summary));
  if (summaries.length > 0) {
    return summaries.join(" ");
  }
  if (policies.length > 1) {
    return `זוהו ${policies.length} פוליסות בתיק זה.`;
  }
  if (policies.length === 1) {
    return policies[0].summary || `פוליסה אחת זוהתה בתיק זה.`;
  }
  return "אין סיכום זמין";
}

function normalizePersonalizedInsights(rawInsights?: Partial<PersonalizedInsight>[]) {
  return (rawInsights ?? []).map((insight, index) => ({
    id: normalizeTextValue(insight.id, `insight-${index + 1}`),
    type:
      insight.type === "warning" || insight.type === "recommendation" || insight.type === "positive"
        ? insight.type
        : "recommendation",
    title: normalizeTextValue(insight.title, `תובנה ${index + 1}`),
    description: normalizeTextValue(insight.description),
    relevantCoverage: isMeaningfulText(insight.relevantCoverage) ? insight.relevantCoverage!.trim() : "",
    priority:
      insight.priority === "high" || insight.priority === "medium" || insight.priority === "low"
        ? insight.priority
        : "medium",
  }));
}

function deriveDefaultOverlapTitle(coverages: PolicyCoverage[]) {
  const uniqueTitles = uniqueStrings(coverages.map((coverage) => coverage.title));
  if (uniqueTitles.length === 1) {
    return uniqueTitles[0];
  }
  return uniqueTitles.slice(0, 2).join(" / ") || "חפיפת כיסוי";
}

function deriveDefaultOverlapExplanation(coverages: PolicyCoverage[]) {
  if (coverages.length < 2) {
    return "נמצאה חפיפה אפשרית בתוך אותו כיסוי.";
  }
  const policyIds = uniqueStrings(coverages.map((coverage) => coverage.policyId));
  if (policyIds.length > 1) {
    return "נמצאו כיסויים שונים שנראים חופפים ולכן כדאי להשוות ביניהם ברמת הכיסוי.";
  }
  return "נמצאו כיסויים דומים באותה פוליסה, ולכן כדאי לוודא שאין כאן חפיפה מיותרת בתוך המסמך.";
}

function deriveDefaultOverlapRecommendation(coverages: PolicyCoverage[]) {
  const policyIds = uniqueStrings(coverages.map((coverage) => coverage.policyId));
  if (policyIds.length > 1) {
    return "כדאי להשוות בין הכיסויים החופפים ולהחליט אם יש צורך בשניהם או שאחד מהם מספיק.";
  }
  return "כדאי לבדוק אם שני הכיסויים האלה נחוצים או שמדובר בפירוט חוזר של אותה הגנה.";
}

function buildNormalizedPolicies(
  rawPolicies: RawInsurancePolicyLike[],
  requiresReanalysis: boolean,
) {
  const usedPolicyIds = new Map<string, number>();
  const rawToCanonicalPolicyId = new Map<string, string>();
  const rawToCanonicalCoverageId = new Map<string, string>();
  const canonicalCoverageIdSet = new Set<string>();
  const rawToCanonicalClauseId = new Map<string, string>();

  const policies = rawPolicies.map((rawPolicy, policyIndex) => {
    const generalInfo = normalizeGeneralInfo(rawPolicy.generalInfo);
    const identity = getPolicyIdentity(generalInfo) || `policy-${policyIndex + 1}`;
    const nextOrdinal = (usedPolicyIds.get(identity) ?? 0) + 1;
    usedPolicyIds.set(identity, nextOrdinal);
    const policyId = nextOrdinal === 1 ? identity : `${identity}-${nextOrdinal}`;

    if (isMeaningfulText(rawPolicy.id)) {
      rawToCanonicalPolicyId.set(rawPolicy.id!.trim(), policyId);
    }
    rawToCanonicalPolicyId.set(policyId, policyId);

    const usedCoverageIds = new Map<string, number>();
    const usedClauseIds = new Map<string, number>();
    const coverages = (rawPolicy.coverages ?? []).map((rawCoverage, coverageIndex) => {
      const title = normalizeTextValue(rawCoverage.title, `כיסוי ${coverageIndex + 1}`);
      const category = normalizeTextValue(rawCoverage.category, "אחר");
      const sourceFile = isMeaningfulText(rawCoverage.sourceFile) ? rawCoverage.sourceFile!.trim() : undefined;
      const coverageIdentity = [policyId, title, category, sourceFile ?? "source"].join("|");
      const coverageOrdinal = (usedCoverageIds.get(coverageIdentity) ?? 0) + 1;
      usedCoverageIds.set(coverageIdentity, coverageOrdinal);
      const coverageId = buildOrdinalId("coverage", [policyId, title, category, sourceFile ?? "source"], coverageOrdinal);

      if (isMeaningfulText(rawCoverage.id)) {
        rawToCanonicalCoverageId.set(rawCoverage.id!.trim(), coverageId);
      }
      rawToCanonicalCoverageId.set(coverageId, coverageId);
      canonicalCoverageIdSet.add(coverageId);

      const rawClauseSeeds = (rawCoverage.clauses ?? [])
        .filter((clause) => isMeaningfulText(clause?.text));
      const clauseSeeds: RawPolicyClauseLike[] =
        rawClauseSeeds.length > 0
          ? rawClauseSeeds
          : requiresReanalysis
            ? buildLegacyClauseSeed(rawCoverage as LegacyCoverageLike)
            : [
                {
                  kind: "benefit_detail" as const,
                  title: "פירוט הכיסוי",
                  text: rawCoverage.summary,
                },
              ];

      const clauses = clauseSeeds
        .filter((clause) => isMeaningfulText(clause?.text))
        .map((rawClause, clauseIndex) => {
          const kind = normalizeClauseKind(rawClause.kind);
          const clauseTitle = buildClauseTitle(kind, rawClause.title);
          const clauseText = normalizeTextValue(rawClause.text);
          const clauseIdentity = [coverageId, kind, clauseTitle, clauseText].join("|");
          const clauseOrdinal = (usedClauseIds.get(clauseIdentity) ?? 0) + 1;
          usedClauseIds.set(clauseIdentity, clauseOrdinal);
          const clauseId = buildOrdinalId("clause", [coverageId, kind, clauseTitle], clauseOrdinal);
          if (isMeaningfulText(rawClause.id)) {
            rawToCanonicalClauseId.set(rawClause.id!.trim(), clauseId);
          }
          rawToCanonicalClauseId.set(clauseId, clauseId);
          return {
            id: clauseId,
            coverageId,
            kind,
            title: clauseTitle,
            text: clauseText,
          } satisfies PolicyClause;
        });

      const summary =
        normalizeTextValue(
          rawCoverage.summary,
          normalizeTextValue(
            clauses.find((clause) => clause.kind === "benefit_detail")?.text,
            title,
          ),
        );

      return {
        id: coverageId,
        policyId,
        title,
        category,
        summary,
        sourceFile,
        clauses,
      } satisfies PolicyCoverage;
    });

    const sourceFiles = uniqueStrings([
      ...(rawPolicy.sourceFiles ?? []),
      ...coverages.map((coverage) => coverage.sourceFile),
    ]);

    return {
      id: policyId,
      generalInfo,
      summary: normalizeTextValue(rawPolicy.summary, generalInfo.policyName),
      sourceFiles,
      coverages,
    } satisfies InsurancePolicy;
  });

  return {
    policies,
    rawToCanonicalPolicyId,
    rawToCanonicalCoverageId,
    rawToCanonicalClauseId,
    canonicalCoverageIdSet,
  };
}

function buildNormalizedOverlapGroups(
  rawGroups: RawCoverageOverlapLike[] | undefined,
  policies: InsurancePolicy[],
  rawToCanonicalPolicyId: Map<string, string>,
  rawToCanonicalCoverageId: Map<string, string>,
  rawToCanonicalClauseId: Map<string, string>,
) {
  const coverageById = new Map<string, PolicyCoverage>();
  policies.forEach((policy) => {
    policy.coverages.forEach((coverage) => {
      coverageById.set(coverage.id, coverage);
    });
  });

  const normalizedGroups = (rawGroups ?? [])
    .map((rawGroup, groupIndex) => {
      const rawRefs = Array.isArray(rawGroup.coverageRefs)
        ? rawGroup.coverageRefs
        : (rawGroup.coverageIds ?? []).map((coverageId) => ({ coverageId }));

      const coverageRefs = rawRefs
        .map((ref) => {
          const canonicalCoverageId = isMeaningfulText(ref.coverageId)
            ? rawToCanonicalCoverageId.get(ref.coverageId!.trim()) ?? ref.coverageId!.trim()
            : "";
          const coverage = coverageById.get(canonicalCoverageId);
          if (!coverage) {
            return null;
          }
          const rawPolicyId = (ref as Partial<CoverageOverlapReference>).policyId;
          const canonicalPolicyId = isMeaningfulText(rawPolicyId)
            ? rawToCanonicalPolicyId.get(rawPolicyId!.trim()) ?? coverage.policyId
            : coverage.policyId;
          return {
            policyId: canonicalPolicyId,
            coverageId: coverage.id,
          } satisfies CoverageOverlapReference;
        })
        .filter((ref): ref is CoverageOverlapReference => ref !== null)
        .sort((left, right) => left.coverageId.localeCompare(right.coverageId));

      if (coverageRefs.length < 1) {
        return null;
      }

      const matchedClauseIdsByCoverage: Record<string, string[]> = {};
      coverageRefs.forEach((ref) => {
        const coverage = coverageById.get(ref.coverageId);
        if (!coverage) {
          return;
        }
        const rawClauseIds = rawGroup.matchedClauseIdsByCoverage?.[ref.coverageId]
          ?? rawGroup.matchedClauseIdsByCoverage?.[
            Array.from(rawToCanonicalCoverageId.entries()).find((entry) => entry[1] === ref.coverageId)?.[0] ?? ""
          ];
        const normalizedClauseIds = Array.isArray(rawClauseIds)
          ? rawClauseIds
              .map((clauseId) => rawToCanonicalClauseId.get(clauseId) ?? clauseId)
              .filter((clauseId) => coverage.clauses.some((clause) => clause.id === clauseId))
          : [];
        matchedClauseIdsByCoverage[ref.coverageId] =
          normalizedClauseIds.length > 0
            ? normalizedClauseIds
            : coverage.clauses.map((clause) => clause.id);
      });

      const matchedCoverages = coverageRefs
        .map((ref) => coverageById.get(ref.coverageId))
        .filter((coverage): coverage is PolicyCoverage => Boolean(coverage));
      const id = normalizeTextValue(
        rawGroup.id,
        `coverage-overlap-${coverageRefs.map((ref) => ref.coverageId).join("--")}`,
      );

      return {
        id,
        title: normalizeTextValue(rawGroup.title, deriveDefaultOverlapTitle(matchedCoverages)),
        coverageRefs,
        matchedClauseIdsByCoverage,
        explanation: normalizeTextValue(
          rawGroup.explanation,
          deriveDefaultOverlapExplanation(matchedCoverages),
        ),
        recommendation: normalizeTextValue(
          rawGroup.recommendation,
          deriveDefaultOverlapRecommendation(matchedCoverages),
        ),
      } satisfies CoverageOverlapGroup;
    })
    .filter((group): group is CoverageOverlapGroup => group !== null);

  return Array.from(new Map(normalizedGroups.map((group) => [group.id, group])).values()).sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

function buildPolicyOverlapGroups(
  policies: InsurancePolicy[],
  coverageOverlapGroups: CoverageOverlapGroup[],
) {
  const coverageCountByPolicy = new Map(
    policies.map((policy) => [policy.id, Math.max(policy.coverages.length, 1)])
  );
  const groupedPairs = new Map<
    string,
    {
      policyIds: [string, string];
      overlapGroupIds: Set<string>;
      matchedCoverageIdsByPolicy: Map<string, Set<string>>;
    }
  >();

  coverageOverlapGroups.forEach((group) => {
    const byPolicy = new Map<string, Set<string>>();
    group.coverageRefs.forEach((ref) => {
      if (!byPolicy.has(ref.policyId)) {
        byPolicy.set(ref.policyId, new Set());
      }
      byPolicy.get(ref.policyId)!.add(ref.coverageId);
    });
    const policyIds = Array.from(byPolicy.keys()).sort();
    for (let i = 0; i < policyIds.length; i += 1) {
      for (let j = i + 1; j < policyIds.length; j += 1) {
        const left = policyIds[i];
        const right = policyIds[j];
        const pairKey = `${left}::${right}`;
        if (!groupedPairs.has(pairKey)) {
          groupedPairs.set(pairKey, {
            policyIds: [left, right],
            overlapGroupIds: new Set<string>(),
            matchedCoverageIdsByPolicy: new Map([
              [left, new Set<string>()],
              [right, new Set<string>()],
            ]),
          });
        }
        const entry = groupedPairs.get(pairKey)!;
        entry.overlapGroupIds.add(group.id);
        byPolicy.get(left)?.forEach((coverageId) => entry.matchedCoverageIdsByPolicy.get(left)?.add(coverageId));
        byPolicy.get(right)?.forEach((coverageId) => entry.matchedCoverageIdsByPolicy.get(right)?.add(coverageId));
      }
    }
  });

  return Array.from(groupedPairs.values())
    .map((entry) => {
      const [leftPolicyId, rightPolicyId] = entry.policyIds;
      const leftCount = coverageCountByPolicy.get(leftPolicyId) ?? 1;
      const rightCount = coverageCountByPolicy.get(rightPolicyId) ?? 1;
      const smallerPolicyId = leftCount <= rightCount ? leftPolicyId : rightPolicyId;
      const smallerCoverageCount = Math.min(leftCount, rightCount);
      const matchedInSmaller = entry.matchedCoverageIdsByPolicy.get(smallerPolicyId)?.size ?? 0;
      const overlapRatio = smallerCoverageCount > 0 ? matchedInSmaller / smallerCoverageCount : 0;

      if (matchedInSmaller < 2 || overlapRatio < 0.6) {
        return null;
      }

      const percentage = Math.round(overlapRatio * 100);
      return {
        id: `policy-overlap-${entry.policyIds.join("--")}`,
        policyIds: [...entry.policyIds],
        coverageOverlapGroupIds: Array.from(entry.overlapGroupIds).sort(),
        overlapRatio,
        explanation: `לפחות ${matchedInSmaller} כיסויים חופפים בין שתי הפוליסות, והם מכסים כ-${percentage}% מהפוליסה הקטנה יותר.`,
        recommendation: "כדאי להשוות בין שתי הפוליסות ברמת הכיסויים ולבדוק אם אפשר לאחד או לצמצם את אחת מהן.",
      } satisfies PolicyOverlapGroup;
    })
    .filter((group): group is PolicyOverlapGroup => group !== null)
    .sort((left, right) => right.overlapRatio - left.overlapRatio);
}

function deriveLegacyOverlapGroups(
  coverageOverlapGroups: CoverageOverlapGroup[],
  policies: InsurancePolicy[],
) {
  const coverageById = new Map<string, PolicyCoverage>();
  policies.forEach((policy) => {
    policy.coverages.forEach((coverage) => {
      coverageById.set(coverage.id, coverage);
    });
  });

  return coverageOverlapGroups.map((group) => ({
    id: group.id,
    title: group.title,
    coverageIds: group.coverageRefs.map((ref) => ref.coverageId),
    sourceFiles: uniqueStrings(
      group.coverageRefs.map((ref) => coverageById.get(ref.coverageId)?.sourceFile)
    ),
    explanation: group.explanation,
    recommendation: group.recommendation,
  }));
}

function normalizeLegacyAnalysis(raw: LegacyAnalysisLike) {
  const generalInfo = normalizeGeneralInfo(raw.generalInfo);
  const policySeed: RawInsurancePolicyLike = {
    id: getPolicyIdentity(generalInfo) || "legacy-policy-1",
    generalInfo,
    summary: normalizeTextValue(raw.summary, generalInfo.policyName),
    sourceFiles: uniqueStrings((raw.coverages ?? []).map((coverage) => coverage.sourceFile)),
    coverages: (raw.coverages ?? []).map((coverage, index) => ({
      id: normalizeTextValue(coverage.id, `legacy-coverage-${index + 1}`),
      title: normalizeTextValue(coverage.title, `כיסוי ${index + 1}`),
      category: normalizeTextValue(coverage.category, "אחר"),
      summary: normalizeTextValue(coverage.details, normalizeTextValue(coverage.title, `כיסוי ${index + 1}`)),
      sourceFile: isMeaningfulText(coverage.sourceFile) ? coverage.sourceFile!.trim() : undefined,
      clauses: buildLegacyClauseSeed(coverage),
    })),
  };

  const { policies, rawToCanonicalPolicyId, rawToCanonicalCoverageId, rawToCanonicalClauseId } =
    buildNormalizedPolicies([policySeed], true);

  const coverageOverlapGroups = buildNormalizedOverlapGroups(
    (raw.duplicateCoverages ?? []).map((group, index) => ({
      id: normalizeTextValue(group.id, `legacy-overlap-${index + 1}`),
      title: normalizeTextValue(group.title, "חפיפת כיסוי"),
      coverageIds: group.coverageIds ?? [],
      explanation: group.explanation,
      recommendation: group.recommendation,
    })),
    policies,
    rawToCanonicalPolicyId,
    rawToCanonicalCoverageId,
    rawToCanonicalClauseId,
  );

  return {
    policies,
    coverageOverlapGroups,
    requiresReanalysis: true,
    personalizedInsights: normalizePersonalizedInsights(raw.personalizedInsights),
  };
}

function normalizeV2Analysis(raw: RawPolicyAnalysisLike) {
  const { policies, rawToCanonicalPolicyId, rawToCanonicalCoverageId, rawToCanonicalClauseId } =
    buildNormalizedPolicies(raw.policies ?? [], false);

  return {
    policies,
    coverageOverlapGroups: buildNormalizedOverlapGroups(
      raw.coverageOverlapGroups,
      policies,
      rawToCanonicalPolicyId,
      rawToCanonicalCoverageId,
      rawToCanonicalClauseId,
    ),
    requiresReanalysis: Boolean(raw.requiresReanalysis),
    personalizedInsights: normalizePersonalizedInsights(raw.personalizedInsights),
  };
}

export function normalizePolicyAnalysis(raw: unknown): NormalizedPolicyAnalysis {
  const record = isRecord(raw) ? (raw as RawPolicyAnalysisLike) : ({} as RawPolicyAnalysisLike);
  const normalized =
    Array.isArray(record.policies)
      ? normalizeV2Analysis(record)
      : normalizeLegacyAnalysis(record as LegacyAnalysisLike);

  const policyOverlapGroups = buildPolicyOverlapGroups(
    normalized.policies,
    normalized.coverageOverlapGroups,
  );
  const coverages = normalized.policies.flatMap((policy) => policy.coverages.map((coverage) => buildLegacyCoverage(coverage)));
  const summary = deriveAggregateSummary(normalized.policies, record.summary);
  const generalInfo = deriveAggregateGeneralInfo(normalized.policies);
  const duplicateCoverages = deriveLegacyOverlapGroups(normalized.coverageOverlapGroups, normalized.policies);

  return {
    analysisVersion: INSURANCE_ANALYSIS_VERSION,
    summary,
    policies: normalized.policies,
    coverageOverlapGroups: normalized.coverageOverlapGroups,
    policyOverlapGroups,
    personalizedInsights: normalized.personalizedInsights,
    requiresReanalysis: normalized.requiresReanalysis || undefined,
    generalInfo,
    coverages,
    duplicateCoverages,
  };
}

export function mergeNormalizedPolicyAnalyses(results: NormalizedPolicyAnalysis[]): NormalizedPolicyAnalysis {
  if (results.length === 0) {
    return normalizePolicyAnalysis({});
  }

  const mergedPolicies = new Map<string, InsurancePolicy>();
  const mergedCoverageOverlapGroups = new Map<string, CoverageOverlapGroup>();
  const mergedInsights = new Map<string, PersonalizedInsight>();
  const summaries: string[] = [];
  let requiresReanalysis = false;

  results.forEach((result) => {
    if (isMeaningfulText(result.summary)) {
      summaries.push(result.summary);
    }
    requiresReanalysis ||= Boolean(result.requiresReanalysis);

    result.policies.forEach((policy) => {
      const existing = mergedPolicies.get(policy.id);
      if (!existing) {
        mergedPolicies.set(policy.id, {
          ...policy,
          generalInfo: normalizeGeneralInfo(policy.generalInfo),
          sourceFiles: uniqueStrings(policy.sourceFiles),
          coverages: [...policy.coverages],
        });
        return;
      }

      mergedPolicies.set(policy.id, {
        ...existing,
        generalInfo: mergePolicyGeneralInfo(existing.generalInfo, policy.generalInfo),
        summary: uniqueStrings([existing.summary, policy.summary]).join(" ") || existing.summary,
        sourceFiles: uniqueStrings([...existing.sourceFiles, ...policy.sourceFiles]),
        coverages: [...existing.coverages, ...policy.coverages],
      });
    });

    result.coverageOverlapGroups.forEach((group) => {
      mergedCoverageOverlapGroups.set(group.id, group);
    });

    result.personalizedInsights.forEach((insight) => {
      mergedInsights.set(insight.id, insight);
    });
  });

  return normalizePolicyAnalysis({
    analysisVersion: INSURANCE_ANALYSIS_VERSION,
    summary: uniqueStrings(summaries).join(" "),
    policies: Array.from(mergedPolicies.values()),
    coverageOverlapGroups: Array.from(mergedCoverageOverlapGroups.values()),
    personalizedInsights: Array.from(mergedInsights.values()),
    requiresReanalysis,
  });
}

export function inferInsuranceCategory(policyType?: string, coverages?: Array<Pick<Coverage, "category" | "title">>): InsuranceCategory {
  const text = [
    policyType ?? "",
    ...(coverages?.map((coverage) => `${coverage.category} ${coverage.title}`) ?? []),
  ]
    .join(" ")
    .toLowerCase();

  if (/רכב|מקיף|צד ג|חובה|car|vehicle|auto/.test(text)) return "car";
  if (/דירה|מבנה|תכולה|רעידת אדמה|צנרת|home|apartment|property/.test(text)) return "home";
  if (/חיים|ריסק|אובדן כושר|נכות|מוות|סיעוד|פנסי|life/.test(text)) return "life";
  return "health";
}

/** Status of a file in the upload queue */
export type FileStatus = "pending" | "uploading" | "queued" | "processing" | "done" | "error";

/** Uploaded file metadata */
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: FileStatus;
  url?: string;
  error?: string;
  _file?: File;
}

export type InsuranceCategory = "health" | "life" | "car" | "home";

/** A single coverage/benefit found in the policy */
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
}

/** General financial and policy information */
export interface GeneralInfo {
  policyName: string;
  policyNames?: string[];
  insurerName: string;
  policyNumber: string;
  policyType: string;
  insuranceCategory?: InsuranceCategory;
  monthlyPremium: string;
  annualPremium: string;
  startDate: string;
  endDate: string;
  importantNotes: string[];
  fineprint: string[];
}

export interface DuplicateCoverageGroup {
  id: string;
  title: string;
  coverageIds: string[];
  sourceFiles: string[];
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

/** Full analysis result returned by the AI */
export interface PolicyAnalysis {
  coverages: Coverage[];
  generalInfo: GeneralInfo;
  summary: string;
  duplicateCoverages?: DuplicateCoverageGroup[];
  personalizedInsights?: PersonalizedInsight[];
}

export function inferInsuranceCategory(policyType?: string, coverages?: Coverage[]): InsuranceCategory {
  const text = [
    policyType ?? "",
    ...(coverages?.map(c => `${c.category} ${c.title}`) ?? []),
  ].join(" ").toLowerCase();

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

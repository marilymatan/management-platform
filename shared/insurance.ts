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
  monthlyPremium: string;
  annualPremium: string;
  startDate: string;
  endDate: string;
  importantNotes: string[];
  fineprint: string[];
}

/** Full analysis result returned by the AI */
export interface PolicyAnalysis {
  coverages: Coverage[];
  generalInfo: GeneralInfo;
  summary: string;
}

/** Status of a file in the upload queue */
export type FileStatus = "pending" | "uploading" | "uploaded" | "analyzing" | "done" | "error";

/** Uploaded file metadata */
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  status: FileStatus;
  url?: string;
  error?: string;
}

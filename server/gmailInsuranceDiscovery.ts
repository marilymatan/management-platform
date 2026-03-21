import type { InsuranceCategory } from "@shared/insurance";
import { invokeLLM } from "./_core/llm";

export type InsuranceArtifactType =
  | "policy_document"
  | "renewal_notice"
  | "premium_notice"
  | "coverage_update"
  | "claim_update"
  | "other";

type ProviderSignal = {
  name: string;
  category: string;
} | null;

type ExtractInsuranceDiscoveryInput = {
  subject: string;
  from: string;
  body: string;
  pdfText: string | null;
  detectedProvider: ProviderSignal;
  attachmentFilename?: string | null;
};

export type ExtractedInsuranceDiscovery = {
  provider: string;
  insuranceCategory: InsuranceCategory | null;
  artifactType: InsuranceArtifactType;
  confidence: number;
  summary: string;
  actionHint: string;
  policyNumber: string | null;
  monthlyPremium: number | null;
  renewalDate: string | null;
  policyType: string | null;
};

const INSURANCE_SIGNAL_PATTERNS = [
  /ביטוח/,
  /פוליס/,
  /כיסוי/,
  /פרמיה/,
  /חידוש/,
  /מבוטח/,
  /מבטח/,
  /תביעה/,
  /\binsurance\b/i,
  /\bpolicy\b/i,
  /\bcoverage\b/i,
  /\bpremium\b/i,
  /\brenewal\b/i,
  /\bclaim\b/i,
];

const EXCLUDED_INSURANCE_PATTERNS = [
  /ביטוח לאומי/,
  /\bnational insurance\b/i,
];

const POLICY_DISCOVERY_PATTERNS = [
  /ביטוח/,
  /פוליס/,
  /חידוש/,
  /כיסוי/,
  /פרמיה/,
  /תביעה/,
  /אישור/,
  /תעודה/,
  /מסמך/,
  /נספח/,
  /הצעה/,
  /\binsurance\b/i,
  /\bpolicy\b/i,
  /\brenewal\b/i,
  /\bcoverage\b/i,
  /\bpremium\b/i,
  /\bclaim\b/i,
  /\bcertificate\b/i,
  /\bschedule\b/i,
  /\bdocument\b/i,
  /\bproposal\b/i,
];

export function inferInsuranceCategoryFromText(text: string): InsuranceCategory | null {
  const normalized = text.toLowerCase();
  if (/רכב|מקיף|חובה|צד ג|נהג|vehicle|auto|car/i.test(normalized)) return "car";
  if (/דירה|מבנה|תכולה|משכנתא|צנרת|רעידת אדמה|apartment|home|property/i.test(normalized)) return "home";
  if (/חיים|ריסק|אובדן כושר|נכות|שארים|סיעוד|life|risk/i.test(normalized)) return "life";
  if (/בריאות|רפוא|אשפוז|אישפוז|שיניים|תרופות|medical|health|ambulatory/i.test(normalized)) return "health";
  return null;
}

export function inferInsuranceArtifactType(text: string, hasAttachment: boolean): InsuranceArtifactType {
  const normalized = text.toLowerCase();
  if (/חידוש|renewal/i.test(normalized)) return "renewal_notice";
  if (/פרמיה|חיוב|תשלום|premium|invoice|bill|receipt|לתשלום/i.test(normalized)) return "premium_notice";
  if (/תביעה|claim/i.test(normalized)) return "claim_update";
  if (/כיסוי|עדכון|הרחבה|החרגה|coverage|benefit/i.test(normalized)) return "coverage_update";
  if (hasAttachment || /פוליסה|policy document|schedule|certificate/i.test(normalized)) return "policy_document";
  return "other";
}

function extractSenderName(from: string): string | null {
  const displayNameMatch = from.match(/^"?([^"<]+?)"?\s*<[^>]+>/);
  if (displayNameMatch?.[1]?.trim()) {
    return displayNameMatch[1].trim();
  }

  const domainMatch = from.match(/@([^.>]+)\./);
  if (domainMatch?.[1]) {
    const domain = domainMatch[1];
    if (!["gmail", "yahoo", "hotmail", "outlook", "walla", "nana"].includes(domain.toLowerCase())) {
      return domain;
    }
  }

  return null;
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeArtifactType(value: unknown, fallbackText: string, hasAttachment: boolean): InsuranceArtifactType {
  if (
    value === "policy_document" ||
    value === "renewal_notice" ||
    value === "premium_notice" ||
    value === "coverage_update" ||
    value === "claim_update" ||
    value === "other"
  ) {
    return value;
  }
  return inferInsuranceArtifactType(fallbackText, hasAttachment);
}

function normalizeInsuranceCategory(value: unknown, fallbackText: string): InsuranceCategory | null {
  if (value === "health" || value === "life" || value === "car" || value === "home") {
    return value;
  }
  return inferInsuranceCategoryFromText(fallbackText);
}

export function looksLikeInsuranceMessage({
  subject,
  from,
  body,
  attachmentFilename,
  detectedProvider,
}: {
  subject: string;
  from: string;
  body: string;
  attachmentFilename?: string | null;
  detectedProvider: ProviderSignal;
}) {
  if (detectedProvider?.category === "ביטוח") {
    return true;
  }

  const text = [subject, from, body.slice(0, 1200), attachmentFilename ?? ""].join(" ");
  const hasExcludedPattern = EXCLUDED_INSURANCE_PATTERNS.some((pattern) => pattern.test(text));
  const hasInsuranceSignal = INSURANCE_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));

  if (hasExcludedPattern && detectedProvider?.category !== "ביטוח") {
    return /פוליס|פרמיה|חידוש|כיסוי|רכב|בריאות|דירה|חיים|policy|premium|renewal|claim/i.test(text);
  }

  return hasInsuranceSignal;
}

export function looksLikeInsurancePdfCandidate({
  subject,
  from,
  body,
  attachmentFilename,
  detectedProvider,
}: {
  subject: string;
  from: string;
  body: string;
  attachmentFilename?: string | null;
  detectedProvider: ProviderSignal;
}) {
  if (detectedProvider?.category === "ביטוח") {
    return true;
  }

  const text = [subject, from, body.slice(0, 1200), attachmentFilename ?? ""].join(" ");
  const hasExcludedPattern = EXCLUDED_INSURANCE_PATTERNS.some((pattern) => pattern.test(text));
  const hasPolicySignal = POLICY_DISCOVERY_PATTERNS.some((pattern) => pattern.test(text));

  if (hasExcludedPattern && detectedProvider?.category !== "ביטוח") {
    return /פוליס|פרמיה|חידוש|כיסוי|ביטוח|policy|premium|renewal|coverage|claim|certificate|schedule|document|proposal/i.test(text);
  }

  return hasPolicySignal;
}

export async function extractInsuranceDiscoveryData({
  subject,
  from,
  body,
  pdfText,
  detectedProvider,
  attachmentFilename,
}: ExtractInsuranceDiscoveryInput): Promise<ExtractedInsuranceDiscovery> {
  const contentForAnalysis = [
    `שולח: ${from}`,
    `נושא: ${subject}`,
    `ספק שזוהה אוטומטית: ${detectedProvider?.name ?? "לא זוהה"}`,
    `שם קובץ מצורף: ${attachmentFilename ?? "אין"}`,
    `גוף המייל:\n${body}`,
    pdfText ? `\n--- תוכן PDF ---\n${pdfText.slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const fallbackText = `${subject}\n${body}\n${pdfText ?? ""}\n${attachmentFilename ?? ""}`;
  const fallbackProvider = detectedProvider?.name ?? extractSenderName(from) ?? "גוף ביטוחי";
  const fallbackArtifactType = inferInsuranceArtifactType(fallbackText, Boolean(attachmentFilename));
  const fallbackCategory = inferInsuranceCategoryFromText(fallbackText);

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `אתה מומחה בזיהוי מיילים ומסמכים ביטוחיים בישראל.
המטרה היא לזהות האם המייל קשור לביטוח פרטי של המשתמש, ומה בדיוק נמצא בו.

החזר JSON בלבד ללא הסברים עם השדות:
- provider: שם הגוף הביטוחי או הסוכן המרכזי
- insuranceCategory: health/life/car/home/unknown
- artifactType: policy_document/renewal_notice/premium_notice/coverage_update/claim_update/other
- confidence: מספר בין 0 ל-1
- summary: סיכום קצר בעברית עד 140 תווים שמתאר מה זוהה
- actionHint: פעולה מומלצת קצרה בעברית למשתמש
- policyNumber: מספר פוליסה אם נמצא, אחרת null
- monthlyPremium: פרמיה חודשית אם מופיעה כמספר, אחרת null
- renewalDate: תאריך חידוש/סיום אם קיים בפורמט YYYY-MM-DD, אחרת null
- policyType: סוג הפוליסה אם ניתן להבין, אחרת null

כללים:
- אם מדובר בחיוב/עדכון פרמיה מביטוח, artifactType צריך להיות premium_notice
- אם מדובר בחידוש, artifactType צריך להיות renewal_notice
- אם מדובר במסמך פוליסה, תנאים או schedule עם קובץ PDF, artifactType צריך להיות policy_document
- אם מדובר בעדכון כיסוי, הטבה, שינוי תנאים או הרחבה, artifactType צריך להיות coverage_update
- אם מדובר בתביעה או סטטוס תביעה, artifactType צריך להיות claim_update
- insuranceCategory צריך לשקף את סוג הביטוח: בריאות, חיים, רכב או דירה
- כל summary ו-actionHint חייבים להיות בעברית`,
        },
        {
          role: "user",
          content: contentForAnalysis,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "insurance_discovery",
          strict: true,
          schema: {
            type: "object",
            properties: {
              provider: { type: "string" },
              insuranceCategory: {
                type: "string",
                enum: ["health", "life", "car", "home", "unknown"],
              },
              artifactType: {
                type: "string",
                enum: ["policy_document", "renewal_notice", "premium_notice", "coverage_update", "claim_update", "other"],
              },
              confidence: { type: "number" },
              summary: { type: "string" },
              actionHint: { type: "string" },
              policyNumber: { type: ["string", "null"] },
              monthlyPremium: { type: ["number", "null"] },
              renewalDate: { type: ["string", "null"] },
              policyType: { type: ["string", "null"] },
            },
            required: [
              "provider",
              "insuranceCategory",
              "artifactType",
              "confidence",
              "summary",
              "actionHint",
              "policyNumber",
              "monthlyPremium",
              "renewalDate",
              "policyType",
            ],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    let jsonStr: string | null = null;

    if (typeof rawContent === "string") {
      jsonStr = rawContent;
    } else if (Array.isArray(rawContent)) {
      jsonStr = rawContent
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
    }

    if (!jsonStr) {
      throw new Error("Missing structured insurance discovery response");
    }

    const parsed = JSON.parse(jsonStr) as Partial<ExtractedInsuranceDiscovery> & {
      insuranceCategory?: InsuranceCategory | "unknown";
    };

    return {
      provider:
        typeof parsed.provider === "string" && parsed.provider.trim()
          ? parsed.provider.trim()
          : fallbackProvider,
      insuranceCategory: normalizeInsuranceCategory(parsed.insuranceCategory, fallbackText),
      artifactType: normalizeArtifactType(parsed.artifactType, fallbackText, Boolean(attachmentFilename)),
      confidence: normalizeConfidence(parsed.confidence),
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim()
          ? parsed.summary.trim()
          : subject.trim() || "זוהה מסר ביטוחי מהמייל",
      actionHint:
        typeof parsed.actionHint === "string" && parsed.actionHint.trim()
          ? parsed.actionHint.trim()
          : fallbackArtifactType === "renewal_notice"
            ? "כדאי לבדוק את תנאי החידוש לפני אישור"
            : fallbackArtifactType === "premium_notice"
              ? "כדאי לוודא שהחיוב תואם את הפוליסה"
              : "כדאי לשייך את המסמך לתיק הביטוחי",
      policyNumber:
        typeof parsed.policyNumber === "string" && parsed.policyNumber.trim()
          ? parsed.policyNumber.trim()
          : null,
      monthlyPremium:
        typeof parsed.monthlyPremium === "number" && Number.isFinite(parsed.monthlyPremium)
          ? parsed.monthlyPremium
          : null,
      renewalDate:
        typeof parsed.renewalDate === "string" && parsed.renewalDate.trim()
          ? parsed.renewalDate.trim()
          : null,
      policyType:
        typeof parsed.policyType === "string" && parsed.policyType.trim()
          ? parsed.policyType.trim()
          : null,
    };
  } catch {
    return {
      provider: fallbackProvider,
      insuranceCategory: fallbackCategory,
      artifactType: fallbackArtifactType,
      confidence: detectedProvider?.category === "ביטוח" ? 0.68 : 0.45,
      summary: subject.trim() || "זוהה מסר ביטוחי מהמייל",
      actionHint:
        fallbackArtifactType === "renewal_notice"
          ? "כדאי לבדוק את תנאי החידוש לפני אישור"
          : fallbackArtifactType === "premium_notice"
            ? "כדאי לוודא שהחיוב תואם את הפוליסה"
            : "כדאי לשייך את המסמך לתיק הביטוחי",
      policyNumber: null,
      monthlyPremium: null,
      renewalDate: null,
      policyType: null,
    };
  }
}

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
  userFilterContext?: string;
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

const KNOWN_INSURANCE_DOMAINS = [
  "harel-group.co.il",
  "harel.co.il",
  "migdal.co.il",
  "clal.co.il",
  "clalbit.co.il",
  "phoenix.co.il",
  "fnx.co.il",
  "menora.co.il",
  "ayalon-ins.co.il",
  "ayalon.co.il",
  "shirbit.co.il",
  "hachshara.co.il",
  "hachsharainsurance.co.il",
  "bituachyashir.co.il",
  "bit-y.co.il",
  "aig.co.il",
  "shmera.co.il",
  "shomera.co.il",
  "libra-insurance.co.il",
  "libra.co.il",
  "9ins.co.il",
  "rac.co.il",
  "psagot.co.il",
  "as-invest.co.il",
  "mor-invest.co.il",
  "ha-invest.co.il",
  "maccabi4u.co.il",
  "maccabi.co.il",
  "clalit.co.il",
  "meuhedet.co.il",
  "leumit.co.il",
  "wesure.co.il",
  "we4sure.co.il",
  "passportcard.co.il",
  "amitassur.co.il",
  "shlomo-ins.co.il",
  "dikla.co.il",
  "tmura.co.il",
];

const KNOWN_INSURANCE_NAMES = [
  "הראל",
  "מגדל",
  "כלל ביטוח",
  "הפניקס",
  "מנורה מבטחים",
  "מנורה",
  "איילון",
  "שירביט",
  "הכשרה",
  "ביטוח ישיר",
  "שומרה",
  "ליברה",
  "AIG",
  "פסגות",
  "אלטשולר שחם",
  "מור",
  "הלמן אלדובי",
  "כלל בריאות",
  "מכבי שירותי בריאות",
  "כללית",
  "מאוחדת",
  "לאומית",
  "פספורטכארד",
  "דיקלה",
  "תמורה",
  "שלמה ביטוח",
  "ווישור",
];

const STRONG_INSURANCE_PHRASES = [
  /פוליסת ביטוח/,
  /חידוש ביטוח/,
  /חידוש פוליס/,
  /חיוב פרמי/,
  /פרמיית ביטוח/,
  /פרמיה חודשית/,
  /תביעת ביטוח/,
  /ביטוח רכב/,
  /ביטוח דירה/,
  /ביטוח בריאות/,
  /ביטוח חיים/,
  /ביטוח מקיף/,
  /ביטוח חובה/,
  /ביטוח צד ג/,
  /ביטוח משכנתא/,
  /ביטוח נסיעות/,
  /ביטוח סיעודי/,
  /ביטוח תאונות/,
  /אובדן כושר עבודה/,
  /כיסוי ביטוחי/,
  /עדכון כיסוי ביטוחי/,
  /ביטוח תכולה/,
  /ביטוח מבנה/,
  /סוכן ביטוח/,
  /סוכנות ביטוח/,
  /מבוטח.{0,10}פוליס/,
  /פוליס.{0,10}מבוטח/,
  /השתתפות עצמית/,
  /\binsurance\s+polic/i,
  /\binsurance\s+premium/i,
  /\binsurance\s+renewal/i,
  /\binsurance\s+claim/i,
  /\binsurance\s+coverage/i,
  /\bpolicy\s+renewal/i,
  /\bpolicy\s+document/i,
  /\bpolicy\s+number/i,
  /\bpolicy\s+schedule/i,
  /\bpolicy\s+certificate/i,
];

const HEBREW_INSURANCE_KEYWORDS = [
  /ביטוח/,
  /פוליס/,
  /פרמיה/,
  /מבוטח/,
  /מבטח/,
];

const SECONDARY_INSURANCE_SIGNALS = [
  /כיסוי/,
  /חידוש/,
  /תביעה/,
  /\binsurance\b/i,
];

const FALSE_POSITIVE_PATTERNS = [
  /privacy\s+policy/i,
  /terms\s+(of\s+)?(service|use)/i,
  /cookie\s+policy/i,
  /refund\s+policy/i,
  /return\s+policy/i,
  /shipping\s+policy/i,
  /cancellation\s+policy/i,
  /acceptable\s+use\s+policy/i,
  /מדיניות\s*פרטיות/,
  /תנאי\s*שימוש/,
  /מדיניות\s*ביטולים/,
  /מדיניות\s*החזרות/,
  /premium\s+(plan|account|subscription|member|tier|feature|upgrade|version)/i,
  /go\s+premium/i,
  /\bpremium\b.{0,15}\b(monthly|annual|yearly|free)\b/i,
  /network\s+coverage/i,
  /coverage\s+area/i,
  /5g\s+coverage/i,
  /claim\s+(your|this|the|a)\s+(reward|prize|gift|bonus|offer|discount|coupon|code)/i,
  /subscription\s+renewal/i,
  /domain\s+renewal/i,
  /license\s+renewal/i,
  /membership\s+renewal/i,
  /renewal\s+(of\s+)?(your\s+)?(subscription|domain|license|membership|plan|account)/i,
];

const EXCLUDED_INSURANCE_PATTERNS = [
  /ביטוח לאומי/,
  /\bnational insurance\b/i,
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

function senderIsKnownInsurer(from: string): boolean {
  const lowerFrom = from.toLowerCase();
  if (KNOWN_INSURANCE_DOMAINS.some((domain) => lowerFrom.includes(domain))) {
    return true;
  }
  if (KNOWN_INSURANCE_NAMES.some((name) => lowerFrom.includes(name))) {
    return true;
  }
  return false;
}

function hasFalsePositiveContext(text: string): boolean {
  return FALSE_POSITIVE_PATTERNS.some((pattern) => pattern.test(text));
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

  if (senderIsKnownInsurer(from)) {
    return true;
  }

  const text = [subject, from, body.slice(0, 1200), attachmentFilename ?? ""].join(" ");

  const isExcluded = EXCLUDED_INSURANCE_PATTERNS.some((pattern) => pattern.test(text));
  if (isExcluded) {
    return STRONG_INSURANCE_PHRASES.some((p) => p.test(text))
      || HEBREW_INSURANCE_KEYWORDS.filter((p) => p.test(text)).length >= 2;
  }

  if (STRONG_INSURANCE_PHRASES.some((pattern) => pattern.test(text))) {
    return true;
  }

  const subjectAndFilename = [subject, attachmentFilename ?? ""].join(" ");
  const hasHebrewKeywordInSubject = HEBREW_INSURANCE_KEYWORDS.some((p) => p.test(subjectAndFilename));
  if (hasHebrewKeywordInSubject && !hasFalsePositiveContext(text)) {
    return true;
  }

  const hebrewKeywordCount = HEBREW_INSURANCE_KEYWORDS.filter((p) => p.test(text)).length;
  const secondaryCount = SECONDARY_INSURANCE_SIGNALS.filter((p) => p.test(text)).length;
  const totalSignals = hebrewKeywordCount + secondaryCount;

  if (totalSignals >= 2 && !hasFalsePositiveContext(text)) {
    return true;
  }

  return false;
}

const INSURANCE_PDF_FILENAME_PATTERNS = [
  /insurance/i,
  /פוליס/,
  /ביטוח/,
  /פרמיה/,
  /מבוטח/,
];

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

  if (senderIsKnownInsurer(from)) {
    return true;
  }

  const text = [subject, from, body.slice(0, 1200), attachmentFilename ?? ""].join(" ");

  const isExcluded = EXCLUDED_INSURANCE_PATTERNS.some((pattern) => pattern.test(text));
  if (isExcluded) {
    return STRONG_INSURANCE_PHRASES.some((p) => p.test(text))
      || HEBREW_INSURANCE_KEYWORDS.filter((p) => p.test(text)).length >= 2;
  }

  if (attachmentFilename && INSURANCE_PDF_FILENAME_PATTERNS.some((p) => p.test(attachmentFilename))) {
    return true;
  }

  if (STRONG_INSURANCE_PHRASES.some((pattern) => pattern.test(text))) {
    return true;
  }

  const subjectAndFilename = [subject, attachmentFilename ?? ""].join(" ");
  const hasHebrewKeywordInSubject = HEBREW_INSURANCE_KEYWORDS.some((p) => p.test(subjectAndFilename));
  if (hasHebrewKeywordInSubject && !hasFalsePositiveContext(text)) {
    return true;
  }

  const hebrewKeywordCount = HEBREW_INSURANCE_KEYWORDS.filter((p) => p.test(text)).length;
  const secondaryCount = SECONDARY_INSURANCE_SIGNALS.filter((p) => p.test(text)).length;
  const totalSignals = hebrewKeywordCount + secondaryCount;

  if (totalSignals >= 2 && !hasFalsePositiveContext(text)) {
    return true;
  }

  return false;
}

export async function extractInsuranceDiscoveryData({
  subject,
  from,
  body,
  pdfText,
  detectedProvider,
  attachmentFilename,
  userFilterContext,
}: ExtractInsuranceDiscoveryInput): Promise<ExtractedInsuranceDiscovery> {
  const contentForAnalysis = [
    `שולח: ${from}`,
    `נושא: ${subject}`,
    `ספק שזוהה אוטומטית: ${detectedProvider?.name ?? "לא זוהה"}`,
    `שם קובץ מצורף: ${attachmentFilename ?? "אין"}`,
    userFilterContext ? `\n${userFilterContext}` : "",
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
המטרה היא לזהות האם המייל קשור לביטוח פרטי של המשתמש (ביטוח בריאות, חיים, רכב, דירה), ומה בדיוק נמצא בו.

כלל ברזל: המייל חייב להיות מחברת ביטוח, סוכן ביטוח, או קופת חולים, ולעסוק בפוליסת ביטוח, פרמיה, חידוש, תביעה או כיסוי ביטוחי.
אם אף אחד מהתנאים האלה לא מתקיים — החזר confidence: 0.

חברות ביטוח מוכרות בישראל: הראל, מגדל, כלל ביטוח, הפניקס, מנורה מבטחים, איילון, שירביט, הכשרה, ביטוח ישיר, AIG, שומרה, ליברה, דיקלה, שלמה ביטוח, 9 ביטוח, פספורטכארד, ווישור.
קופות חולים (ביטוח משלים): מכבי, כללית, מאוחדת, לאומית.

מיילים שאינם ביטוחיים — ALWAYS confidence: 0 ו-artifactType: "other":
- חשבוניות/קבלות מחברות תקשורת (בזק, פרטנר, סלקום, הוט)
- חשבוניות מחברות תוכנה (Elementor, Wix, Google, Microsoft)
- חשבוניות חשמל, מים, ארנונה, גז
- קבלות מעסקים, חנויות, מסעדות
- אישורי רכישה מחנויות אונליין (Amazon, AliExpress)
- קבלות תרומה לעמותות
- חשבוניות מייצוג עסקי (רואי חשבון, עורכי דין) שאינן קשורות לביטוח
- מיילים עם "privacy policy", "terms of service" או "premium subscription"
- חשבוניות הוראת קבע שאינן ביטוח
- כל מייל שהשולח אינו חברת ביטוח/סוכן ביטוח והתוכן אינו עוסק בפוליסה ביטוחית

מיילים ביטוחיים — confidence 0.7+:
- מסמכי פוליסה מחברות ביטוח
- הודעות חידוש ביטוח
- חיובי פרמיה מחברות ביטוח
- עדכוני כיסוי ביטוחי
- סטטוס תביעות ביטוח
- תשלום לסוכן ביטוח עבור פוליסה

החזר JSON בלבד ללא הסברים עם השדות:
- provider: שם הגוף הביטוחי או הסוכן המרכזי (אם אינו ביטוחי, כתוב את שם השולח)
- insuranceCategory: health/life/car/home/unknown
- artifactType: policy_document/renewal_notice/premium_notice/coverage_update/claim_update/other
- confidence: מספר בין 0 ל-1. 0 = לא קשור לביטוח כלל. 0.7+ = קשור לביטוח. 0.85+ = בוודאות גבוהה
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
- אם המייל אינו ביטוחי כלל, החזר confidence: 0 ו-artifactType: "other"
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

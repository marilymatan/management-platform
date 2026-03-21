import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import { getUserProfile, logApiUsage } from "./db";
import { storageRead } from "./storage";
import type { PolicyAnalysis, PremiumPaymentPeriod } from "@shared/insurance";

const ANALYSIS_SYSTEM_PROMPT = `אתה מומחה לניתוח פוליסות ביטוח בעברית. תפקידך לנתח את הטקסט של פוליסת הביטוח ולחלץ ממנו מידע מובנה.

עליך להחזיר JSON בפורמט הבא בלבד, ללא טקסט נוסף:
{
  "coverages": [
    {
      "id": "מזהה ייחודי",
      "title": "שם הכיסוי/ההטבה",
      "category": "קטגוריה משנית בתוך סוג הביטוח — ראה רשימה למטה",
      "limit": "מגבלת שימוש (למשל: עד 12 טיפולים בשנה)",
      "details": "תיאור מפורט של הכיסוי",
      "eligibility": "תנאי זכאות",
      "copay": "גובה השתתפות עצמית",
      "maxReimbursement": "תקרת החזר כספי",
      "exclusions": "החרגות רלוונטיות",
      "waitingPeriod": "תקופת אכשרה",
      "sourceFile": "שם הקובץ שמהו הכיסוי חולץ"
    }
  ],
  "generalInfo": {
    "policyName": "שם הפוליסה",
    "insurerName": "שם חברת הביטוח",
    "policyNumber": "מספר פוליסה",
    "policyType": "סוג הפוליסה",
    "insuranceCategory": "health | life | car | home",
    "premiumPaymentPeriod": "monthly | annual | unknown",
    "monthlyPremium": "פרמיה חודשית",
    "annualPremium": "פרמיה שנתית",
    "startDate": "תאריך תחילה",
    "endDate": "תאריך סיום",
    "importantNotes": ["הערות חשובות"],
    "fineprint": ["אותיות קטנות וחריגים בולטים"]
  },
  "summary": "סיכום כללי קצר של הפוליסה ב-2-3 משפטים",
  "duplicateCoverages": [
    {
      "id": "מזהה ייחודי",
      "title": "שם הכיסוי הכפול",
      "coverageIds": ["מזהה כיסוי 1", "מזהה כיסוי 2"],
      "sourceFiles": ["שם קובץ 1", "שם קובץ 2"],
      "explanation": "הסבר קצר מדוע כיסויים אלו נחשבים כפולים או חופפים",
      "recommendation": "המלצה למשתמש, למשל: לבדוק אם משלם כפל ביטוח"
    }
  ]
}

הנחיות:
- חלץ את כל הכיסויים וההטבות שמופיעים בפוליסה
- לכל כיסוי, הוסף את שם הקובץ (sourceFile) שממנו הוא חולץ
- אם מידע מסוים לא נמצא, רשום "לא מצוין בפוליסה" (לא "לא צוין")
- עבור insuranceCategory, סווג את הפוליסה לאחת מהקטגוריות הבאות בלבד:
  * "health" - ביטוח בריאות (רפואה משלימה, אשפוז, שיניים, תרופות, ביטוח בריאות)
  * "life" - ביטוח חיים (ביטוח חיים, ריסק, אובדן כושר עבודה, נכות, מוות, סיעודי, פנסיה)
  * "car" - ביטוח רכב (ביטוח רכב, מקיף, צד ג, חובה, רכב)
  * "home" - ביטוח דירה (ביטוח דירה, מבנה, תכולה, רעידת אדמה, צנרת)
- עבור category של כל כיסוי, סווג לפי סוג הפוליסה:
  * ביטוח בריאות (health): "רפואה משלימה", "אשפוז", "שיניים", "עיניים", "תרופות", "ניתוח", "נפש", "הריון ולידה", "אחר"
  * ביטוח חיים (life): "ביטוח חיים", "אובדן כושר עבודה", "סיעודי", "נכות", "פנסיה", "ריסק", "אחר"
  * ביטוח רכב (car): "חובה", "מקיף", "צד ג", "נזקי גוף", "רכוש", "גניבה", "אחר"
  * ביטוח דירה (home): "מבנה", "תכולה", "צד ג", "נזקי טבע", "צנרת", "אחר"
  חשוב: תמיד השתמש בקטגוריות מגוונות ומתאימות לתוכן. אל תסווג את כל הכיסויים לקטגוריה אחת — חלק אותם לפי תת-נושאים ברורים.
- הקפד על דיוק בנתונים הכספיים
- קבע premiumPaymentPeriod כך:
  * "monthly" רק אם המסמך מציין במפורש חיוב חודשי, פרמיה חודשית, לחודש, או 12 תשלומים חודשיים
  * "annual" רק אם המסמך מציין במפורש חיוב שנתי, פרמיה שנתית, לשנה, או מחיר לכל תקופת הביטוח
  * "unknown" אם התקופה לא ברורה מספיק
- אם premiumPaymentPeriod הוא "annual", אל תעתיק את אותו סכום ל-monthlyPremium
- אם premiumPaymentPeriod הוא "monthly", אל תעתיק את אותו סכום ל-annualPremium
- אם מופיע סכום אחד בלבד והתקופה לא ברורה, החזר premiumPaymentPeriod = "unknown" ואל תנחש תקופה
- שמור על שפה ברורה ומובנת בעברית
- החזר JSON תקין בלבד

הנחיות לזיהוי כיסויים כפולים:
- בדוק אם יש כיסויים זהים או חופפים שמופיעים ביותר מקובץ אחד, או אפילו בתוך אותו קובץ
- כיסוי נחשב כפול כאשר שני כיסויים מכסים את אותו סוג טיפול/שירות, גם אם השמות שונים במקצת
- לכל קבוצת כיסויים כפולים, ציין את ה-id של הכיסויים הרלוונטיים מתוך מערך ה-coverages
- הסבר בבירור למה הכיסויים נחשבים כפולים (למשל: שניהם מכסים ביקור רופא מומחה)
- תן המלצה מעשית למשתמש (למשל: כדאי לבדוק אם ניתן לבטל אחד מהכיסויים ולחסוך בפרמיה)
- אם אין כיסויים כפולים, החזר מערך ריק []`;

const PDF_BATCH_SIZE = 3;

const BATCH_MERGE_PROMPT = `אתה מומחה לניתוח פוליסות ביטוח בעברית. קיבלת תוצאות ניתוח של מספר קבוצות קבצי פוליסה שנותחו בנפרד.

משימתך:
1. אחד את כל פרטי המידע הכללי (generalInfo) לאובייקט אחד מסכם. אם יש מספר פוליסות שונות, סכם את שמות כל הפוליסות, חברות הביטוח, מספרי הפוליסות, הפרמיות וכו׳
2. כתוב סיכום (summary) אחד כולל שמכסה את כל הפוליסות
3. זהה כיסויים כפולים (duplicateCoverages) בין הקבוצות השונות — השתמש ב-id המדויקים כפי שהתקבלו (מתחילים ב-b0-, b1-, b2- וכו׳)

הנחיות:
- בדוק כיסויים כפולים בין קבוצות שונות, לא רק בתוך אותה קבוצה
- כיסוי נחשב כפול כאשר שני כיסויים מכסים את אותו סוג טיפול/שירות
- עבור insuranceCategory, בחר את הקטגוריה הנפוצה ביותר
- עבור premiumPaymentPeriod, בחר את התקופה רק אם היא ברורה מהקבוצות; אחרת החזר "unknown"
- שמור על שפה ברורה ומובנת בעברית
- החזר JSON תקין בלבד`;

const PERSONALIZED_INSIGHTS_PROMPT = `אתה יועץ ביטוח מומחה ומנוסה בישראל. קיבלת ניתוח מלא של פוליסת ביטוח ופרופיל אישי של הלקוח.

תפקידך: לזהות פערים ביטוחיים, סיכונים, והמלצות מותאמות אישית על בסיס המצב האישי והמשפחתי של הלקוח.

עליך לבדוק את הנקודות הבאות ולהחזיר תובנות רלוונטיות בלבד:

1. **ילדים ומשפחה**: אם יש ילדים - האם יש כיסוי לתאונות ילדים, ביטוח בריאות לילדים, ביטוח שיניים לילדים? האם סכום ביטוח החיים מתאים למספר הנפשות התלויות?
2. **דירה ומשכנתא**: אם יש דירה בבעלות - האם יש ביטוח מבנה ותכולה? אם יש משכנתא - האם יש ביטוח חיים לכיסוי המשכנתא?
3. **רכבים**: אם יש רכבים - האם יש כיסוי מקיף/צד ג'? האם מספר הרכבים תואם את הכיסוי?
4. **תעסוקה והכנסה**: האם יש ביטוח אובדן כושר עבודה? האם סכום הכיסוי מתאים לטווח ההכנסה? עצמאים - האם יש ביטוח אחריות מקצועית?
5. **גיל ושלב בחיים**: על בסיס הגיל - האם הפוליסה מתאימה? האם כדאי לשקול ביטוח סיעודי? האם תקופת האכשרה בעייתית?
6. **ספורט אקסטרימי**: אם יש תחביבים מסוכנים - האם יש החרגות רלוונטיות בפוליסה?
7. **מצב בריאותי**: אם יש מצבים בריאותיים מיוחדים - האם הכיסוי הבריאותי מתאים? האם יש החרגות שעלולות להשפיע?
8. **חיות מחמד**: אם יש חיות מחמד - האם יש ביטוח וטרינרי?

כללים:
- החזר רק תובנות רלוונטיות למצב הספציפי של הלקוח (אל תחזיר תובנות על ילדים אם אין ילדים, וכו')
- לכל תובנה, סווג אותה כ: "warning" (חסר כיסוי קריטי), "recommendation" (המלצה לשיפור), או "positive" (כיסוי מתאים קיים)
- דרג כל תובנה: "high" (דחוף/קריטי), "medium" (חשוב), או "low" (כדאי לשקול)
- כתוב בעברית ברורה ומובנת, בגובה העיניים
- הסבר בקצרה למה זה רלוונטי ומה ההמלצה המעשית
- החזר 3-8 תובנות, לא יותר
- אם יש כיסוי טוב שמתאים למצב הלקוח, ציין את זה כ-"positive"

החזר JSON בפורמט הבא בלבד:
{
  "personalizedInsights": [
    {
      "id": "מזהה ייחודי",
      "type": "warning | recommendation | positive",
      "title": "כותרת קצרה",
      "description": "הסבר מפורט",
      "relevantCoverage": "שם הכיסוי הרלוונטי או ריק",
      "priority": "high | medium | low"
    }
  ]
}`;

type AnalysisFile = {
  name: string;
  fileKey?: string;
  url?: string;
  mimeType?: string;
};

type AnalysisRecord = {
  sessionId: string;
  userId?: number | null;
  files: AnalysisFile[];
};

function extractLLMContent(response: any): string {
  const choice = response.choices?.[0];
  if (!choice?.message) {
    throw new Error("Empty response from AI");
  }
  const { content } = choice.message;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("");
  }
  if (!text.trim()) {
    throw new Error("Empty response from AI");
  }
  if (choice.finish_reason === "length") {
    throw new Error("תגובת ה-AI נקטעה באמצע כי היא ארוכה מדי. נסה להעלות פחות קבצים בבת אחת.");
  }
  return text;
}

function parseLLMJson<T = any>(raw: string): T {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  return JSON.parse(cleaned);
}

const POLICY_NOT_SPECIFIED = "לא מצוין בפוליסה";

function isMissingPolicyValue(value: string | null | undefined) {
  if (!value) return true;
  const normalized = value.trim();
  return normalized.length === 0 || normalized === POLICY_NOT_SPECIFIED || normalized === "לא צוין בפוליסה";
}

function normalizePremiumGeneralInfo<T extends PolicyAnalysis["generalInfo"]>(generalInfo: T): T {
  const normalized = {
    ...generalInfo,
    premiumPaymentPeriod:
      generalInfo.premiumPaymentPeriod === "monthly" ||
      generalInfo.premiumPaymentPeriod === "annual" ||
      generalInfo.premiumPaymentPeriod === "unknown"
        ? generalInfo.premiumPaymentPeriod
        : ("unknown" as PremiumPaymentPeriod),
  };

  if (normalized.premiumPaymentPeriod === "annual") {
    const annualSource = isMissingPolicyValue(normalized.annualPremium)
      ? normalized.monthlyPremium
      : normalized.annualPremium;
    normalized.annualPremium = annualSource ?? POLICY_NOT_SPECIFIED;
    if (isMissingPolicyValue(normalized.monthlyPremium) || normalized.monthlyPremium === annualSource) {
      normalized.monthlyPremium = POLICY_NOT_SPECIFIED;
    }
  }

  if (normalized.premiumPaymentPeriod === "monthly") {
    const monthlySource = isMissingPolicyValue(normalized.monthlyPremium)
      ? normalized.annualPremium
      : normalized.monthlyPremium;
    normalized.monthlyPremium = monthlySource ?? POLICY_NOT_SPECIFIED;
    if (isMissingPolicyValue(normalized.annualPremium) || normalized.annualPremium === monthlySource) {
      normalized.annualPremium = POLICY_NOT_SPECIFIED;
    }
  }

  return normalized as T;
}

function normalizeAnalysisPremiums(result: PolicyAnalysis): PolicyAnalysis {
  return {
    ...result,
    generalInfo: normalizePremiumGeneralInfo(result.generalInfo),
  };
}

function buildProfileContext(profile: any): string {
  const labels: Record<string, string> = {
    single: "רווק/ה",
    married: "נשוי/אה",
    divorced: "גרוש/ה",
    widowed: "אלמן/ה",
    salaried: "שכיר/ה",
    self_employed: "עצמאי/ת",
    business_owner: "בעל/ת עסק",
    student: "סטודנט/ית",
    retired: "פנסיונר/ית",
    unemployed: "לא עובד/ת",
    male: "זכר",
    female: "נקבה",
    other: "אחר",
    below_5k: "מתחת ל-5,000 ₪",
    "5k_10k": "5,000-10,000 ₪",
    "10k_15k": "10,000-15,000 ₪",
    "15k_25k": "15,000-25,000 ₪",
    "25k_40k": "25,000-40,000 ₪",
    above_40k: "מעל 40,000 ₪",
  };
  const parts: string[] = [];
  if (profile.dateOfBirth) {
    const age = Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    parts.push(`גיל: ${age}`);
  }
  if (profile.gender) parts.push(`מין: ${labels[profile.gender] || profile.gender}`);
  if (profile.maritalStatus) parts.push(`מצב משפחתי: ${labels[profile.maritalStatus] || profile.maritalStatus}`);
  if (profile.numberOfChildren > 0) {
    parts.push(`מספר ילדים: ${profile.numberOfChildren}`);
    if (profile.childrenAges) parts.push(`גילאי ילדים: ${profile.childrenAges}`);
  }
  if (profile.employmentStatus) parts.push(`תעסוקה: ${labels[profile.employmentStatus] || profile.employmentStatus}`);
  if (profile.incomeRange) parts.push(`הכנסה חודשית: ${labels[profile.incomeRange] || profile.incomeRange}`);
  if (profile.businessName) parts.push(`שם העסק: ${profile.businessName}`);
  if (profile.businessTaxId) parts.push(`מספר מזהה עסקי: ${profile.businessTaxId}`);
  if (profile.businessEmailDomains) parts.push(`דומיינים או מיילים עסקיים: ${profile.businessEmailDomains}`);
  if (profile.ownsApartment) parts.push("בעלות על דירה: כן");
  if (profile.hasActiveMortgage) parts.push("משכנתא פעילה: כן");
  if (profile.numberOfVehicles > 0) parts.push(`מספר רכבים: ${profile.numberOfVehicles}`);
  if (profile.hasExtremeSports) parts.push("ספורט אקסטרימי/תחביבים מסוכנים: כן");
  if (profile.hasSpecialHealthConditions) {
    parts.push("מצב בריאותי מיוחד: כן");
    if (profile.healthConditionsDetails) parts.push(`פרטי מצב בריאותי: ${profile.healthConditionsDetails}`);
  }
  if (profile.hasPets) parts.push("חיות מחמד: כן");
  return parts.join("\n");
}

async function logLlmUsage(sessionId: string, userId: number | null | undefined, response: {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}) {
  if (!response.usage) {
    return;
  }
  await logApiUsage({
    userId: userId ?? null,
    sessionId,
    action: "analyze",
    model: response.model || ENV.llmModel,
    promptTokens: response.usage.prompt_tokens ?? 0,
    completionTokens: response.usage.completion_tokens ?? 0,
  });
}

async function loadFileParts(fileList: AnalysisFile[]) {
  const parts = await Promise.all(
    fileList.map(async (file) => {
      const fileKey = file.fileKey || file.url;
      if (!fileKey) {
        return null;
      }
      const buffer = await storageRead(fileKey);
      if (!buffer) {
        return null;
      }
      const base64 = buffer.toString("base64");
      const mimeType = typeof file.mimeType === "string" && file.mimeType.trim()
        ? file.mimeType
        : "application/pdf";
      return {
        type: "image_url" as const,
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };
    })
  );
  return parts.filter((part): part is NonNullable<typeof part> => part !== null);
}

const generalInfoSchema = {
  type: "object",
  properties: {
    policyName: { type: "string" },
    insurerName: { type: "string" },
    policyNumber: { type: "string" },
    policyType: { type: "string" },
    insuranceCategory: { type: "string", enum: ["health", "life", "car", "home"] },
    premiumPaymentPeriod: { type: "string", enum: ["monthly", "annual", "unknown"] },
    monthlyPremium: { type: "string" },
    annualPremium: { type: "string" },
    startDate: { type: "string" },
    endDate: { type: "string" },
    importantNotes: { type: "array", items: { type: "string" } },
    fineprint: { type: "array", items: { type: "string" } },
  },
  required: ["policyName", "insurerName", "policyNumber", "policyType", "insuranceCategory", "premiumPaymentPeriod", "monthlyPremium", "annualPremium", "startDate", "endDate", "importantNotes", "fineprint"],
  additionalProperties: false,
} as const;

const duplicateCoveragesSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string" },
      coverageIds: { type: "array", items: { type: "string" } },
      sourceFiles: { type: "array", items: { type: "string" } },
      explanation: { type: "string" },
      recommendation: { type: "string" },
    },
    required: ["id", "title", "coverageIds", "sourceFiles", "explanation", "recommendation"],
    additionalProperties: false,
  },
} as const;

const analysisResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "policy_analysis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        coverages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              category: { type: "string" },
              limit: { type: "string" },
              details: { type: "string" },
              eligibility: { type: "string" },
              copay: { type: "string" },
              maxReimbursement: { type: "string" },
              exclusions: { type: "string" },
              waitingPeriod: { type: "string" },
              sourceFile: { type: "string" },
            },
            required: ["id", "title", "category", "limit", "details", "eligibility", "copay", "maxReimbursement", "exclusions", "waitingPeriod", "sourceFile"],
            additionalProperties: false,
          },
        },
        generalInfo: generalInfoSchema,
        summary: { type: "string" },
        duplicateCoverages: duplicateCoveragesSchema,
      },
      required: ["coverages", "generalInfo", "summary", "duplicateCoverages"],
      additionalProperties: false,
    },
  },
};

async function runBatchAnalysis(sessionId: string, userId: number | null | undefined, fileList: AnalysisFile[], label: string): Promise<PolicyAnalysis> {
  const fileParts = await loadFileParts(fileList);
  const response = await invokeLLM({
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text" as const, text: `נא לנתח את פוליסות הביטוח הבאות (${label}) ולהחזיר את המידע בפורמט JSON המבוקש:` },
          ...fileParts,
        ],
      },
    ],
    maxTokens: 65536,
    response_format: analysisResponseFormat,
  });
  await logLlmUsage(sessionId, userId, response);
  return normalizeAnalysisPremiums(parseLLMJson<PolicyAnalysis>(extractLLMContent(response)));
}

export async function analyzePolicySession(analysis: AnalysisRecord) {
  const typedFiles = analysis.files;
  if (!typedFiles.length) {
    throw new Error("לא נמצאו קבצים לעיבוד");
  }

  let analysisResult: PolicyAnalysis;

  if (typedFiles.length <= PDF_BATCH_SIZE) {
    try {
      analysisResult = await runBatchAnalysis(
        analysis.sessionId,
        analysis.userId,
        typedFiles,
        `${typedFiles.length} קבצים`
      );
    } catch (error: any) {
      throw new Error(error?.message || "שגיאה בעיבוד תגובת ה-AI. התגובה לא התקבלה בפורמט תקין. נסה להעלות פחות קבצים בבת אחת.");
    }
  } else {
    const batches: AnalysisFile[][] = [];
    for (let i = 0; i < typedFiles.length; i += PDF_BATCH_SIZE) {
      batches.push(typedFiles.slice(i, i + PDF_BATCH_SIZE));
    }

    const batchResults: PolicyAnalysis[] = [];
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx += 1) {
      const batchResult = await runBatchAnalysis(
        analysis.sessionId,
        analysis.userId,
        batches[batchIdx],
        `${batches[batchIdx].length} קבצים, קבוצה ${batchIdx + 1} מתוך ${batches.length}`
      );
      batchResult.coverages = batchResult.coverages.map((coverage) => ({
        ...coverage,
        id: `b${batchIdx}-${coverage.id}`,
      }));
      if (batchResult.duplicateCoverages) {
        batchResult.duplicateCoverages = batchResult.duplicateCoverages.map((duplicate) => ({
          ...duplicate,
          id: `b${batchIdx}-${duplicate.id}`,
          coverageIds: duplicate.coverageIds.map((coverageId) => `b${batchIdx}-${coverageId}`),
        }));
      }
      batchResults.push(batchResult);
    }

    const allCoverages = batchResults.flatMap((result) => result.coverages);
    const withinBatchDuplicates = batchResults.flatMap((result) => result.duplicateCoverages || []);
    const coverageSummary = allCoverages.map((coverage) => ({
      id: coverage.id,
      title: coverage.title,
      category: coverage.category,
      sourceFile: coverage.sourceFile,
      copay: coverage.copay,
      limit: coverage.limit,
    }));
    const batchGeneralInfos = batchResults.map((result, index) => ({ batch: index, ...result.generalInfo }));
    const batchSummariesText = batchResults.map((result, index) => `קבוצה ${index + 1}: ${result.summary}`).join("\n");

    try {
      const mergeResponse = await invokeLLM({
        messages: [
          { role: "system", content: BATCH_MERGE_PROMPT },
          {
            role: "user",
            content: `מידע כללי מכל הקבוצות:\n${JSON.stringify(batchGeneralInfos, null, 2)}\n\nסיכומי הקבוצות:\n${batchSummariesText}\n\nכל הכיסויים (תקציר):\n${JSON.stringify(coverageSummary, null, 2)}\n\nכיסויים כפולים שזוהו בתוך קבוצות:\n${JSON.stringify(withinBatchDuplicates, null, 2)}`,
          },
        ],
        maxTokens: 16384,
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: "batch_merge",
            strict: true,
            schema: {
              type: "object",
              properties: {
                generalInfo: generalInfoSchema,
                summary: { type: "string" },
                duplicateCoverages: duplicateCoveragesSchema,
              },
              required: ["generalInfo", "summary", "duplicateCoverages"],
              additionalProperties: false,
            },
          },
        },
      });
      await logLlmUsage(analysis.sessionId, analysis.userId, mergeResponse);
      const merged = parseLLMJson<{
        generalInfo: PolicyAnalysis["generalInfo"];
        summary: string;
        duplicateCoverages: NonNullable<PolicyAnalysis["duplicateCoverages"]>;
      }>(extractLLMContent(mergeResponse));
      const allDuplicates = [...withinBatchDuplicates, ...(merged.duplicateCoverages || [])];
      const seenIds = new Set<string>();
      const uniqueDuplicates = allDuplicates.filter((duplicate) => {
        if (seenIds.has(duplicate.id)) {
          return false;
        }
        seenIds.add(duplicate.id);
        return true;
      });
      analysisResult = normalizeAnalysisPremiums({
        coverages: allCoverages,
        generalInfo: normalizePremiumGeneralInfo(merged.generalInfo),
        summary: merged.summary,
        duplicateCoverages: uniqueDuplicates,
      });
    } catch {
      analysisResult = normalizeAnalysisPremiums({
        coverages: allCoverages,
        generalInfo: batchResults[0].generalInfo,
        summary: batchSummariesText,
        duplicateCoverages: withinBatchDuplicates,
      });
    }
  }

  const userProfile = analysis.userId ? await getUserProfile(analysis.userId) : null;
  if (userProfile) {
    try {
      const profileText = buildProfileContext(userProfile);
      const insightsResponse = await invokeLLM({
        messages: [
          { role: "system", content: PERSONALIZED_INSIGHTS_PROMPT },
          {
            role: "user",
            content: `פרופיל הלקוח:\n${profileText}\n\nניתוח הפוליסה:\n${JSON.stringify(analysisResult, null, 2)}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "personalized_insights",
            strict: true,
            schema: {
              type: "object",
              properties: {
                personalizedInsights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      type: { type: "string", enum: ["warning", "recommendation", "positive"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      relevantCoverage: { type: "string" },
                      priority: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["id", "type", "title", "description", "relevantCoverage", "priority"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["personalizedInsights"],
              additionalProperties: false,
            },
          },
        },
      });
      const parsed = parseLLMJson<{ personalizedInsights?: PolicyAnalysis["personalizedInsights"] }>(extractLLMContent(insightsResponse));
      analysisResult.personalizedInsights = parsed.personalizedInsights;
      await logLlmUsage(analysis.sessionId, analysis.userId, insightsResponse);
    } catch {
    }
  }

  return {
    analysisResult,
    insuranceCategory: analysisResult.generalInfo?.insuranceCategory ?? null,
  };
}

import { POLICY_ANALYSIS_BATCH_SIZE } from "@shared/analysisProgress";
import {
  mergeNormalizedPolicyAnalyses,
  normalizePolicyAnalysis,
  type NormalizedPolicyAnalysis,
  type PolicyAnalysis,
} from "@shared/insurance";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import { getUserProfile, logApiUsage, updateAnalysisProcessingProgress } from "./db";
import { buildProfileContext } from "./helpers";
import { storageRead } from "./storage";

const ANALYSIS_SYSTEM_PROMPT = `אתה מומחה לניתוח פוליסות ביטוח בעברית. תפקידך לנתח מסמכי ביטוח ולהחזיר JSON היררכי בלבד.

מודל הנתונים המחייב:
- פוליסה
- כיסוי בתוך פוליסה
- סעיף בתוך כיסוי

כלל קריטי:
- אי אפשר לבטל או להמליץ לבטל סעיף בודד.
- סעיף הוא ראיה והסבר בלבד.
- יחידת הפעולה היא כיסוי, ורק אם יש חפיפה רחבה בין כמה כיסויים אפשר לרמוז שיש מקום לבדוק גם את הפוליסה.

החזר JSON בלבד בפורמט הבא:
{
  "summary": "סיכום כולל קצר של כל המסמכים",
  "policies": [
    {
      "id": "מזהה פוליסה ייחודי בתוך התגובה",
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
      "summary": "סיכום קצר של הפוליסה",
      "sourceFiles": ["שם קובץ"],
      "coverages": [
        {
          "id": "מזהה כיסוי ייחודי בתוך התגובה",
          "title": "שם הכיסוי/ההטבה",
          "category": "קטגוריה משנית בתוך סוג הביטוח",
          "summary": "תיאור קצר של הכיסוי",
          "sourceFile": "שם הקובץ שממנו הכיסוי חולץ",
          "clauses": [
            {
              "id": "מזהה סעיף ייחודי בתוך התגובה",
              "kind": "benefit_detail | eligibility | limit | copay | max_reimbursement | exclusion | waiting_period | other",
              "title": "כותרת אנושית קצרה",
              "text": "טקסט הסעיף"
            }
          ]
        }
      ]
    }
  ],
  "coverageOverlapGroups": [
    {
      "id": "מזהה חפיפה ייחודי בתוך התגובה",
      "title": "שם קצר של החפיפה",
      "coverageRefs": [
        { "policyId": "מזהה פוליסה", "coverageId": "מזהה כיסוי" }
      ],
      "matchedClauseIdsByCoverage": {
        "מזהה כיסוי": ["מזהה סעיף 1", "מזהה סעיף 2"]
      },
      "explanation": "למה הכיסויים נראים חופפים",
      "recommendation": "מה כדאי לבדוק ברמת הכיסוי"
    }
  ]
}

הנחיות:
- אם מידע מסוים לא נמצא, רשום "לא מצוין בפוליסה".
- הפרד בין פוליסות שונות. אם המסמכים מתייחסים לפוליסות שונות, אל תאחד ביניהן.
- אם שני מסמכים שייכים לאותה פוליסה, מותר לאחד אותם רק אם מספר הפוליסה תואם, או אם שם הפוליסה ושם החברה תואמים בדיוק.
- עבור insuranceCategory, השתמש רק באחת מהאפשרויות: health, life, car, home.
- עבור category של כיסוי, השתמש בקטגוריה אנושית ספציפית ורלוונטית, לא כללית מדי.
- חלץ סעיפים רק כאשר יש טקסט ממשי. אין צורך לייצר סעיף ריק.
- אם אין חפיפות כיסוי, החזר coverageOverlapGroups כ-[].
- חפיפת כיסוי נוצרת כאשר שני כיסויים או יותר נראים כמספקים אותה הגנה או הגנה דומה.
- recommendation חייב להישאר ברמת הכיסוי או ההשוואה בין כיסויים. אסור להמליץ לבטל סעיף.
- שמור על עברית ברורה ומובנת.
- החזר JSON תקין בלבד.`;

const PERSONALIZED_INSIGHTS_PROMPT = `אתה יועץ ביטוח מומחה ומנוסה בישראל. קיבלת ניתוח מלא של פוליסות ביטוח ופרופיל אישי של הלקוח.

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
- החזר רק תובנות רלוונטיות למצב הספציפי של הלקוח.
- לכל תובנה, סווג אותה כ: "warning", "recommendation", או "positive".
- דרג כל תובנה: "high", "medium", או "low".
- כתוב בעברית ברורה ומובנת.
- החזר 3-8 תובנות, לא יותר.
- אם יש כיסוי טוב שמתאים למצב הלקוח, ציין את זה כ-"positive".

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
  workerId?: string | null;
};

type LlmPolicyAnalysisResponse = {
  summary: string;
  policies: Array<{
    id: string;
    generalInfo: PolicyAnalysis["generalInfo"];
    summary: string;
    sourceFiles: string[];
    coverages: Array<{
      id: string;
      title: string;
      category: string;
      summary: string;
      sourceFile: string;
      clauses: Array<{
        id: string;
        kind: string;
        title: string;
        text: string;
      }>;
    }>;
  }>;
  coverageOverlapGroups: Array<{
    id: string;
    title: string;
    coverageRefs: Array<{ policyId: string; coverageId: string }>;
    matchedClauseIdsByCoverage: Record<string, string[]>;
    explanation: string;
    recommendation: string;
  }>;
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

async function logLlmUsage(
  sessionId: string,
  userId: number | null | undefined,
  response: {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  },
) {
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
      const mimeType =
        typeof file.mimeType === "string" && file.mimeType.trim()
          ? file.mimeType
          : "application/pdf";
      return {
        type: "image_url" as const,
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };
    }),
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
  required: [
    "policyName",
    "insurerName",
    "policyNumber",
    "policyType",
    "insuranceCategory",
    "premiumPaymentPeriod",
    "monthlyPremium",
    "annualPremium",
    "startDate",
    "endDate",
    "importantNotes",
    "fineprint",
  ],
  additionalProperties: false,
} as const;

const clauseSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: {
      type: "string",
      enum: [
        "benefit_detail",
        "eligibility",
        "limit",
        "copay",
        "max_reimbursement",
        "exclusion",
        "waiting_period",
        "other",
      ],
    },
    title: { type: "string" },
    text: { type: "string" },
  },
  required: ["id", "kind", "title", "text"],
  additionalProperties: false,
} as const;

const coverageSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    category: { type: "string" },
    summary: { type: "string" },
    sourceFile: { type: "string" },
    clauses: {
      type: "array",
      items: clauseSchema,
    },
  },
  required: ["id", "title", "category", "summary", "sourceFile", "clauses"],
  additionalProperties: false,
} as const;

const policySchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    generalInfo: generalInfoSchema,
    summary: { type: "string" },
    sourceFiles: {
      type: "array",
      items: { type: "string" },
    },
    coverages: {
      type: "array",
      items: coverageSchema,
    },
  },
  required: ["id", "generalInfo", "summary", "sourceFiles", "coverages"],
  additionalProperties: false,
} as const;

const coverageOverlapGroupSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    coverageRefs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          policyId: { type: "string" },
          coverageId: { type: "string" },
        },
        required: ["policyId", "coverageId"],
        additionalProperties: false,
      },
    },
    matchedClauseIdsByCoverage: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" },
      },
    },
    explanation: { type: "string" },
    recommendation: { type: "string" },
  },
  required: [
    "id",
    "title",
    "coverageRefs",
    "matchedClauseIdsByCoverage",
    "explanation",
    "recommendation",
  ],
  additionalProperties: false,
} as const;

const analysisResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "policy_analysis_v2",
    strict: true,
    schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        policies: {
          type: "array",
          items: policySchema,
        },
        coverageOverlapGroups: {
          type: "array",
          items: coverageOverlapGroupSchema,
        },
      },
      required: ["summary", "policies", "coverageOverlapGroups"],
      additionalProperties: false,
    },
  },
};

async function runBatchAnalysis(
  sessionId: string,
  userId: number | null | undefined,
  fileList: AnalysisFile[],
  label: string,
): Promise<NormalizedPolicyAnalysis> {
  const fileParts = await loadFileParts(fileList);
  if (fileParts.length === 0) {
    throw new Error(
      "לא ניתן לקרוא את קבצי ה-PDF מהשרת. ייתכן שהקבצים נמחקו לאחר עדכון גרסה. נסה להעלות את הקבצים מחדש.",
    );
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text: `נא לנתח את מסמכי הביטוח הבאים (${label}) ולהחזיר את המידע בפורמט JSON המבוקש.`,
          },
          ...fileParts,
        ],
      },
    ],
    maxTokens: 65536,
    response_format: analysisResponseFormat,
  });

  await logLlmUsage(sessionId, userId, response);
  return normalizePolicyAnalysis(
    parseLLMJson<LlmPolicyAnalysisResponse>(extractLLMContent(response)),
  );
}

export async function analyzePolicySession(analysis: AnalysisRecord) {
  const typedFiles = analysis.files;
  if (!typedFiles.length) {
    throw new Error("לא נמצאו קבצים לעיבוד");
  }

  const updateProgress = async (
    processedFileCount: number,
    activeBatchFileCount: number,
  ) => {
    if (!analysis.workerId) {
      return;
    }
    await updateAnalysisProcessingProgress(analysis.sessionId, analysis.workerId, {
      processedFileCount,
      activeBatchFileCount,
    });
  };

  let analysisResult: NormalizedPolicyAnalysis;

  if (typedFiles.length <= POLICY_ANALYSIS_BATCH_SIZE) {
    try {
      await updateProgress(0, typedFiles.length);
      analysisResult = await runBatchAnalysis(
        analysis.sessionId,
        analysis.userId,
        typedFiles,
        `${typedFiles.length} קבצים`,
      );
    } catch (error: any) {
      throw new Error(
        error?.message ||
          "שגיאה בעיבוד תגובת ה-AI. התגובה לא התקבלה בפורמט תקין. נסה להעלות פחות קבצים בבת אחת.",
      );
    }
  } else {
    const batches: AnalysisFile[][] = [];
    for (let i = 0; i < typedFiles.length; i += POLICY_ANALYSIS_BATCH_SIZE) {
      batches.push(typedFiles.slice(i, i + POLICY_ANALYSIS_BATCH_SIZE));
    }

    const batchResults: NormalizedPolicyAnalysis[] = [];
    for (let batchIdx = 0; batchIdx < batches.length; batchIdx += 1) {
      const processedFileCount = batchIdx * POLICY_ANALYSIS_BATCH_SIZE;
      await updateProgress(processedFileCount, batches[batchIdx].length);
      const batchResult = await runBatchAnalysis(
        analysis.sessionId,
        analysis.userId,
        batches[batchIdx],
        `${batches[batchIdx].length} קבצים, קבוצה ${batchIdx + 1} מתוך ${batches.length}`,
      );
      batchResults.push(batchResult);
    }

    await updateProgress(typedFiles.length, 0);
    analysisResult = mergeNormalizedPolicyAnalyses(batchResults);
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
            content: `פרופיל הלקוח:\n${profileText}\n\nניתוח הפוליסות:\n${JSON.stringify(analysisResult, null, 2)}`,
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
                      type: {
                        type: "string",
                        enum: ["warning", "recommendation", "positive"],
                      },
                      title: { type: "string" },
                      description: { type: "string" },
                      relevantCoverage: { type: "string" },
                      priority: {
                        type: "string",
                        enum: ["high", "medium", "low"],
                      },
                    },
                    required: [
                      "id",
                      "type",
                      "title",
                      "description",
                      "relevantCoverage",
                      "priority",
                    ],
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
      const parsed = parseLLMJson<{
        personalizedInsights?: PolicyAnalysis["personalizedInsights"];
      }>(extractLLMContent(insightsResponse));
      analysisResult = normalizePolicyAnalysis({
        ...analysisResult,
        personalizedInsights: parsed.personalizedInsights ?? [],
      });
      await logLlmUsage(analysis.sessionId, analysis.userId, insightsResponse);
    } catch {
      // Keep the main analysis even if the personalized insight pass fails.
    }
  }

  return {
    analysisResult,
    insuranceCategory: analysisResult.generalInfo?.insuranceCategory ?? null,
  };
}

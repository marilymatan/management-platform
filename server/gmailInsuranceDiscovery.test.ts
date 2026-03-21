import { beforeEach, describe, expect, it, vi } from "vitest";
const { invokeLLMMock } = vi.hoisted(() => ({
  invokeLLMMock: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: invokeLLMMock,
}));

import {
  extractInsuranceDiscoveryData,
  inferInsuranceArtifactType,
  inferInsuranceCategoryFromText,
  looksLikeInsuranceMessage,
  looksLikeInsurancePdfCandidate,
} from "./gmailInsuranceDiscovery";

describe("gmailInsuranceDiscovery", () => {
  beforeEach(() => {
    invokeLLMMock.mockReset();
  });

  it("detects insurance messages from provider classification", () => {
    expect(
      looksLikeInsuranceMessage({
        subject: "עדכון חשבון",
        from: "noreply@harel-group.co.il",
        body: "שלום רב",
        detectedProvider: { name: "הראל", category: "ביטוח" },
      })
    ).toBe(true);
  });

  it("filters out national insurance messages without private insurance signals", () => {
    expect(
      looksLikeInsuranceMessage({
        subject: "עדכון מביטוח לאומי",
        from: "noreply@btl.gov.il",
        body: "אישור קצבה",
        detectedProvider: null,
      })
    ).toBe(false);
  });

  it("keeps messages from national insurance only when there are private policy signals", () => {
    expect(
      looksLikeInsuranceMessage({
        subject: "ביטוח לאומי",
        from: "noreply@btl.gov.il",
        body: "מצורף עדכון פרמיה לפוליסת רכב פרטית",
        detectedProvider: null,
      })
    ).toBe(true);
  });

  it("recognizes generic policy PDF emails as discovery candidates", () => {
    expect(
      looksLikeInsurancePdfCandidate({
        subject: "Your documents are ready",
        from: "notifications@example.com",
        body: "Please review the attached file.",
        attachmentFilename: "policy.pdf",
        detectedProvider: null,
      })
    ).toBe(true);
  });

  it("infers artifact type from renewal and premium wording", () => {
    expect(inferInsuranceArtifactType("הודעת חידוש לפוליסת הרכב שלך", false)).toBe("renewal_notice");
    expect(inferInsuranceArtifactType("חיוב פרמיה חודשי לחודש אפריל", false)).toBe("premium_notice");
  });

  it("infers policy document when there is an attachment", () => {
    expect(inferInsuranceArtifactType("מסמך תנאי פוליסה מצורף", true)).toBe("policy_document");
  });

  it("infers insurance category from common policy wording", () => {
    expect(inferInsuranceCategoryFromText("חידוש ביטוח רכב מקיף")).toBe("car");
    expect(inferInsuranceCategoryFromText("פוליסת חיים ואובדן כושר עבודה")).toBe("life");
    expect(inferInsuranceCategoryFromText("ביטוח דירה ותכולה")).toBe("home");
  });

  it("extracts normalized structured discovery data from the llm response", async () => {
    invokeLLMMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              provider: " הראל ",
              insuranceCategory: "health",
              artifactType: "premium_notice",
              confidence: 1.7,
              summary: " הודעת חיוב חדשה ",
              actionHint: " לבדוק את החיוב ",
              policyNumber: " 12345 ",
              monthlyPremium: 219,
              renewalDate: "2026-12-31",
              policyType: "בריאות פרטית",
            }),
          },
        },
      ],
    });

    const result = await extractInsuranceDiscoveryData({
      subject: "הודעת חיוב",
      from: "notifications@harel.co.il",
      body: "חיוב חודשי חדש",
      pdfText: "מסמך בריאות",
      detectedProvider: { name: "הראל", category: "ביטוח" },
      attachmentFilename: "premium.pdf",
    });

    expect(result).toEqual({
      provider: "הראל",
      insuranceCategory: "health",
      artifactType: "premium_notice",
      confidence: 1,
      summary: "הודעת חיוב חדשה",
      actionHint: "לבדוק את החיוב",
      policyNumber: "12345",
      monthlyPremium: 219,
      renewalDate: "2026-12-31",
      policyType: "בריאות פרטית",
    });
  });

  it("supports array content and falls back for unknown artifact and category values", async () => {
    invokeLLMMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  provider: "",
                  insuranceCategory: "unknown",
                  artifactType: "mystery",
                  confidence: -1,
                  summary: "",
                  actionHint: "",
                  policyNumber: "",
                  monthlyPremium: null,
                  renewalDate: "",
                  policyType: "",
                }),
              },
            ],
          },
        },
      ],
    });

    const result = await extractInsuranceDiscoveryData({
      subject: "חידוש ביטוח רכב",
      from: "sales@menora.co.il",
      body: "מצורף מסמך חידוש",
      pdfText: null,
      detectedProvider: null,
      attachmentFilename: "renewal.pdf",
    });

    expect(result.provider).toBe("menora");
    expect(result.insuranceCategory).toBe("car");
    expect(result.artifactType).toBe("renewal_notice");
    expect(result.confidence).toBe(0);
    expect(result.summary).toBe("חידוש ביטוח רכב");
    expect(result.actionHint).toBe("כדאי לבדוק את תנאי החידוש לפני אישור");
  });

  it("falls back to heuristics when the llm request fails", async () => {
    invokeLLMMock.mockRejectedValue(new Error("boom"));

    const result = await extractInsuranceDiscoveryData({
      subject: "מסמך פוליסה חדש",
      from: "agent@example.com",
      body: "פוליסת חיים לעיון",
      pdfText: null,
      detectedProvider: { name: "מגדל", category: "ביטוח" },
      attachmentFilename: "policy.pdf",
    });

    expect(result.provider).toBe("מגדל");
    expect(result.insuranceCategory).toBe("life");
    expect(result.artifactType).toBe("policy_document");
    expect(result.confidence).toBe(0.68);
    expect(result.actionHint).toBe("כדאי לשייך את המסמך לתיק הביטוחי");
    expect(result.policyNumber).toBeNull();
  });
});

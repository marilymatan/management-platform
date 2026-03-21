import { describe, expect, it, vi } from "vitest";

vi.mock("./encryption", () => ({
  encryptField: vi.fn((value: string) => value),
  decryptField: vi.fn((value: string) => value),
  encryptJson: vi.fn((value: unknown) => `enc:${JSON.stringify(value)}`),
  decryptJson: vi.fn((value: string) => {
    if (value.startsWith("enc:")) {
      return JSON.parse(value.slice(4));
    }
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }),
}));

import { decodeAnalysisJsonCompat, normalizeAnalysisFiles, serializeAnalysisJsonCompat } from "./db";

describe("normalizeAnalysisFiles", () => {
  it("keeps only the metadata needed for storage and analysis", () => {
    const normalized = normalizeAnalysisFiles([
      {
        name: "  פוליסה משפחתית.pdf  ",
        size: 4096.9,
        fileKey: "  policies/session-1/policy.pdf  ",
        url: "   ",
        mimeType: " application/pdf ",
        base64: "this-should-not-be-persisted",
        extra: "ignored",
      } as any,
    ]);

    expect(normalized).toEqual([
      {
        name: "פוליסה משפחתית.pdf",
        size: 4096,
        fileKey: "policies/session-1/policy.pdf",
        mimeType: "application/pdf",
      },
    ]);
    expect(Object.keys(normalized[0])).not.toContain("base64");
    expect(Object.keys(normalized[0])).not.toContain("extra");
  });

  it("returns an empty array for empty input", () => {
    expect(normalizeAnalysisFiles([])).toEqual([]);
  });
});

describe("analysis JSON compatibility helpers", () => {
  it("stores encrypted payloads inside valid JSON envelopes", () => {
    const serialized = serializeAnalysisJsonCompat([{ name: "policy.pdf", size: 1024 }]);
    const parsed = JSON.parse(serialized);

    expect(parsed).toMatchObject({
      __encrypted: true,
    });
    expect(typeof parsed.ciphertext).toBe("string");
    expect(parsed.ciphertext).toMatch(/^enc:/);
  });

  it("decodes wrapped encrypted JSON data", () => {
    const original = [{ name: "policy.pdf", size: 1024 }];
    const serialized = serializeAnalysisJsonCompat(original);

    expect(decodeAnalysisJsonCompat(serialized)).toEqual(original);
  });

  it("keeps support for legacy plain JSON rows", () => {
    const legacy = JSON.stringify([{ name: "legacy.pdf", size: 512 }]);

    expect(decodeAnalysisJsonCompat(legacy)).toEqual([{ name: "legacy.pdf", size: 512 }]);
  });
});

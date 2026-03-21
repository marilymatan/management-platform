import { describe, expect, it, vi } from "vitest";
import { analyses, chatMessages, documentClassifications } from "../drizzle/schema";
import { deleteAnalysisArtifacts, getAnalysisFileKeys } from "./analysisCleanup";

describe("analysisCleanup", () => {
  it("collects unique stored file keys from an analysis", () => {
    expect(
      getAnalysisFileKeys([
        { fileKey: "policies/session-1/a.pdf" },
        { fileKey: "policies/session-1/b.pdf" },
        { fileKey: "policies/session-1/a.pdf" },
        { fileKey: "   " },
        "legacy-file-name.pdf",
      ])
    ).toEqual(["policies/session-1/a.pdf", "policies/session-1/b.pdf"]);
  });

  it("returns an empty list when there are no stored file references", () => {
    expect(getAnalysisFileKeys(undefined)).toEqual([]);
    expect(getAnalysisFileKeys([{ fileKey: null }, { fileKey: "   " }])).toEqual([]);
  });

  it("deletes stored files and linked analysis records", async () => {
    const deleteStoredFile = vi.fn().mockResolvedValue(undefined);
    const where = vi.fn().mockResolvedValue(undefined);
    const db = {
      delete: vi.fn().mockImplementation(() => ({
        where,
      })),
    } as any;

    await deleteAnalysisArtifacts({
      db,
      sessionId: "session-1",
      userId: 7,
      files: [
        { fileKey: "policies/session-1/a.pdf" },
        { fileKey: "policies/session-1/b.pdf" },
      ],
      deleteStoredFile,
    });

    expect(deleteStoredFile).toHaveBeenCalledTimes(2);
    expect(deleteStoredFile).toHaveBeenNthCalledWith(1, "policies/session-1/a.pdf");
    expect(deleteStoredFile).toHaveBeenNthCalledWith(2, "policies/session-1/b.pdf");
    expect(db.delete).toHaveBeenCalledTimes(3);
    expect(db.delete).toHaveBeenNthCalledWith(1, chatMessages);
    expect(db.delete).toHaveBeenNthCalledWith(2, documentClassifications);
    expect(db.delete).toHaveBeenNthCalledWith(3, analyses);
    expect(where).toHaveBeenCalledTimes(3);
  });
});

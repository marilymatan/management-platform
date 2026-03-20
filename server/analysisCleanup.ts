import { and, eq } from "drizzle-orm";
import { analyses, chatMessages, documentClassifications } from "../drizzle/schema";
import type { getDb } from "./db";

type AnalysisCleanupFile = string | { fileKey?: string | null };

type DeleteCapableDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function getAnalysisFileKeys(files: AnalysisCleanupFile[] | null | undefined) {
  return Array.from(
    new Set(
      (files ?? []).flatMap((file) => {
        if (typeof file === "string") {
          return [];
        }
        const fileKey = file.fileKey?.trim();
        return fileKey ? [fileKey] : [];
      })
    )
  );
}

export async function deleteAnalysisArtifacts(params: {
  db: DeleteCapableDb;
  sessionId: string;
  userId: number;
  files: AnalysisCleanupFile[] | null | undefined;
  deleteStoredFile: (fileKey: string) => Promise<void>;
}) {
  const fileKeys = getAnalysisFileKeys(params.files);

  await Promise.all(fileKeys.map((fileKey) => params.deleteStoredFile(fileKey)));
  await params.db.delete(chatMessages).where(eq(chatMessages.sessionId, params.sessionId));
  await params.db
    .delete(documentClassifications)
    .where(
      and(
        eq(documentClassifications.userId, params.userId),
        eq(documentClassifications.sourceType, "analysis_file"),
        eq(documentClassifications.sourceId, params.sessionId)
      )
    );
  await params.db.delete(analyses).where(eq(analyses.sessionId, params.sessionId));
}

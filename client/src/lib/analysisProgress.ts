import {
  POLICY_ANALYSIS_BATCH_SIZE,
  getAnalysisProgressSnapshot,
  type AnalysisProgressLike,
} from "@shared/analysisProgress";

export type InFlightAnalysisLike = AnalysisProgressLike & {
  sessionId: string;
};

export type AnalysisQueueSummary = {
  inFlightCount: number;
  processingCount: number;
  pendingCount: number;
  totalFiles: number;
  visibleFiles: number;
  progressPercent: number;
  firstSessionId: string | null;
  batchSize: number;
};

export function summarizeAnalysisQueue(analyses: InFlightAnalysisLike[]): AnalysisQueueSummary | null {
  if (!analyses.length) {
    return null;
  }

  const snapshots = analyses
    .map((analysis) => ({
      analysis,
      snapshot: getAnalysisProgressSnapshot(analysis),
    }))
    .filter((entry): entry is { analysis: InFlightAnalysisLike; snapshot: NonNullable<ReturnType<typeof getAnalysisProgressSnapshot>> } => Boolean(entry.snapshot));

  const totalFiles = snapshots.reduce((sum, entry) => sum + entry.snapshot.totalFiles, 0);
  const visibleFiles = snapshots.reduce((sum, entry) => sum + entry.snapshot.visibleFileCount, 0);

  return {
    inFlightCount: analyses.length,
    processingCount: analyses.filter((analysis) => analysis.status === "processing").length,
    pendingCount: analyses.filter((analysis) => analysis.status === "pending").length,
    totalFiles,
    visibleFiles,
    progressPercent: totalFiles > 0 ? (visibleFiles / totalFiles) * 100 : 0,
    firstSessionId: analyses[0]?.sessionId ?? null,
    batchSize: POLICY_ANALYSIS_BATCH_SIZE,
  };
}

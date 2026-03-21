export const POLICY_ANALYSIS_BATCH_SIZE = 3;

export type AnalysisProgressLike = {
  status?: string | null;
  files?: Array<unknown> | null;
  processedFileCount?: number | null;
  activeBatchFileCount?: number | null;
};

export type AnalysisProgressSnapshot = {
  totalFiles: number;
  processedFileCount: number;
  activeBatchFileCount: number;
  visibleFileCount: number;
  progressPercent: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getAnalysisProgressSnapshot(analysis: AnalysisProgressLike): AnalysisProgressSnapshot | null {
  const totalFiles = Array.isArray(analysis.files) ? analysis.files.length : 0;
  if (totalFiles <= 0) {
    return null;
  }

  const processedFileCount = clamp(Math.floor(analysis.processedFileCount ?? 0), 0, totalFiles);
  const remainingFiles = Math.max(0, totalFiles - processedFileCount);
  const fallbackBatchSize = analysis.status === "processing"
    ? Math.min(remainingFiles, POLICY_ANALYSIS_BATCH_SIZE)
    : 0;
  const activeBatchFileCount = clamp(
    Math.floor(analysis.activeBatchFileCount ?? fallbackBatchSize),
    0,
    remainingFiles,
  );

  let visibleFileCount = processedFileCount;
  if (analysis.status === "completed") {
    visibleFileCount = totalFiles;
  } else if (analysis.status === "processing") {
    visibleFileCount = Math.min(totalFiles, processedFileCount + activeBatchFileCount);
  }

  return {
    totalFiles,
    processedFileCount,
    activeBatchFileCount,
    visibleFileCount,
    progressPercent: totalFiles > 0 ? (visibleFileCount / totalFiles) * 100 : 0,
  };
}

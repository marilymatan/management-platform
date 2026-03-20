import type { InsuranceCategory } from "@shared/insurance";

type AnalysisCoverageLike = {
  category?: string | null;
  sourceFile?: string | null;
};

function getUniqueSourceFiles(coverages: AnalysisCoverageLike[] | undefined) {
  return Array.from(
    new Set(
      (coverages ?? [])
        .map((coverage) => coverage.sourceFile?.trim())
        .filter((sourceFile): sourceFile is string => Boolean(sourceFile))
    )
  );
}

export function getAnalysisCoveragePreset(category: InsuranceCategory | null | undefined) {
  return category === "car" ? "רכב" : null;
}

export function pickAnalysisViewFileFilter(params: {
  preferredPolicyName?: string | null;
  coverages?: AnalysisCoverageLike[];
  insuranceCategory?: InsuranceCategory | null;
}) {
  const availableSourceFiles = getUniqueSourceFiles(params.coverages);
  const preferredPolicyName = params.preferredPolicyName?.trim();

  if (preferredPolicyName && availableSourceFiles.includes(preferredPolicyName)) {
    return preferredPolicyName;
  }

  const coveragePreset = getAnalysisCoveragePreset(params.insuranceCategory);
  if (coveragePreset) {
    const presetSourceFiles = Array.from(
      new Set(
        (params.coverages ?? [])
          .filter((coverage) => coverage.category === coveragePreset)
          .map((coverage) => coverage.sourceFile?.trim())
          .filter((sourceFile): sourceFile is string => Boolean(sourceFile))
      )
    );

    if (presetSourceFiles.length === 1) {
      return presetSourceFiles[0];
    }
  }

  if (availableSourceFiles.length === 1) {
    return availableSourceFiles[0];
  }

  return null;
}

export function buildAnalysisViewUrl(params: {
  sessionId: string;
  preferredPolicyName?: string | null;
  coverages?: AnalysisCoverageLike[];
  insuranceCategory?: InsuranceCategory | null;
}) {
  const searchParams = new URLSearchParams();
  const fileFilter = pickAnalysisViewFileFilter(params);
  const coveragePreset = getAnalysisCoveragePreset(params.insuranceCategory);

  if (fileFilter) {
    searchParams.set("file", fileFilter);
  }

  if (coveragePreset) {
    searchParams.set("coverageCategory", coveragePreset);
  }

  const query = searchParams.toString();
  return query ? `/insurance/${params.sessionId}?${query}` : `/insurance/${params.sessionId}`;
}

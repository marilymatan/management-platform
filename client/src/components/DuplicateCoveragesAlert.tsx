import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Files,
  FileText,
  Layers3,
  Lightbulb,
  ScanSearch,
} from "lucide-react";
import type {
  CoverageOverlapGroup,
  InsurancePolicy,
  PolicyOverlapGroup,
} from "@shared/insurance";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface DuplicateCoveragesAlertProps {
  coverageOverlaps: CoverageOverlapGroup[];
  policyOverlaps: PolicyOverlapGroup[];
  policies: InsurancePolicy[];
}

function CoverageOverlapItem({
  group,
  policies,
}: {
  group: CoverageOverlapGroup;
  policies: InsurancePolicy[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const policyById = useMemo(
    () => new Map(policies.map((policy) => [policy.id, policy])),
    [policies],
  );
  const coverageById = useMemo(
    () =>
      new Map(
        policies.flatMap((policy) =>
          policy.coverages.map((coverage) => [coverage.id, coverage] as const),
        ),
      ),
    [policies],
  );

  return (
    <div
      className="rounded-xl border border-amber-200/80 bg-amber-50/60 overflow-hidden"
      data-testid={`coverage-overlap-item-${group.id}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-amber-100/50 transition-colors"
        dir="rtl"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Layers3 className="size-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-amber-950 truncate">
            {group.title}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] h-5 border-amber-300 text-amber-700 bg-amber-100/60 shrink-0"
          >
            {group.coverageRefs.length} כיסויים
          </Badge>
        </div>
        {isOpen ? (
          <ChevronUp className="size-4 text-amber-500 shrink-0" />
        ) : (
          <ChevronDown className="size-4 text-amber-500 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3" dir="rtl">
          <Separator className="bg-amber-200/70" />

          <p className="text-sm text-amber-950/80 leading-relaxed">
            {group.explanation}
          </p>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {group.coverageRefs.map((ref) => {
              const policy = policyById.get(ref.policyId);
              const coverage = coverageById.get(ref.coverageId);
              if (!policy || !coverage) {
                return null;
              }
              const matchedClauseIds = group.matchedClauseIdsByCoverage[ref.coverageId] ?? [];
              const matchedClauses = coverage.clauses.filter((clause) =>
                matchedClauseIds.includes(clause.id),
              );

              return (
                <div
                  key={`${ref.policyId}-${ref.coverageId}`}
                  className="rounded-lg bg-white/80 border border-amber-200/60 p-3 text-right"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                      {policy.generalInfo.policyName}
                    </Badge>
                    {coverage.sourceFile ? (
                      <Badge variant="outline" className="gap-1">
                        <FileText className="size-3" />
                        {coverage.sourceFile}
                      </Badge>
                    ) : null}
                  </div>

                  <p className="text-sm font-semibold text-foreground mt-2">
                    {coverage.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {coverage.summary}
                  </p>

                  <div className="mt-3 space-y-2">
                    <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1">
                      <ScanSearch className="size-3.5" />
                      סעיפים תומכים
                    </p>
                    {matchedClauses.length > 0 ? (
                      matchedClauses.map((clause) => (
                        <div
                          key={clause.id}
                          className="rounded-md border border-amber-100 bg-amber-50/70 px-2.5 py-2"
                        >
                          <p className="text-[11px] font-medium text-foreground">
                            {clause.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            {clause.text}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        לא נמצאו סעיפי ראיה מפורשים לחפיפה הזאת.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-blue-50/80 border border-blue-200/60 p-3">
            <Lightbulb className="size-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">
              {group.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyOverlapItem({ group, policies }: { group: PolicyOverlapGroup; policies: InsurancePolicy[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const policyNames = group.policyIds
    .map((policyId) => policies.find((policy) => policy.id === policyId)?.generalInfo.policyName)
    .filter(Boolean) as string[];

  return (
    <div
      className="rounded-xl border border-blue-200/80 bg-blue-50/70 overflow-hidden"
      data-testid={`policy-overlap-item-${group.id}`}
    >
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-blue-100/50 transition-colors"
        dir="rtl"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Files className="size-4 text-blue-600 shrink-0" />
          <span className="text-sm font-semibold text-blue-950 truncate">
            פוליסה שנראית חופפת ברובה
          </span>
          <Badge
            variant="outline"
            className="text-[10px] h-5 border-blue-300 text-blue-700 bg-blue-100/60 shrink-0"
          >
            {Math.round(group.overlapRatio * 100)}%
          </Badge>
        </div>
        {isOpen ? (
          <ChevronUp className="size-4 text-blue-500 shrink-0" />
        ) : (
          <ChevronDown className="size-4 text-blue-500 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-3" dir="rtl">
          <Separator className="bg-blue-200/70" />
          <div className="flex flex-wrap gap-1.5">
            {policyNames.map((name) => (
              <Badge key={name} variant="secondary" className="bg-white/80">
                {name}
              </Badge>
            ))}
          </div>
          <p className="text-sm text-blue-950/80 leading-relaxed">
            {group.explanation}
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-white/80 border border-blue-200/60 p-3">
            <Lightbulb className="size-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">
              {group.recommendation}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function DuplicateCoveragesAlert({
  coverageOverlaps,
  policyOverlaps,
  policies,
}: DuplicateCoveragesAlertProps) {
  if (coverageOverlaps.length === 0 && policyOverlaps.length === 0) {
    return null;
  }

  return (
    <Card
      className="border-amber-300/60 bg-gradient-to-bl from-amber-50/85 via-white to-blue-50/55 animate-fade-in-up"
      data-testid="coverage-overlap-panel"
    >
      <CardContent className="pt-5 pb-5 space-y-5">
        <div className="flex items-center gap-2.5" dir="rtl">
          <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="size-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-950">
              חפיפות שדורשות בדיקה
            </h3>
            <p className="text-xs text-amber-800/80 mt-0.5">
              הסעיפים כאן הם ראיות לחפיפה. ההחלטה בפועל היא תמיד ברמת הכיסוי או הפוליסה.
            </p>
          </div>
          <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-xs shrink-0">
            {coverageOverlaps.length + policyOverlaps.length}
          </Badge>
        </div>

        {coverageOverlaps.length > 0 ? (
          <section className="space-y-2.5" dir="rtl">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold text-foreground">
                חפיפות בין כיסויים
              </h4>
              <Badge variant="outline">{coverageOverlaps.length}</Badge>
            </div>
            {coverageOverlaps.map((group) => (
              <CoverageOverlapItem key={group.id} group={group} policies={policies} />
            ))}
          </section>
        ) : null}

        {policyOverlaps.length > 0 ? (
          <section className="space-y-2.5" dir="rtl">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold text-foreground">
                פוליסה שנראית חופפת ברובה
              </h4>
              <Badge variant="outline">{policyOverlaps.length}</Badge>
            </div>
            {policyOverlaps.map((group) => (
              <PolicyOverlapItem key={group.id} group={group} policies={policies} />
            ))}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

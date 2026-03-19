import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Lightbulb,
} from "lucide-react";
import type { DuplicateCoverageGroup, Coverage } from "@shared/insurance";

interface DuplicateCoveragesAlertProps {
  duplicates: DuplicateCoverageGroup[];
  coverages: Coverage[];
}

function DuplicateGroupItem({
  group,
  coverages,
}: {
  group: DuplicateCoverageGroup;
  coverages: Coverage[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const matchedCoverages = coverages.filter((c) =>
    group.coverageIds.includes(c.id)
  );

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-3 p-4 text-right hover:bg-amber-100/40 transition-colors"
        dir="rtl"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Copy className="size-4 text-amber-600 shrink-0" />
          <span className="text-sm font-semibold text-amber-900 truncate">
            {group.title}
          </span>
          <Badge
            variant="outline"
            className="text-[10px] h-5 border-amber-300 text-amber-700 bg-amber-100/60 shrink-0"
          >
            {group.coverageIds.length} כיסויים
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
          <Separator className="bg-amber-200/60" />

          <div className="flex flex-wrap gap-1.5">
            {group.sourceFiles.map((file) => (
              <Badge
                key={file}
                variant="secondary"
                className="text-[11px] gap-1 bg-white/80 border border-amber-200/60"
              >
                <FileText className="size-3" />
                {file}
              </Badge>
            ))}
          </div>

          <p className="text-sm text-amber-900/80 leading-relaxed">
            {group.explanation}
          </p>

          {matchedCoverages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {matchedCoverages.map((cov) => (
                <div
                  key={cov.id}
                  className="rounded-lg bg-white/70 border border-amber-200/50 p-3 text-right"
                >
                  <p className="text-xs font-semibold text-foreground mb-1">
                    {cov.title}
                  </p>
                  <p className="text-[11px] text-primary font-medium">
                    {cov.limit}
                  </p>
                  {cov.copay && cov.copay !== "לא מצוין בפוליסה" && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      השתתפות עצמית: {cov.copay}
                    </p>
                  )}
                  {cov.sourceFile && (
                    <p className="text-[10px] text-muted-foreground/70 mt-1">
                      {cov.sourceFile}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-lg bg-blue-50/80 border border-blue-200/50 p-3">
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
  duplicates,
  coverages,
}: DuplicateCoveragesAlertProps) {
  if (!duplicates || duplicates.length === 0) return null;

  return (
    <Card className="border-amber-300/60 bg-gradient-to-bl from-amber-50/80 to-orange-50/40 animate-fade-in-up">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2.5 mb-4" dir="rtl">
          <div className="size-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="size-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-900">
              נמצאו כיסויים כפולים
            </h3>
            <p className="text-xs text-amber-700/70 mt-0.5">
              זיהינו {duplicates.length} {duplicates.length === 1 ? "כיסוי שמופיע" : "כיסויים שמופיעים"} יותר מפעם אחת בפוליסות שלך
            </p>
          </div>
          <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-xs shrink-0">
            {duplicates.length}
          </Badge>
        </div>

        <div className="space-y-2.5">
          {duplicates.map((group) => (
            <DuplicateGroupItem
              key={group.id}
              group={group}
              coverages={coverages}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

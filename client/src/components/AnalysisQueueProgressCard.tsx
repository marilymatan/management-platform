import { Clock3, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { summarizeAnalysisQueue, type InFlightAnalysisLike } from "@/lib/analysisProgress";
import { cn } from "@/lib/utils";

interface AnalysisQueueProgressCardProps {
  analyses: InFlightAnalysisLike[];
  onOpenStatus?: () => void;
  actionLabel?: string;
  className?: string;
}

export function AnalysisQueueProgressCard({
  analyses,
  onOpenStatus,
  actionLabel = "פתח סטטוס",
  className,
}: AnalysisQueueProgressCardProps) {
  const summary = summarizeAnalysisQueue(analyses);
  if (!summary) {
    return null;
  }

  const progressLabel = summary.totalFiles > 0
    ? `${summary.visibleFiles}/${summary.totalFiles}`
    : `${summary.inFlightCount}`;
  const subtitle = summary.processingCount > 0
    ? `לומי סורק בקבוצות של עד ${summary.batchSize} קבצים. אפשר להמשיך לעבוד כרגיל והתוצאות יתעדכנו אוטומטית.`
    : "הקבצים נשמרו וממתינים להתחלת עיבוד. התוצאות יופיעו כאן אוטומטית ברגע שהסריקה תתחיל ותסתיים.";
  const queueLabel = summary.inFlightCount === 1 ? "סריקה אחת ברקע" : `${summary.inFlightCount} סריקות ברקע`;

  return (
    <Card className={cn("border-primary/20 bg-primary/5 animate-fade-in-up", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-medium text-primary">
                  <Layers3 className="size-3.5" />
                  {queueLabel}
                </div>
                <p className="text-sm font-semibold text-foreground">התקדמות עיבוד הקבצים</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{subtitle}</p>
              </div>

              <div className="rounded-xl border border-primary/15 bg-background/80 px-4 py-3 text-center min-w-[110px]">
                <p className="text-[11px] text-muted-foreground">כעת</p>
                <p className="text-2xl font-bold tracking-tight text-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {progressLabel}
                </p>
              </div>
            </div>

            {summary.totalFiles > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="size-3.5" />
                    {summary.processingCount > 0 ? "התקדמות הסריקה הפעילה" : "הסריקות ממתינות להתחלה"}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.round(summary.progressPercent)}%</span>
                </div>
                <Progress
                  value={summary.progressPercent}
                  aria-label={`התקדמות סריקות ברקע ${Math.round(summary.progressPercent)} אחוז`}
                />
              </div>
            )}
          </div>

          {onOpenStatus ? (
            <Button
              variant="outline"
              onClick={onOpenStatus}
              className="shrink-0"
            >
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

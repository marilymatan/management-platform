import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import type {
  InsuranceCategoryLlmSummary,
  InsuranceSummaryTone,
} from "@shared/insurance";

const toneConfig: Record<
  InsuranceSummaryTone,
  {
    icon: typeof AlertTriangle;
    className: string;
    iconClassName: string;
    label: string;
  }
> = {
  warning: {
    icon: AlertTriangle,
    className: "border-amber-200/70 bg-amber-50/70",
    iconClassName: "bg-amber-100 text-amber-700",
    label: "דורש תשומת לב",
  },
  info: {
    icon: Sparkles,
    className: "border-blue-200/70 bg-blue-50/70",
    iconClassName: "bg-blue-100 text-blue-700",
    label: "מבט חשוב",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-200/70 bg-emerald-50/70",
    iconClassName: "bg-emerald-100 text-emerald-700",
    label: "כיסוי טוב",
  },
};

interface InsuranceCategoryLlmSummaryProps {
  summary: InsuranceCategoryLlmSummary;
  categoryLabel: string;
  policyCount: number;
  pdfCount: number;
  premiumLabel: string;
}

export function InsuranceCategoryLlmSummary({
  summary,
  categoryLabel,
  policyCount,
  pdfCount,
  premiumLabel,
}: InsuranceCategoryLlmSummaryProps) {
  return (
    <Card
      className="overflow-hidden border-primary/15 bg-gradient-to-bl from-primary/5 via-card to-card animate-fade-in-up stagger-2"
      data-testid="category-llm-summary"
    >
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold">סיכום חכם לכל {categoryLabel}</h3>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="size-3.5" />
                    הופק עכשיו
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  מבט מאוחד על כל הסקירות שנמצאו בקטגוריה הזאת
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-foreground/90">
              {summary.overview}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline">{policyCount} פוליסות</Badge>
            <Badge variant="outline">{pdfCount} קבצי PDF</Badge>
            <Badge variant="outline">{premiumLabel}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summary.highlights.map((highlight) => {
            const config = toneConfig[highlight.tone];
            const Icon = config.icon;

            return (
              <div
                key={highlight.id}
                className={`rounded-2xl border p-4 space-y-3 ${config.className}`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`size-9 rounded-xl flex items-center justify-center ${config.iconClassName}`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{highlight.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {config.label}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {highlight.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/60 bg-background/70 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              <h4 className="text-sm font-semibold">מה כדאי לעשות עכשיו</h4>
            </div>
            <div className="space-y-2">
              {summary.recommendedActions.map((action, index) => (
                <div
                  key={`${action}-${index}`}
                  className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2 text-sm text-muted-foreground"
                >
                  {action}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-background/70 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-primary" />
              <h4 className="text-sm font-semibold">שאלות המשך טובות</h4>
            </div>
            <div className="space-y-2">
              {summary.recommendedQuestions.map((question, index) => (
                <div
                  key={`${question}-${index}`}
                  className="rounded-xl border border-border/50 bg-muted/15 px-3 py-2 text-sm text-muted-foreground"
                >
                  {question}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function InsuranceCategoryLlmSummarySkeleton() {
  return (
    <Card
      className="overflow-hidden border-primary/15 bg-gradient-to-bl from-primary/5 via-card to-card animate-fade-in-up stagger-2"
      data-testid="category-llm-summary-loading"
    >
      <CardContent className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3 flex-1">
            <div className="h-6 w-56 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-full max-w-3xl rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-4/5 max-w-2xl rounded-lg bg-muted animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-6 w-24 rounded-full bg-muted animate-pulse" />
            <div className="h-6 w-24 rounded-full bg-muted animate-pulse" />
            <div className="h-6 w-24 rounded-full bg-muted animate-pulse" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-border/60 bg-background/70 p-4 space-y-3"
            >
              <div className="h-5 w-3/5 rounded-lg bg-muted animate-pulse" />
              <div className="h-4 w-full rounded-lg bg-muted animate-pulse" />
              <div className="h-4 w-4/5 rounded-lg bg-muted animate-pulse" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-border/60 bg-background/70 p-5 space-y-3"
            >
              <div className="h-5 w-36 rounded-lg bg-muted animate-pulse" />
              <div className="h-10 w-full rounded-xl bg-muted animate-pulse" />
              <div className="h-10 w-full rounded-xl bg-muted animate-pulse" />
              <div className="h-10 w-4/5 rounded-xl bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

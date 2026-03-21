import { useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AnalysisQueueProgressCard } from "@/components/AnalysisQueueProgressCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Shield,
  Plus,
  Heart,
  Car,
  Home,
  User,
  ArrowLeft,
  CircleAlert,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Wallet,
  Layers3,
  type LucideIcon,
} from "lucide-react";
import type { InsuranceCategory } from "@shared/insurance";
import {
  buildInsuranceOverview,
  formatInsuranceCurrency,
  insuranceCategoryLabels,
  type InsuranceHubCategorySummary,
} from "@/lib/insuranceOverview";

const CATEGORY_CONFIG: Record<
  InsuranceCategory,
  {
    label: string;
    icon: LucideIcon;
    accentText: string;
    accentSurface: string;
    accentBorder: string;
    accentMuted: string;
  }
> = {
  health: {
    label: insuranceCategoryLabels.health,
    icon: Heart,
    accentText: "text-chart-5",
    accentSurface: "bg-chart-5/10",
    accentBorder: "border-chart-5/20",
    accentMuted: "bg-chart-5/5",
  },
  life: {
    label: insuranceCategoryLabels.life,
    icon: User,
    accentText: "text-chart-1",
    accentSurface: "bg-chart-1/10",
    accentBorder: "border-chart-1/20",
    accentMuted: "bg-chart-1/5",
  },
  car: {
    label: insuranceCategoryLabels.car,
    icon: Car,
    accentText: "text-chart-4",
    accentSurface: "bg-chart-4/10",
    accentBorder: "border-chart-4/20",
    accentMuted: "bg-chart-4/5",
  },
  home: {
    label: insuranceCategoryLabels.home,
    icon: Home,
    accentText: "text-chart-3",
    accentSurface: "bg-chart-3/10",
    accentBorder: "border-chart-3/20",
    accentMuted: "bg-chart-3/5",
  },
};

const CATEGORIES: InsuranceCategory[] = ["health", "life", "car", "home"];

function getCategoryStatus(summary: InsuranceHubCategorySummary) {
  if (summary.hasData) {
    return {
      label: "יש פוליסות",
      variant: "secondary" as const,
    };
  }

  if (summary.relevant) {
    return {
      label: "כדאי להשלים",
      variant: "default" as const,
    };
  }

  return {
    label: "לא דחוף כרגע",
    variant: "outline" as const,
  };
}

function getCategorySummaryText(summary: InsuranceHubCategorySummary) {
  if (summary.hasData) {
    if (summary.nextRenewalDays !== null) {
      return `החידוש הקרוב בעוד ${summary.nextRenewalDays} ימים.`;
    }

    if (summary.monthlyPremium > 0) {
      return `פרמיה חודשית כוללת ${formatInsuranceCurrency(summary.monthlyPremium)}.`;
    }

    return summary.scans === 1
      ? "פוליסה פעילה אחת בקטגוריה הזו."
      : `${summary.scans} פוליסות פעילות בקטגוריה הזו.`;
  }

  if (summary.relevant) {
    return "עדיין אין פוליסה מזוהה בקטגוריה הזו.";
  }

  return "הקטגוריה זמינה כאן להשלמה בהמשך אם תצטרך.";
}

export default function Insurance() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const clearInFlightQueue = trpc.policy.clearInFlightQueue.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.deletedCount > 0
          ? `נמחקו ${data.deletedCount} סריקות מהתור`
          : "לא היו סריקות ממתינות בתור",
      );
      void utils.policy.getUserAnalyses.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "לא ניתן לנקות את התור");
    },
  });
  const profileQuery = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });

  const overview = useMemo(
    () => buildInsuranceOverview(analyses as any[] | undefined, profileQuery.data),
    [analyses, profileQuery.data]
  );
  const inFlightAnalyses = analyses?.filter(
    (analysis) => analysis.status === "pending" || analysis.status === "processing"
  ) ?? [];
  const categoriesWithData = useMemo(
    () => CATEGORIES.filter((category) => overview.categorySummaries[category].hasData),
    [overview.categorySummaries]
  );
  const relevantMissingCategories = useMemo(
    () =>
      CATEGORIES.filter((category) => {
        const summary = overview.categorySummaries[category];
        return summary.relevant && !summary.hasData;
      }),
    [overview.categorySummaries]
  );

  if (!user) {
    return null;
  }

  const nextRenewalDays = overview.renewals[0]?.daysUntilRenewal ?? null;
  const overviewText =
    overview.totalPolicies === 1
      ? `זוהתה כרגע פוליסה אחת בקטגוריה אחת${overview.totalMonthlyPremium > 0 ? `, עם פרמיה חודשית כוללת של ${formatInsuranceCurrency(overview.totalMonthlyPremium)}` : ""}.`
      : `זוהו כרגע ${overview.totalPolicies} פוליסות ב-${categoriesWithData.length} קטגוריות${overview.totalMonthlyPremium > 0 ? `, עם פרמיה חודשית כוללת של ${formatInsuranceCurrency(overview.totalMonthlyPremium)}` : ""}.`;
  const overviewCards: Array<{
    key: string;
    label: string;
    value: string;
    detail: string;
    icon: LucideIcon;
  }> = [
    {
      key: "policies",
      label: "פוליסות פעילות",
      value: `${overview.totalPolicies}`,
      detail:
        categoriesWithData.length === 1
          ? "קטגוריה אחת עם מידע"
          : `${categoriesWithData.length} קטגוריות עם מידע`,
      icon: ShieldCheck,
    },
    {
      key: "premium",
      label: "פרמיה חודשית כוללת",
      value: overview.totalMonthlyPremium > 0 ? formatInsuranceCurrency(overview.totalMonthlyPremium) : "—",
      detail:
        overview.duplicateGroups > 0
          ? `${overview.duplicateGroups} קבוצות של כפילויות זוהו`
          : "לא זוהו כרגע כפילויות בולטות",
      icon: Wallet,
    },
    {
      key: "categories",
      label: "קטגוריות עם מידע",
      value: `${categoriesWithData.length}/${CATEGORIES.length}`,
      detail:
        relevantMissingCategories.length > 0
          ? relevantMissingCategories.length === 1
            ? "יש קטגוריה רלוונטית אחת שחסרה"
            : `${relevantMissingCategories.length} קטגוריות רלוונטיות עדיין חסרות`
          : "כל הקטגוריות הרלוונטיות כבר מופיעות",
      icon: Layers3,
    },
    {
      key: "renewals",
      label: "חידושים ב-90 יום",
      value: `${overview.renewals.length}`,
      detail:
        nextRenewalDays !== null
          ? `החידוש הקרוב ביותר בעוד ${nextRenewalDays} ימים`
          : "אין כרגע חידושים קרובים",
      icon: Clock3,
    },
  ];
  const attentionItems = [
    overview.renewals.length > 0
      ? {
          id: "renewals",
          title: "חידושים מתקרבים",
          description:
            nextRenewalDays !== null
              ? `${overview.renewals.length} פוליסות מגיעות לחידוש ב-90 הימים הקרובים. הקרובה ביותר בעוד ${nextRenewalDays} ימים.`
              : `${overview.renewals.length} פוליסות מגיעות לחידוש ב-90 הימים הקרובים.`,
        }
      : null,
    overview.duplicateGroups > 0
      ? {
          id: "duplicates",
          title: "כפילויות שכדאי לבדוק",
          description: `זוהו ${overview.duplicateGroups} קבוצות של כיסויים כפולים בין הפוליסות.`,
        }
      : null,
    relevantMissingCategories.length > 0
      ? {
          id: "missing-categories",
          title: "קטגוריות שחסר להשלים",
          description: `עדיין חסר מידע ב${relevantMissingCategories.map((category) => insuranceCategoryLabels[category]).join(", ")}.`,
        }
      : null,
  ].filter((item): item is { id: string; title: string; description: string } => item !== null);

  return (
    <div className="page-container space-y-6" data-testid="insurance-page" aria-busy={isLoading}>
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Shield className="size-4" aria-hidden="true" />
              תיק הביטוחים
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">חלוקה ברורה של הפוליסות במקום אחד</h1>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                המסך הזה מתמקד במה שחשוב באמת: חלוקת הפוליסות בין הקטגוריות והמידע האגרגטיבי של כל התיק.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              data-testid="new-scan-button"
              onClick={() => setLocation("/insurance/new")}
              size="lg"
              className="gap-2"
            >
              <Plus className="size-4" aria-hidden="true" />
              סריקה חדשה
            </Button>
            <Button variant="outline" onClick={() => setLocation("/assistant")} className="gap-2">
              <MessageSquare className="size-4" aria-hidden="true" />
              שאל את לומי
            </Button>
          </div>
        </div>
      </header>

      {inFlightAnalyses.length > 0 && (
        <AnalysisQueueProgressCard
          analyses={inFlightAnalyses}
          onOpenStatus={() => setLocation(`/insurance/${inFlightAnalyses[0].sessionId}`)}
          onClearQueue={() => clearInFlightQueue.mutate()}
          clearQueuePending={clearInFlightQueue.isPending}
        />
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="animate-pulse rounded-2xl border border-border bg-card p-6">
            <div className="space-y-3">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-7 w-60 rounded bg-muted" />
              <div className="h-4 w-full max-w-2xl rounded bg-muted" />
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-background p-4">
                  <div className="h-4 w-20 rounded bg-muted" />
                  <div className="mt-3 h-8 w-28 rounded bg-muted" />
                  <div className="mt-3 h-4 w-full rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="animate-pulse rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start gap-3">
                  <div className="size-11 rounded-2xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-32 rounded bg-muted" />
                    <div className="h-4 w-full rounded bg-muted" />
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[1, 2, 3, 4].map((metric) => (
                    <div key={metric} className="rounded-xl border border-border bg-background p-3">
                      <div className="h-3 w-14 rounded bg-muted" />
                      <div className="mt-2 h-5 w-16 rounded bg-muted" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : overview.totalPolicies > 0 ? (
        <>
          <section aria-labelledby="insurance-overview-heading">
            <Card data-testid="insurance-overview-card" className="border-border/60">
              <CardContent className="p-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    תמונת מצב מרוכזת
                  </div>
                  <div className="space-y-1">
                    <h2 id="insurance-overview-heading" className="text-xl font-semibold tracking-tight">
                      מה יש כרגע בתיק
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">{overviewText}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {overviewCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div key={card.key} className="rounded-2xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                            <p className="text-2xl font-bold tracking-tight [font-variant-numeric:tabular-nums]">
                              {card.value}
                            </p>
                          </div>
                          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <Icon className="size-5" aria-hidden="true" />
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.detail}</p>
                      </div>
                    );
                  })}
                </div>

                <Separator />

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">קטגוריות שכבר מזוהות</h3>
                    {categoriesWithData.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {categoriesWithData.map((category) => (
                          <Badge key={category} variant="secondary" className="rounded-full">
                            {insuranceCategoryLabels[category]}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        עדיין לא זוהתה קטגוריה עם פוליסות פעילות.
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">קטגוריות שכדאי להשלים</h3>
                    {relevantMissingCategories.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {relevantMissingCategories.map((category) => (
                          <Badge key={category} className="rounded-full">
                            {insuranceCategoryLabels[category]}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        כל הקטגוריות הרלוונטיות כבר מופיעות בתיק.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="space-y-4" aria-labelledby="insurance-categories-heading">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <h2 id="insurance-categories-heading" className="text-xl font-semibold tracking-tight">
                  חלוקת הפוליסות לפי קטגוריה
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  כל כרטיס מרכז את מספר הפוליסות, הפרמיה החודשית, החידושים והכפילויות בכל שכבה.
                </p>
              </div>
              <Badge variant="outline" className="rounded-full">
                {categoriesWithData.length} מתוך {CATEGORIES.length} קטגוריות עם מידע
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="insurance-category-grid">
              {CATEGORIES.map((category) => {
                const config = CATEGORY_CONFIG[category];
                const Icon = config.icon;
                const stats = overview.categorySummaries[category];
                const duplicateCount = overview.completedPolicies
                  .filter((policy) => policy.category === category)
                  .reduce((sum, policy) => sum + policy.duplicateCount, 0);
                const status = getCategoryStatus(stats);
                const descriptionId = `category-summary-${category}`;
                const metrics = [
                  { label: "פוליסות", value: `${stats.scans}` },
                  {
                    label: "פרמיה חודשית",
                    value: stats.monthlyPremium > 0 ? formatInsuranceCurrency(stats.monthlyPremium) : "—",
                  },
                  {
                    label: "חידוש קרוב",
                    value: stats.nextRenewalDays !== null ? `${stats.nextRenewalDays} ימים` : "—",
                  },
                  {
                    label: "כפילויות",
                    value: duplicateCount > 0 ? `${duplicateCount}` : "—",
                  },
                ];

                return (
                  <button
                    key={category}
                    type="button"
                    data-testid={`category-card-${category}`}
                    aria-describedby={descriptionId}
                    className={`w-full rounded-2xl border border-border bg-card p-5 text-start transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${config.accentBorder} ${config.accentMuted}`}
                    onClick={() => setLocation(`/insurance/category/${category}`)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl ${config.accentSurface} ${config.accentText}`}
                      >
                        <Icon className="size-5" aria-hidden="true" />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-semibold text-foreground">{config.label}</h3>
                          <Badge variant={status.variant} className="rounded-full">
                            {status.label}
                          </Badge>
                          {stats.renewals > 0 ? (
                            <Badge variant="outline" className="rounded-full">
                              {stats.renewals} חידושים קרובים
                            </Badge>
                          ) : null}
                        </div>
                        <p id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
                          {getCategorySummaryText(stats)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {metrics.map((metric) => (
                        <div key={metric.label} className="rounded-xl border border-border bg-background p-3">
                          <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
                          <p className="mt-1 text-base font-semibold [font-variant-numeric:tabular-nums]">
                            {metric.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                      <span>לפתיחת הקטגוריה</span>
                      <ArrowLeft className="size-4" aria-hidden="true" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {attentionItems.length > 0 ? (
            <section aria-labelledby="insurance-attention-heading">
              <Card data-testid="insurance-attention-card" className="border-border/60">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <CircleAlert className="size-4 text-primary" aria-hidden="true" />
                    <h2 id="insurance-attention-heading" className="text-base font-semibold">
                      מה כדאי לבדוק בתיק
                    </h2>
                  </div>

                  <ul className="grid gap-3 md:grid-cols-3">
                    {attentionItems.map((item) => (
                      <li key={item.id} className="rounded-xl border border-border bg-background p-4">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {item.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      ) : (
        <Card className="border-dashed" data-testid="empty-state">
          <CardContent className="py-16 text-center space-y-6">
            <div className="mx-auto flex size-20 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <Shield className="size-8" aria-hidden="true" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">עדיין אין פוליסות בתיק</h2>
              <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                אחרי הסריקה הראשונה תופיע כאן חלוקה ברורה לפי קטגוריות וסיכום אגרגטיבי של כל התיק.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button
                data-testid="empty-state-scan-button"
                onClick={() => setLocation("/insurance/new")}
                size="lg"
                className="gap-2"
              >
                <Plus className="size-4" aria-hidden="true" />
                סריקה ראשונה
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2"
                onClick={() => setLocation("/assistant")}
              >
                <MessageSquare className="size-4" aria-hidden="true" />
                שאל את לומי מה כדאי להעלות
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

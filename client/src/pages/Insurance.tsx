import { useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { AnalysisQueueProgressCard } from "@/components/AnalysisQueueProgressCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Plus,
  FileText,
  Heart,
  Car,
  Home,
  User,
  ArrowLeft,
  Sparkles,
  CircleAlert,
  Clock3,
  MessageSquare,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { InsuranceCategory } from "@shared/insurance";
import {
  buildInsuranceOverview,
  formatInsuranceCurrency,
  insuranceCategoryLabels,
} from "@/lib/insuranceOverview";

const CATEGORY_CONFIG: Record<
  InsuranceCategory,
  {
    label: string;
    icon: React.ReactNode;
    gradient: string;
    iconGradient: string;
    iconShadow: string;
    hoverBorder: string;
    description: string;
  }
> = {
  health: {
    label: insuranceCategoryLabels.health,
    icon: <Heart className="size-5" />,
    gradient: "from-rose-100/80 via-pink-50/40 to-transparent",
    iconGradient: "from-rose-500 to-pink-600",
    iconShadow: "shadow-rose-500/30",
    hoverBorder: "hover:border-rose-200",
    description: "רפואה משלימה, אשפוז, שיניים ותרופות",
  },
  life: {
    label: insuranceCategoryLabels.life,
    icon: <User className="size-5" />,
    gradient: "from-blue-100/80 via-indigo-50/40 to-transparent",
    iconGradient: "from-blue-500 to-indigo-600",
    iconShadow: "shadow-blue-500/30",
    hoverBorder: "hover:border-blue-200",
    description: "חיים, ריסק, אובדן כושר עבודה והגנה למשפחה",
  },
  car: {
    label: insuranceCategoryLabels.car,
    icon: <Car className="size-5" />,
    gradient: "from-amber-100/80 via-orange-50/40 to-transparent",
    iconGradient: "from-amber-500 to-orange-500",
    iconShadow: "shadow-amber-500/30",
    hoverBorder: "hover:border-amber-200",
    description: "מקיף, צד ג׳, חובה ובדיקת חידושים",
  },
  home: {
    label: insuranceCategoryLabels.home,
    icon: <Home className="size-5" />,
    gradient: "from-emerald-100/80 via-teal-50/40 to-transparent",
    iconGradient: "from-emerald-500 to-teal-600",
    iconShadow: "shadow-emerald-500/30",
    hoverBorder: "hover:border-emerald-200",
    description: "מבנה, תכולה, רעידת אדמה וצנרת",
  },
};

const CATEGORIES: InsuranceCategory[] = ["health", "life", "car", "home"];

const insightToneStyles = {
  warning: "border-amber-200 bg-amber-50/70",
  info: "border-blue-200 bg-blue-50/70",
  success: "border-emerald-200 bg-emerald-50/70",
} as const;

export default function Insurance() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
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

  if (!user) return null;

  const statCards = [
    {
      key: "policies",
      label: "פוליסות פעילות",
      value: overview.totalPolicies,
      icon: <ShieldCheck className="size-5" />,
      gradient: "from-blue-500 to-indigo-600",
      shadow: "shadow-blue-500/20",
    },
    {
      key: "files",
      label: "קבצים שנסרקו",
      value: overview.totalFiles,
      icon: <FileText className="size-5" />,
      gradient: "from-violet-500 to-purple-600",
      shadow: "shadow-violet-500/20",
    },
    {
      key: "premium",
      label: "פרמיה חודשית",
      value: formatInsuranceCurrency(overview.totalMonthlyPremium),
      icon: <Wallet className="size-5" />,
      gradient: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-500/20",
    },
    {
      key: "renewals",
      label: "חידושים קרובים",
      value: overview.renewals.length,
      icon: <Clock3 className="size-5" />,
      gradient: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
    },
  ];

  return (
    <div className="page-container space-y-6" data-testid="insurance-page">
      <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#101a34] via-[#1c2f57] to-[#2348a2] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(255,255,255,0.18),transparent_55%)]" />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <Shield className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">ביטוחים</h1>
                <p className="text-sm text-white/75 mt-0.5">
                  תמונת כיסוי מלאה, חידושים קרובים ופערים שכדאי לסגור לפי מצב הבית
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                className="bg-white text-slate-900 hover:bg-white/90 gap-2 shadow-lg"
                onClick={() => setLocation("/assistant")}
              >
                <MessageSquare className="size-4" />
                שאל את לומי
              </Button>
              <Button
                data-testid="new-scan-button"
                onClick={() => setLocation("/insurance/new")}
                size="lg"
                className="gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 shadow-lg rounded-xl text-sm font-semibold px-6"
              >
                <Plus className="size-5" />
                סריקה חדשה
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <div
            key={stat.key}
            data-testid={`stat-card-${stat.key}`}
            className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg animate-fade-in-up stagger-${index + 1}`}
          >
            <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-l ${stat.gradient}`} />
            <div className="flex items-center gap-4">
              <div
                className={`size-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shadow-md ${stat.shadow}`}
              >
                {stat.icon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                <p className="text-3xl font-bold tracking-tight mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {inFlightAnalyses.length > 0 && (
        <AnalysisQueueProgressCard
          analyses={inFlightAnalyses}
          onOpenStatus={() => setLocation(`/insurance/${inFlightAnalyses[0].sessionId}`)}
        />
      )}

      {overview.insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in-up stagger-5" data-testid="insurance-insights">
          {overview.insights.map((insight) => (
            <Card key={insight.id} className={insightToneStyles[insight.tone]}>
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-4" />
                  <p className="text-sm font-semibold">{insight.title}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
                {insight.category && (
                  <Badge variant="outline">{insuranceCategoryLabels[insight.category]}</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="rounded-2xl border border-border/40 bg-card p-7 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-2xl bg-muted" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-muted rounded-lg w-2/5" />
                  <div className="h-3 bg-muted rounded-lg w-3/5" />
                </div>
              </div>
              <div className="mt-6 h-20 rounded-xl bg-muted" />
            </div>
          ))}
        </div>
      ) : overview.totalPolicies > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {CATEGORIES.map((category, index) => {
                const config = CATEGORY_CONFIG[category];
                const stats = overview.categorySummaries[category];
                return (
                  <div
                    key={category}
                    role="button"
                    tabIndex={0}
                    aria-label={config.label}
                    data-testid={`category-card-${category}`}
                    className={`group relative overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${config.hoverBorder} cursor-pointer animate-fade-in-up stagger-${index + 2}`}
                    onClick={() => setLocation(`/insurance/category/${category}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setLocation(`/insurance/category/${category}`);
                      }
                    }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-bl ${config.gradient} pointer-events-none`} />
                    <div className="relative p-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-4">
                          <div
                            className={`size-12 rounded-2xl bg-gradient-to-br ${config.iconGradient} flex items-center justify-center text-white shadow-lg ${config.iconShadow}`}
                          >
                            {config.icon}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-foreground">{config.label}</h3>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{config.description}</p>
                          </div>
                        </div>
                        <ArrowLeft className="size-5 text-muted-foreground/30 group-hover:text-foreground/60 group-hover:-translate-x-1 transition-all duration-300 mt-1.5" />
                      </div>

                      <div className="mt-5 flex items-center gap-2 flex-wrap">
                        {stats.relevant && (
                          <Badge variant={stats.hasData ? "secondary" : "default"}>
                            {stats.hasData ? "רלוונטי ומטופל" : "כדאי להשלים"}
                          </Badge>
                        )}
                        {stats.renewals > 0 && <Badge variant="outline">{stats.renewals} חידושים קרובים</Badge>}
                      </div>

                      <div className="grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-border/40">
                        <div>
                          <p className="text-[11px] text-muted-foreground">פוליסות</p>
                          <p className="text-lg font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {stats.scans}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">PDF</p>
                          <p className="text-lg font-bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {stats.pdfs}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">חודשי</p>
                          <p className="text-lg font-bold">
                            {stats.monthlyPremium > 0 ? formatInsuranceCurrency(stats.monthlyPremium) : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-border/50 bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">מה בולט כרגע</p>
                        <p className="text-sm font-medium mt-1">{stats.highlight}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Card className="animate-fade-in-up stagger-6">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-amber-500" />
                    <h3 className="text-sm font-semibold">פוליסות שדורשות מבט עכשיו</h3>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setLocation("/assistant")} className="gap-1.5">
                    <MessageSquare className="size-4" />
                    שאל את לומי
                  </Button>
                </div>
                <div className="space-y-3">
                  {overview.prioritizedPolicies.map((policy) => (
                    <div key={policy.sessionId} className="rounded-xl border border-border/60 bg-muted/15 p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold">{policy.policyName}</p>
                          <p className="text-xs text-muted-foreground">{policy.insurerName}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{insuranceCategoryLabels[policy.category]}</Badge>
                          <Badge variant="secondary">{policy.premiumLabel}</Badge>
                          {policy.daysUntilRenewal !== null && policy.daysUntilRenewal >= 0 && (
                            <Badge variant={policy.daysUntilRenewal <= 45 ? "default" : "secondary"}>
                              {policy.daysUntilRenewal <= 45
                                ? `חידוש בעוד ${policy.daysUntilRenewal} ימים`
                                : `תוקף בעוד ${policy.daysUntilRenewal} ימים`}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{policy.summary}</p>
                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span>{policy.coverageCount} כיסויים</span>
                        <span>{policy.filesCount} קבצים</span>
                        {policy.duplicateCount > 0 && <span>{policy.duplicateCount} כפילויות</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 animate-fade-in-up stagger-7">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Clock3 className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">מה דורש תשומת לב</h3>
                </div>
                <div className="space-y-2">
                  {overview.renewals.slice(0, 3).map((policy) => (
                    <div key={policy.sessionId} className="rounded-xl border border-border/60 bg-muted/10 p-3">
                      <p className="text-sm font-medium">{policy.policyName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {policy.daysUntilRenewal} ימים לחידוש · {policy.insurerName}
                      </p>
                    </div>
                  ))}
                  {overview.renewals.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      כרגע לא זוהו חידושים קרובים ב־90 הימים הקרובים.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">פערי כיסוי למשק הבית</h3>
                </div>
                {overview.coverageGaps.length > 0 ? (
                  <div className="space-y-2">
                    {overview.coverageGaps.map((gap) => (
                      <div key={gap.id} className="rounded-xl border border-border/60 bg-muted/10 p-3">
                        <p className="text-sm font-medium">{gap.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{gap.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    אין כרגע פערי כיסוי בולטים לפי הפרופיל שהוזן.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="animate-fade-in-up stagger-6" data-testid="empty-state">
          <div className="rounded-2xl border-2 border-dashed border-border/50 bg-gradient-to-b from-muted/30 to-transparent py-20 px-8 text-center">
            <div className="size-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Sparkles className="size-9 text-primary/40" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">אין ביטוחים עדיין</h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
              העלה את הפוליסה הראשונה שלך כדי לקבל תמונת כיסוי, חידושים ותובנות מותאמות לבית.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button
                data-testid="empty-state-scan-button"
                onClick={() => setLocation("/insurance/new")}
                size="lg"
                className="gap-2 shadow-lg shadow-primary/25 rounded-xl px-8"
              >
                <Plus className="size-5" />
                סריקה ראשונה
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="gap-2 rounded-xl px-8"
                onClick={() => setLocation("/assistant")}
              >
                <MessageSquare className="size-5" />
                שאל את לומי מה כדאי להעלות
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

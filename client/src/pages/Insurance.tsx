import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Plus,
  FileText,
  Heart,
  Car,
  Home,
  User,
  ScanLine,
  BarChart3,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import type { InsuranceCategory } from "@shared/insurance";
import { inferInsuranceCategory } from "@shared/insurance";
import { useMemo } from "react";

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
    label: "ביטוחי בריאות",
    icon: <Heart className="size-5" />,
    gradient: "from-rose-100/80 via-pink-50/40 to-transparent",
    iconGradient: "from-rose-500 to-pink-600",
    iconShadow: "shadow-rose-500/30",
    hoverBorder: "hover:border-rose-200",
    description: "רפואה משלימה, אשפוז, שיניים, תרופות",
  },
  life: {
    label: "ביטוחי חיים",
    icon: <User className="size-5" />,
    gradient: "from-blue-100/80 via-indigo-50/40 to-transparent",
    iconGradient: "from-blue-500 to-indigo-600",
    iconShadow: "shadow-blue-500/30",
    hoverBorder: "hover:border-blue-200",
    description: "ביטוח חיים, ריסק, אובדן כושר עבודה",
  },
  car: {
    label: "ביטוחי רכב",
    icon: <Car className="size-5" />,
    gradient: "from-amber-100/80 via-orange-50/40 to-transparent",
    iconGradient: "from-amber-500 to-orange-500",
    iconShadow: "shadow-amber-500/30",
    hoverBorder: "hover:border-amber-200",
    description: "מקיף, צד ג׳, חובה",
  },
  home: {
    label: "ביטוחי דירה",
    icon: <Home className="size-5" />,
    gradient: "from-emerald-100/80 via-teal-50/40 to-transparent",
    iconGradient: "from-emerald-500 to-teal-600",
    iconShadow: "shadow-emerald-500/30",
    hoverBorder: "hover:border-emerald-200",
    description: "מבנה, תכולה, צנרת, רעידת אדמה",
  },
};

const CATEGORIES: InsuranceCategory[] = ["health", "life", "car", "home"];

const STAT_CARDS = [
  {
    key: "total",
    label: 'סה"כ סריקות',
    icon: <BarChart3 className="size-5" />,
    gradient: "from-blue-500 to-blue-600",
    shadow: "shadow-blue-500/20",
  },
  {
    key: "files",
    label: "קבצים שנסרקו",
    icon: <FileText className="size-5" />,
    gradient: "from-violet-500 to-purple-600",
    shadow: "shadow-violet-500/20",
  },
  {
    key: "completed",
    label: "סריקות שהושלמו",
    icon: <CheckCircle2 className="size-5" />,
    gradient: "from-emerald-500 to-teal-600",
    shadow: "shadow-emerald-500/20",
  },
] as const;

export default function Insurance() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });

  const categoryStats = useMemo(() => {
    const stats: Record<InsuranceCategory, { scans: number; pdfs: number }> = {
      health: { scans: 0, pdfs: 0 },
      life: { scans: 0, pdfs: 0 },
      car: { scans: 0, pdfs: 0 },
      home: { scans: 0, pdfs: 0 },
    };

    analyses?.forEach((analysis) => {
      const cat =
        (analysis as any).insuranceCategory ??
        analysis.analysisResult?.generalInfo?.insuranceCategory ??
        inferInsuranceCategory(
          analysis.analysisResult?.generalInfo?.policyType,
          analysis.analysisResult?.coverages
        );
      if (stats[cat as InsuranceCategory]) {
        stats[cat as InsuranceCategory].scans += 1;
        stats[cat as InsuranceCategory].pdfs += analysis.files?.length || 0;
      }
    });

    return stats;
  }, [analyses]);

  const totalScans = analyses?.length || 0;
  const totalPdfs = analyses?.reduce((sum, a) => sum + (a.files?.length || 0), 0) || 0;
  const completedScans = analyses?.filter((a) => a.status === "completed").length || 0;
  const statValues = { total: totalScans, files: totalPdfs, completed: completedScans };

  if (!user) return null;

  return (
    <div className="page-container" data-testid="insurance-page">
      <div className="flex items-center justify-between mb-10 animate-fade-in-up">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
            <Shield className="size-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">ביטוחים</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              ניהול פוליסות, כיסויים וסריקות
            </p>
          </div>
        </div>
        <Button
          data-testid="new-scan-button"
          onClick={() => setLocation("/insurance/new")}
          size="lg"
          className="gap-2 shadow-lg shadow-primary/25 rounded-xl text-sm font-semibold px-6"
        >
          <Plus className="size-5" />
          סריקה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {STAT_CARDS.map((stat, i) => (
          <div
            key={stat.key}
            data-testid={`stat-card-${stat.key}`}
            className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg animate-fade-in-up stagger-${i + 1}`}
          >
            <div
              className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-l ${stat.gradient}`}
            />
            <div className="flex items-center gap-4">
              <div
                className={`size-11 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center text-white shadow-md ${stat.shadow}`}
              >
                {stat.icon}
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                <p
                  className="text-3xl font-bold tracking-tight mt-0.5"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {statValues[stat.key]}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-border/40 bg-card p-7 animate-pulse"
            >
              <div className="flex items-center gap-4">
                <div className="size-12 rounded-2xl bg-muted" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-muted rounded-lg w-2/5" />
                  <div className="h-3 bg-muted rounded-lg w-3/5" />
                </div>
              </div>
              <div className="mt-6 pt-5 border-t border-border/30 flex items-center gap-8">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-4 bg-muted rounded w-8" />
                    <div className="h-2.5 bg-muted rounded w-12" />
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-lg bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-4 bg-muted rounded w-8" />
                    <div className="h-2.5 bg-muted rounded w-12" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CATEGORIES.map((cat, i) => {
            const config = CATEGORY_CONFIG[cat];
            const stats = categoryStats[cat];
            const hasData = stats.scans > 0;

            return (
              <div
                key={cat}
                role="button"
                tabIndex={0}
                aria-label={config.label}
                data-testid={`category-card-${cat}`}
                className={`group relative overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${config.hoverBorder} cursor-pointer animate-fade-in-up stagger-${i + 3} ${
                  !hasData ? "opacity-80 hover:opacity-100" : ""
                }`}
                onClick={() => setLocation(`/insurance/category/${cat}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setLocation(`/insurance/category/${cat}`);
                  }
                }}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-bl ${config.gradient} pointer-events-none`}
                />

                <div className="relative p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className={`size-12 rounded-2xl bg-gradient-to-br ${config.iconGradient} flex items-center justify-center text-white shadow-lg ${config.iconShadow}`}
                      >
                        {config.icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-foreground">
                          {config.label}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {config.description}
                        </p>
                      </div>
                    </div>
                    <ArrowLeft className="size-5 text-muted-foreground/30 group-hover:text-foreground/60 group-hover:-translate-x-1 transition-all duration-300 mt-1.5" />
                  </div>

                  <div className="flex items-center gap-8 mt-6 pt-5 border-t border-border/40">
                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-lg bg-muted/60 flex items-center justify-center">
                        <FileText className="size-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p
                          className="text-lg font-bold leading-none"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {stats.pdfs}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          קבצי PDF
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="size-8 rounded-lg bg-muted/60 flex items-center justify-center">
                        <ScanLine className="size-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <p
                          className="text-lg font-bold leading-none"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {stats.scans}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          סריקות
                        </p>
                      </div>
                    </div>

                    {hasData && (
                      <div className="flex items-center gap-1.5 mr-auto">
                        <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-full">
                          <CheckCircle2 className="size-3.5" />
                          {stats.scans === 1 ? "סריקה אחת" : `${stats.scans} סריקות`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && totalScans === 0 && (
        <div className="mt-10 animate-fade-in-up stagger-6" data-testid="empty-state">
          <div className="rounded-2xl border-2 border-dashed border-border/50 bg-gradient-to-b from-muted/30 to-transparent py-20 px-8 text-center">
            <div className="size-20 rounded-3xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Sparkles className="size-9 text-primary/40" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              אין ביטוחים עדיין
            </h3>
            <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
              העלה את הפוליסה הראשונה שלך וקבל ניתוח מפורט עם תובנות מותאמות אישית
            </p>
            <Button
              data-testid="empty-state-scan-button"
              onClick={() => setLocation("/insurance/new")}
              size="lg"
              className="gap-2 shadow-lg shadow-primary/25 rounded-xl px-8"
            >
              <Plus className="size-5" />
              סריקה ראשונה
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

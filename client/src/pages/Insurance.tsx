import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    iconBg: string;
    textColor: string;
    description: string;
  }
> = {
  health: {
    label: "ביטוחי בריאות",
    icon: <Heart className="size-6" />,
    gradient: "from-rose-500/12 to-pink-500/6",
    iconBg: "bg-rose-100",
    textColor: "text-rose-600",
    description: "רפואה משלימה, אשפוז, שיניים, תרופות",
  },
  life: {
    label: "ביטוחי חיים",
    icon: <User className="size-6" />,
    gradient: "from-blue-500/12 to-indigo-500/6",
    iconBg: "bg-blue-100",
    textColor: "text-blue-600",
    description: "ביטוח חיים, ריסק, אובדן כושר עבודה",
  },
  car: {
    label: "ביטוחי רכב",
    icon: <Car className="size-6" />,
    gradient: "from-amber-500/12 to-orange-500/6",
    iconBg: "bg-amber-100",
    textColor: "text-amber-600",
    description: "מקיף, צד ג׳, חובה",
  },
  home: {
    label: "ביטוחי דירה",
    icon: <Home className="size-6" />,
    gradient: "from-emerald-500/12 to-teal-500/6",
    iconBg: "bg-emerald-100",
    textColor: "text-emerald-600",
    description: "מבנה, תכולה, צנרת, רעידת אדמה",
  },
};

const CATEGORIES: InsuranceCategory[] = ["health", "life", "car", "home"];

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

  if (!user) return null;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center">
            <Shield className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">ביטוחים</h2>
            <p className="text-xs text-muted-foreground">ניהול פוליסות, כיסויים וסריקות</p>
          </div>
        </div>
        <Button
          onClick={() => setLocation("/insurance/new")}
          size="lg"
          className="gap-2 shadow-md"
        >
          <Plus className="size-5" />
          סריקה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {[
          {
            label: "סה\"כ סריקות",
            value: totalScans,
            icon: <BarChart3 className="size-5" />,
            iconBg: "bg-blue-100",
            textColor: "text-blue-600",
          },
          {
            label: "קבצים שנסרקו",
            value: totalPdfs,
            icon: <FileText className="size-5" />,
            iconBg: "bg-violet-100",
            textColor: "text-violet-600",
          },
          {
            label: "סריקות שהושלמו",
            value: completedScans,
            icon: <ScanLine className="size-5" />,
            iconBg: "bg-emerald-100",
            textColor: "text-emerald-600",
          },
        ].map((stat, i) => (
          <Card key={i} className={`overflow-hidden animate-fade-in-up stagger-${i + 1}`}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-xl ${stat.iconBg} flex items-center justify-center ${stat.textColor}`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-8">
                <div className="flex items-center gap-4">
                  <div className="size-14 rounded-2xl bg-muted" />
                  <div className="flex-1 space-y-3">
                    <div className="h-5 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in-up stagger-4">
          {CATEGORIES.map((cat) => {
            const config = CATEGORY_CONFIG[cat];
            const stats = categoryStats[cat];
            const hasData = stats.scans > 0;

            return (
              <Card
                key={cat}
                className={`group cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-lg hover:scale-[1.01] hover:border-primary/20 ${
                  hasData ? "" : "opacity-75"
                }`}
                onClick={() => setLocation(`/insurance/category/${cat}`)}
              >
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-bl ${config.gradient} p-6`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`size-14 rounded-2xl ${config.iconBg} flex items-center justify-center ${config.textColor} shadow-sm`}>
                          {config.icon}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{config.label}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{config.description}</p>
                        </div>
                      </div>
                      <ArrowLeft className="size-5 text-muted-foreground/40 group-hover:text-primary transition-colors mt-1" />
                    </div>

                    <div className="flex items-center gap-6 mt-5 pt-4 border-t border-border/40">
                      <div className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold">{stats.pdfs}</p>
                          <p className="text-[11px] text-muted-foreground">קבצי PDF</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ScanLine className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold">{stats.scans}</p>
                          <p className="text-[11px] text-muted-foreground">סריקות</p>
                        </div>
                      </div>
                      {hasData && (
                        <Badge variant="secondary" className="mr-auto text-xs">
                          {stats.scans} {stats.scans === 1 ? "סריקה" : "סריקות"}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!isLoading && totalScans === 0 && (
        <Card className="border-dashed mt-6 animate-fade-in-up stagger-5">
          <CardContent className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
              <FileText className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">אין ביטוחים עדיין</h3>
            <p className="text-sm text-muted-foreground mb-5">העלה את הפוליסה הראשונה שלך וקבל סריקה מפורטת</p>
            <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
              <Plus className="size-4" />
              סריקה ראשונה
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

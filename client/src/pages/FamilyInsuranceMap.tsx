import { useMemo } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";
import { FamilyCoverageGrid } from "@/components/family/FamilyCoverageGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { computeCoverageScore } from "@/lib/familyCoverage";
import { AlertCircle, Loader2, Shield, Users, FileSearch, AlertTriangle, Eye } from "lucide-react";

function CoverageScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70
      ? "var(--success)"
      : score >= 40
        ? "var(--warning)"
        : "var(--destructive)";

  return (
    <div className="relative size-32" data-testid="coverage-score-ring">
      <svg className="size-32 -rotate-90" viewBox="0 0 120 120">
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
        />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-3xl font-bold"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
        >
          {score}
        </motion.span>
        <span className="text-[10px] text-muted-foreground">מתוך 100</span>
      </div>
    </div>
  );
}

export default function FamilyInsuranceMap() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const { data, error, isLoading, refetch } = trpc.insuranceMap.get.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const coverageScore = useMemo(
    () => (data?.rows ? computeCoverageScore(data.rows) : 0),
    [data?.rows],
  );

  if (loading || isLoading) {
    return (
      <div className="page-container">
        <Card>
          <CardContent className="pt-8 pb-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            טוען מפת ביטוח משפחתית...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <Card data-testid="family-insurance-map-error">
          <CardContent className="py-10 text-center space-y-3">
            <div className="size-12 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
              <AlertCircle className="size-6" />
            </div>
            <p className="text-base font-semibold">לא הצלחנו לטעון את מפת הביטוחים</p>
            <p className="text-sm text-muted-foreground">
              אפשר לנסות שוב עכשיו, או לחזור למסך הביטוחים ולהמשיך משם.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setLocation("/insurance")}>
                למסך הביטוחים
              </Button>
              <Button onClick={() => void refetch()}>
                נסה שוב
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <Card data-testid="family-insurance-map-empty">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-base font-semibold">עדיין אין מפת ביטוחים להצגה</p>
            <p className="text-sm text-muted-foreground">
              ברגע שלומי יזהה פוליסות או בני בית, המפה המשפחתית תופיע כאן.
            </p>
            <Button onClick={() => setLocation("/insurance/new")}>סריקה חדשה</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container space-y-8" data-testid="family-insurance-map-page">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="rounded-2xl bg-gradient-to-bl from-[#1a1b3d] to-[#2563eb] p-6 md:p-8 text-white"
      >
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
          <CoverageScoreRing score={coverageScore} />

          <div className="flex-1 text-center md:text-start space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
              <Shield className="size-3.5" />
              מפת ביטוח משפחתית
            </div>
            <h1 className="text-xl md:text-2xl font-bold">
              תמונה אחת של כל הכיסויים בבית
            </h1>
            <p className="text-sm text-white/70 max-w-xl">
              לחצו על בן משפחה במפה כדי לראות את פירוט הכיסוי שלו. הנקודות על הטבעות מראות את מצב הכיסוי בכל קטגוריה.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-1 gap-3 w-full md:w-auto">
            {[
              {
                icon: Users,
                label: "בני בית",
                value: data.householdSize,
              },
              {
                icon: FileSearch,
                label: "קטגוריות עם מסמכים",
                value: data.categoriesWithData,
              },
              {
                icon: Eye,
                label: "שיוכים לבדיקה",
                value: data.reviewCount,
              },
              {
                icon: AlertTriangle,
                label: "פערי מידע",
                value: data.missingCount,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl bg-white/10 backdrop-blur-sm px-3 py-2 flex items-center gap-2"
              >
                <stat.icon className="size-3.5 text-white/60 shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight">{stat.value}</p>
                  <p className="text-[10px] text-white/50 truncate">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <FamilyCoverageGrid
        rows={data.rows}
        householdSize={data.householdSize}
        categoriesWithData={data.categoriesWithData}
        missingCount={data.missingCount}
        reviewCount={data.reviewCount}
        onOpenInsurance={() => setLocation("/insurance")}
        onOpenAssistant={() => setLocation("/chat")}
      />
    </div>
  );
}

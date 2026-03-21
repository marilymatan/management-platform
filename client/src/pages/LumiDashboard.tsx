import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { AnalysisQueueProgressCard } from "@/components/AnalysisQueueProgressCard";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildAlertCenterSnapshot, type AlertCenterItem } from "@/lib/alertCenter";
import { summarizeAnalysisQueue } from "@/lib/analysisProgress";
import { type FamilyMemberLike } from "@/lib/familyCoverage";
import { formatGmailConnectionSummary } from "@/lib/gmailConnections";
import { formatInsuranceCurrency } from "@/lib/insuranceOverview";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  FileText,
  Loader2,
  Mail,
  PiggyBank,
  Plus,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

type DashboardActionTone = "info" | "warning" | "success";

type DashboardActionItem = {
  id: string;
  title: string;
  description: string;
  path: string;
  cta: string;
  tone: DashboardActionTone;
};

function HealthScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="relative mx-auto flex size-32 items-center justify-center md:size-36">
      <div
        className="pointer-events-none absolute inset-2 rounded-full bg-[radial-gradient(circle_at_50%_32%,color-mix(in_oklch,var(--primary-foreground)_14%,transparent),transparent_62%)] md:inset-3"
        aria-hidden
      />
      <svg className="relative size-32 -rotate-90 md:size-36" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-white/18" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums tracking-tight text-white md:text-4xl">{score}</span>
        <span className="mt-0.5 text-[11px] font-medium text-white/75">מתוך 100</span>
      </div>
    </div>
  );
}

function getActionToneClasses(tone: DashboardActionTone) {
  if (tone === "warning") {
    return "border-warning/30 bg-warning/20";
  }
  if (tone === "success") {
    return "border-success/20 bg-success/10";
  }
  return "border-primary/20 bg-primary/5";
}

function getAlertPreviewIcon(alert: AlertCenterItem) {
  if (alert.source === "gmail_scan") {
    return { icon: <Mail className="size-4" />, className: "bg-primary/10 text-primary" };
  }
  if (alert.source === "family") {
    return { icon: <Users className="size-4" />, className: "bg-warning/20 text-warning-foreground" };
  }
  if (alert.source === "invoice") {
    return { icon: <Wallet className="size-4" />, className: "bg-success/10 text-success" };
  }
  return { icon: <AlertTriangle className="size-4" />, className: "bg-destructive/10 text-destructive" };
}

export default function LumiDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: analyses, isLoading: analysesLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 50 }, {
    enabled: !!user,
  });
  const { data: profileData, isLoading: profileLoading } = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: familyMembersData } = trpc.family.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: gmailStatus } = trpc.gmail.connectionStatus.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: insuranceDiscoveries } = trpc.gmail.getInsuranceDiscoveries.useQuery({ limit: 20 }, {
    enabled: !!user,
  });
  const { data: dashboardSummary } = trpc.insuranceScore.getDashboard.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: savingsReport } = trpc.savings.getReport.useQuery(undefined, {
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

  const familyMembers = (familyMembersData ?? []) as FamilyMemberLike[];
  const alertSnapshot = useMemo(
    () =>
      buildAlertCenterSnapshot({
        analyses,
        profile: profileData,
        familyMembers,
        insuranceDiscoveries,
        invoices,
      }),
    [analyses, familyMembers, insuranceDiscoveries, invoices, profileData],
  );

  const coverageSnapshot = alertSnapshot.coverageSnapshot;
  const overview = coverageSnapshot.overview;
  const activePolicies = overview.completedPolicies;
  const analysisRows = analyses ?? [];
  const inFlightPolicies = analysisRows.filter(
    (analysis) => analysis.status === "pending" || analysis.status === "processing",
  );
  const inFlightSummary = summarizeAnalysisQueue(inFlightPolicies);
  const gmailConnected = Boolean(gmailStatus?.connected);
  const gmailConnectionSummary = formatGmailConnectionSummary(gmailStatus?.connections);
  const shouldShowOnboarding = !analysesLoading && !profileLoading && analysisRows.length === 0 && !profileData?.onboardingCompleted;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gmail_connected");
    const error = params.get("gmail_error");

    if (connected === "1") {
      window.history.replaceState({}, "", "/");
      void Promise.all([
        utils.gmail.connectionStatus.invalidate(),
        utils.gmail.discoverPolicies.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
      ]);
      toast.success("Gmail חובר בהצלחה");
      return;
    }

    if (error) {
      window.history.replaceState({}, "", "/");
      toast.error(`שגיאה בחיבור Gmail: ${decodeURIComponent(error)}`);
    }
  }, [utils.gmail.connectionStatus, utils.gmail.discoverPolicies, utils.gmail.getInsuranceDiscoveries]);

  const insuranceScore = (() => {
    if (dashboardSummary) {
      return dashboardSummary.score;
    }
    const relevantCategories = Object.values(overview.categorySummaries).filter((category) => category.relevant);
    const coveredRelevantCount = relevantCategories.filter((category) => category.hasData).length;
    let score = 35;
    score += coveredRelevantCount * 12;
    if (activePolicies.length >= 3) score += 8;
    if (gmailConnected) score += 8;
    if (coverageSnapshot.householdSize > 1) score += 4;
    score -= Math.min(18, overview.coverageGaps.length * 6);
    score -= Math.min(12, overview.duplicateGroups * 3);
    return Math.max(0, Math.min(100, score));
  })();

  const insuranceInvoiceTotal = (invoices ?? []).reduce((sum, invoice) => {
    const amount = Number(invoice.amount ?? 0);
    const isExpense = invoice.flowDirection !== "income";
    return isExpense ? sum + amount : sum;
  }, 0);
  const displayedMonthlyPremium = overview.totalMonthlyPremium > 0 ? overview.totalMonthlyPremium : insuranceInvoiceTotal;
  const latestAlerts = alertSnapshot.alerts.slice(0, 4);
  const allAlertsCount = alertSnapshot.alerts.length;

  const actionItems = useMemo(() => {
    const items: DashboardActionItem[] = [];

    dashboardSummary?.topActions?.forEach((action) => {
      items.push({
        id: `hub-${action.id}`,
        title: action.title,
        description: action.description,
        path:
          action.type === "savings"
            ? "/savings"
            : action.type === "gap"
              ? "/insurance-map"
              : action.type === "renewal"
                ? "/insurance"
                : "/alerts",
        cta:
          action.type === "savings"
            ? "לחיסכון"
            : action.type === "gap"
              ? "למפת הביטוח"
              : action.type === "renewal"
                ? "לבדיקה"
                : "פתח",
        tone:
          action.priority === "high"
            ? "warning"
            : action.status === "completed"
              ? "success"
              : "info",
      });
    });

    const priorityDiscovery =
      insuranceDiscoveries?.find((discovery) => discovery.artifactType === "renewal_notice")
      ?? insuranceDiscoveries?.find((discovery) => discovery.artifactType === "premium_notice")
      ?? insuranceDiscoveries?.[0];

    if (!gmailConnected) {
      items.push({
        id: "gmail-connect",
        title: "חבר Gmail כדי שלומי יזהה מסמכי ביטוח",
        description: "סריקה מהמייל עוזרת לגלות פוליסות, חידושים, פרמיות ומסמכים בלי להתחיל מאפס.",
        path: "/money",
        cta: "חיבור Gmail",
        tone: "info",
      });
    }

    if (priorityDiscovery) {
      items.push({
        id: "gmail-insurance-discoveries",
        title:
          priorityDiscovery.artifactType === "renewal_notice"
            ? `${priorityDiscovery.provider || "גוף ביטוחי"} שלח חידוש לבדיקה`
            : priorityDiscovery.artifactType === "premium_notice"
              ? `${priorityDiscovery.provider || "גוף ביטוחי"} שלח עדכון פרמיה`
              : `נמצאו ${insuranceDiscoveries?.length ?? 0} ממצאים ביטוחיים חדשים`,
        description:
          priorityDiscovery.actionHint
          || priorityDiscovery.summary
          || "לומי זיהה מהמייל פרמיות, חידושים או מסמכים שיכולים לייצר פעולה כבר עכשיו.",
        path: "/alerts",
        cta: "פתח התראות",
        tone: priorityDiscovery.artifactType === "renewal_notice" ? "warning" : "info",
      });
    }

    if (activePolicies.length === 0) {
      items.push({
        id: "first-policy",
        title: "העלה את הפוליסה הראשונה כדי להתחיל לבנות את התיק",
        description: "גם פוליסה אחת מספיקה כדי שלומי יתחיל לזהות כיסויים, חפיפות וחוסרים.",
        path: "/insurance/new",
        cta: "סריקה חדשה",
        tone: "warning",
      });
    }

    if (overview.duplicateGroups > 0) {
      items.push({
        id: "duplicates",
        title: `זוהו ${overview.duplicateGroups} חפיפות אפשריות בין כיסויים`,
        description: "כדאי לעבור עליהן מתוך ההתראות ולוודא שאין כיסוי כפול או כסף שיוצא פעמיים.",
        path: "/alerts",
        cta: "לבדיקה",
        tone: "warning",
      });
    }

    overview.coverageGaps.slice(0, 2).forEach((gap) => {
      items.push({
        id: gap.id,
        title: gap.title,
        description: gap.description,
        path: gap.category ? `/insurance/category/${gap.category}` : "/insurance",
        cta: "פתח",
        tone: gap.tone === "warning" ? "warning" : "info",
      });
    });

    if (coverageSnapshot.reviewCount > 0 || coverageSnapshot.missingCount > 0) {
      items.push({
        id: "family-coverage",
        title: "התמונה המשפחתית דורשת תשומת לב",
        description: `יש ${coverageSnapshot.reviewCount} שיוכים לבדיקה ו-${coverageSnapshot.missingCount} פערי מידע במשפחה.`,
        path: "/family",
        cta: "למשפחה שלי",
        tone: "info",
      });
    }

    return items.slice(0, 4);
  }, [
    activePolicies.length,
    coverageSnapshot.missingCount,
    coverageSnapshot.reviewCount,
    dashboardSummary?.topActions,
    gmailConnected,
    insuranceDiscoveries,
    overview.coverageGaps,
    overview.duplicateGroups,
  ]);

  if (!user) {
    return null;
  }

  if (shouldShowOnboarding) {
    return (
      <OnboardingWizard
        userName={user.name}
        onCompleted={() => {
          void Promise.all([
            utils.profile.get.invalidate(),
            utils.insuranceScore.getDashboard.invalidate(),
            utils.savings.getReport.invalidate(),
          ]);
        }}
      />
    );
  }

  const firstName = user.name?.split(" ")[0] || "משתמש";
  const insuranceSpendLabel = displayedMonthlyPremium > 0 ? formatInsuranceCurrency(displayedMonthlyPremium) : "עדיין לא זוהה";
  const potentialSavingsLabel = formatInsuranceCurrency(savingsReport?.totalMonthlySaving ?? 0);

  const openAlert = (alert: AlertCenterItem) => {
    if (alert.actionUrl) {
      window.open(alert.actionUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (alert.actionPath) {
      setLocation(alert.actionPath);
    }
  };

  return (
    <div className="page-container space-y-6" data-testid="insurance-command-center">
      <div className="animate-fade-in-up relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-bl from-primary via-primary/92 to-chart-1 text-primary-foreground shadow-[0_24px_48px_-12px_color-mix(in_oklch,var(--primary)_28%,transparent)]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_85%_-10%,color-mix(in_oklch,var(--primary-foreground)_22%,transparent),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_100%,color-mix(in_oklch,var(--chart-4)_35%,transparent),transparent_50%)] opacity-80" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/15 to-transparent" />
        <div className="relative px-6 py-8 md:px-10 md:py-10">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:gap-12">
            <div className="flex min-w-0 flex-col gap-8">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-4 py-2 text-xs font-semibold shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--primary-foreground)_12%,transparent)] backdrop-blur-md">
                  <Sparkles className="size-4 shrink-0 text-primary-foreground/95" aria-hidden />
                  הבית של לומי
                </div>
                <div className="space-y-4">
                  <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                    שלום, {firstName}. כאן כל מה שלומי יודע על הבית.
                  </h1>
                  <p className="max-w-2xl text-base leading-relaxed text-primary-foreground/78 md:text-[1.05rem]">
                    דף הבית החדש שם את הכוח של לומי במרכז: לשאול שאלות על כל הפוליסות, המסמכים, המשפחה והמיילים, ולקבל ישר את ההתראות הכי חשובות.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/18 bg-white/10 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur-md">
                  <Users className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  <span className="tabular-nums">{coverageSnapshot.householdSize} נפשות בתמונה</span>
                </div>
                <div className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/18 bg-white/10 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur-md">
                  <Bell className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  <span className="tabular-nums">{allAlertsCount} התראות פתוחות</span>
                </div>
                <div className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/18 bg-white/10 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur-md">
                  <Mail className="size-3.5 shrink-0 opacity-90" aria-hidden />
                  <span>{gmailConnected ? "Gmail מחובר" : "Gmail עדיין לא מחובר"}</span>
                </div>
                {inFlightPolicies.length > 0 && (
                  <div className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/18 bg-white/10 px-3.5 py-2 text-xs font-medium shadow-sm backdrop-blur-md">
                    <Loader2 className="size-3.5 shrink-0 opacity-90 animate-spin" aria-hidden />
                    <span className="tabular-nums">
                      {inFlightSummary?.totalFiles
                        ? `${inFlightSummary.visibleFiles}/${inFlightSummary.totalFiles} בעיבוד`
                        : `${inFlightPolicies.length} סריקות ברקע`}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="h-11 min-w-[9.5rem] rounded-full border-0 bg-primary-foreground px-6 text-primary shadow-lg shadow-black/15 transition-transform hover:scale-[1.02] hover:bg-primary-foreground/95 motion-reduce:hover:scale-100 active:scale-[0.99] motion-reduce:active:scale-100"
                  onClick={() => setLocation("/chat")}
                  data-testid="dashboard-hero-ask-lumi"
                >
                  <Sparkles className="size-4" />
                  שאל את לומי
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 rounded-full border border-white/28 bg-white/12 px-5 text-primary-foreground shadow-sm backdrop-blur-md transition-all hover:border-white/40 hover:bg-white/20"
                  onClick={() => setLocation("/alerts")}
                  data-testid="dashboard-hero-open-alerts"
                >
                  <Bell className="size-4" />
                  פתח התראות
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-11 rounded-full border border-white/28 bg-white/12 px-5 text-primary-foreground shadow-sm backdrop-blur-md transition-all hover:border-white/40 hover:bg-white/20"
                  onClick={() => setLocation("/insurance/new")}
                  data-testid="dashboard-hero-new-scan"
                >
                  <Plus className="size-4" />
                  סריקה חדשה
                </Button>
              </div>
              {gmailConnected && (
                <div
                  className="flex flex-col gap-3 rounded-2xl border border-white/22 bg-white/10 p-4 shadow-inner backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:p-5"
                  data-testid="dashboard-gmail-connection"
                >
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/12">
                    <Mail className="size-5 text-primary-foreground/95" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">חשבון Gmail מחובר</p>
                    <p className="text-sm font-semibold leading-snug break-all text-white">{gmailConnectionSummary.label}</p>
                    <p className="text-xs leading-relaxed text-white/72">{gmailConnectionSummary.detail}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full max-w-[300px] justify-self-center rounded-3xl border border-white/22 bg-white/14 p-6 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--primary-foreground)_14%,transparent)] backdrop-blur-xl sm:p-7 lg:max-w-none lg:justify-self-stretch">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white/90">ציון תיק ביטוחי</p>
                  <p className="mt-1 text-xs text-white/65">מבט מהיר על מצב הכיסוי</p>
                </div>
                <div className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[10px] font-semibold tabular-nums text-white/85">
                  ‎0–100‎
                </div>
              </div>
              <div className="mt-2">
                <HealthScoreRing score={insuranceScore} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/14 bg-white/8 p-3.5 text-center shadow-sm">
                  <p className="text-[11px] font-medium text-white/65">כיסויים</p>
                  <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight">{activePolicies.length}</p>
                </div>
                <div className="rounded-2xl border border-white/14 bg-white/8 p-3.5 text-center shadow-sm">
                  <p className="text-[11px] font-medium text-white/65">דחופות</p>
                  <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight">{alertSnapshot.urgentCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פוליסות פעילות</p>
                <p className="text-2xl font-bold">{activePolicies.length}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {coverageSnapshot.coveredCount} נקודות כיסוי כבר מזוהות בבית
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-success/10 text-success">
                <Wallet className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פרמיה חודשית מזוהה</p>
                <p className="text-2xl font-bold">{insuranceSpendLabel}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {insuranceInvoiceTotal > 0 ? `חיובים שזוהו במייל: ${formatInsuranceCurrency(insuranceInvoiceTotal)}` : "חבר Gmail או העלה עוד מסמכים כדי לדייק את התמונה"}
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-warning/20 text-warning-foreground">
                <PiggyBank className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פוטנציאל חיסכון</p>
                <p className="text-2xl font-bold">{potentialSavingsLabel}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {savingsReport?.opportunities?.length ?? 0} הזדמנויות פתוחות כרגע
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                <Bell className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">התראות פתוחות</p>
                <p className="text-2xl font-bold">{allAlertsCount}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {alertSnapshot.urgentCount} דורשות טיפול עכשיו
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)] gap-4">
        <Card data-testid="home-alerts-preview">
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">התראות חמות</h2>
                </div>
                <p className="text-xs text-muted-foreground">כל מה שלומי מצא מוצג עכשיו גם במסך התראות ייעודי.</p>
              </div>
              <Badge variant="outline">{allAlertsCount}</Badge>
            </div>

            {latestAlerts.length > 0 ? (
              <div className="space-y-2">
                {latestAlerts.map((alert) => {
                  const icon = getAlertPreviewIcon(alert);
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => openAlert(alert)}
                      className="w-full rounded-xl border border-border/70 bg-background p-3 text-start transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${icon.className}`}>
                          {icon.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">{alert.title}</p>
                            <Badge variant="secondary">{alert.badgeLabel}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{alert.description}</p>
                        </div>
                        <ArrowLeft className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-5 text-center">
                <p className="text-sm font-medium">עדיין אין התראות פתוחות</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  כשתעלה פוליסות או תסרוק Gmail, הממצאים הכי חשובים יופיעו כאן.
                </p>
              </div>
            )}

            <Button variant="outline" className="w-full gap-2" onClick={() => setLocation("/alerts")}>
              <Bell className="size-4" />
              לכל ההתראות
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {inFlightPolicies.length > 0 && (
            <AnalysisQueueProgressCard
              analyses={inFlightPolicies}
              onOpenStatus={() => setLocation("/insurance")}
              actionLabel="לסטטוס הסריקות"
              onClearQueue={() => clearInFlightQueue.mutate()}
              clearQueuePending={clearInFlightQueue.isPending}
            />
          )}

          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">פעולות מהירות</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button className="h-auto justify-start gap-2 py-4" onClick={() => setLocation("/insurance/new")}>
                  <Plus className="size-4" />
                  סריקה חדשה
                </Button>
                <Button variant="outline" className="h-auto justify-start gap-2 py-4" onClick={() => setLocation("/alerts")}>
                  <Bell className="size-4" />
                  פתח התראות
                </Button>
                <Button variant="outline" className="h-auto justify-start gap-2 py-4" onClick={() => setLocation("/family")}>
                  <Users className="size-4" />
                  המשפחה שלי
                </Button>
                <Button variant="outline" className="h-auto justify-start gap-2 py-4" onClick={() => setLocation("/money")}>
                  <Mail className="size-4" />
                  סריקת Gmail
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] gap-4">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">מה כדאי לעשות עכשיו</h2>
            </div>
            {actionItems.length > 0 ? (
              <div className="space-y-3">
                {actionItems.map((action) => (
                  <div key={action.id} className={`rounded-xl border p-4 ${getActionToneClasses(action.tone)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{action.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{action.description}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setLocation(action.path)} className="shrink-0">
                        {action.cta}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <p className="text-sm font-medium">המערכת עדיין בונה את התמונה הראשונית</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  העלה פוליסה, חבר Gmail או שאל את לומי כדי להתחיל לקבל המלצות מדויקות יותר.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-warning-foreground" />
              <h2 className="text-sm font-semibold">תקציר משפחתי</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">נפשות בתמונה</p>
                <p className="mt-1 text-xl font-bold">{coverageSnapshot.householdSize}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">קטגוריות עם נתונים</p>
                <p className="mt-1 text-xl font-bold">{coverageSnapshot.categoriesWithData}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">שיוכים לבדיקה</p>
                <p className="mt-1 text-xl font-bold">{coverageSnapshot.reviewCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">פערי מידע</p>
                <p className="mt-1 text-xl font-bold">{coverageSnapshot.missingCount}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              במסך המשפחה אפשר לראות מי דורש השלמת מידע, איפה יש כיסויים שצריך לבדוק, ואיך לשאול את לומי על כל בני הבית מתוך הקשר מלא.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => setLocation("/family")} className="gap-1.5">
                <Users className="size-4" />
                למשפחה שלי
              </Button>
              <Button variant="outline" onClick={() => setLocation("/alerts")} className="gap-1.5">
                <Bell className="size-4" />
                להתראות
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {activePolicies.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Shield className="size-4 text-primary" />
                פוליסות אחרונות בתיק
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setLocation("/insurance")} className="gap-1">
                צפה בהכל
                <ArrowLeft className="size-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {activePolicies.slice(0, 4).map((policy) => (
                <button
                  key={policy.sessionId}
                  type="button"
                  onClick={() => setLocation(`/insurance/${policy.sessionId}`)}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-start transition-colors hover:bg-muted/30"
                >
                  <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{policy.policyName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {policy.coverageCount} כיסויים · {policy.premiumLabel}
                    </p>
                  </div>
                  <ArrowLeft className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

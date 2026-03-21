import { useEffect, useMemo } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnalysisQueueProgressCard } from "@/components/AnalysisQueueProgressCard";
import { GmailPolicyDiscovery } from "@/components/GmailPolicyDiscovery";
import { MonthlyReportCard } from "@/components/MonthlyReportCard";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { summarizeAnalysisQueue } from "@/lib/analysisProgress";
import { buildFamilyCoverageSnapshot, type FamilyMemberLike } from "@/lib/familyCoverage";
import { formatGmailConnectionSummary } from "@/lib/gmailConnections";
import { formatInsuranceCurrency } from "@/lib/insuranceOverview";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  FileSearch,
  FileText,
  Mail,
  MessageSquare,
  PiggyBank,
  Plus,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
    <div className="relative size-24 mx-auto">
      <svg className="size-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-[10px] text-muted-foreground">מתוך 100</span>
      </div>
    </div>
  );
}

function getInvoiceFlowDirection(inv: { flowDirection?: string | null; extractedData?: unknown }): "expense" | "income" | "unknown" {
  if (inv.flowDirection === "expense" || inv.flowDirection === "income" || inv.flowDirection === "unknown") {
    return inv.flowDirection;
  }
  if (inv.extractedData && typeof inv.extractedData === "object") {
    const flowDirection = (inv.extractedData as Record<string, unknown>).flowDirection;
    if (flowDirection === "expense" || flowDirection === "income" || flowDirection === "unknown") {
      return flowDirection;
    }
  }
  return "expense";
}

function getActionToneClasses(tone: DashboardActionTone) {
  if (tone === "warning") {
    return "border-warning/30 bg-warning/10";
  }
  if (tone === "success") {
    return "border-success/20 bg-success/10";
  }
  return "border-primary/20 bg-primary/5";
}

export default function LumiDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const { data: analyses, isLoading: analysesLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: monthlySummary } = trpc.gmail.getMonthlySummary.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 20 }, {
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
  const { data: insuranceDiscoveries } = trpc.gmail.getInsuranceDiscoveries.useQuery({ limit: 10 }, {
    enabled: !!user,
  });
  const { data: dashboardSummary } = trpc.insuranceScore.getDashboard.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: savingsReport } = trpc.savings.getReport.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: monitoringReport } = trpc.monitoring.getMonthlyReport.useQuery(undefined, {
    enabled: !!user,
  });
  const monitoringRefreshMutation = trpc.monitoring.checkForChanges.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.monitoring.getMonthlyReport.invalidate(),
        utils.savings.getReport.invalidate(),
        utils.actions.list.invalidate(),
        utils.insuranceScore.getDashboard.invalidate(),
      ]);
      toast.success("הבדיקה החודשית עודכנה");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const familyMembers = (familyMembersData ?? []) as FamilyMemberLike[];
  const coverageSnapshot = useMemo(
    () => buildFamilyCoverageSnapshot(analyses as Parameters<typeof buildFamilyCoverageSnapshot>[0], profileData, familyMembers),
    [analyses, profileData, familyMembers],
  );
  const overview = coverageSnapshot.overview;
  const activePolicies = overview.completedPolicies;
  const analysisRows = analyses ?? [];
  const inFlightPolicies = analysisRows.filter(
    (analysis) => analysis.status === "pending" || analysis.status === "processing",
  );
  const inFlightSummary = summarizeAnalysisQueue(inFlightPolicies);
  const overdueInvoices = invoices?.filter(
    (invoice) => invoice.status === "overdue" && getInvoiceFlowDirection(invoice) === "expense",
  ) ?? [];
  const insuranceInvoices = invoices?.filter(
    (invoice) => invoice.category === "ביטוח" && getInvoiceFlowDirection(invoice) === "expense",
  ) ?? [];
  const insuranceInvoiceTotal = insuranceInvoices.reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);
  const displayedMonthlyPremium = overview.totalMonthlyPremium > 0 ? overview.totalMonthlyPremium : insuranceInvoiceTotal;
  const totalMonthlyExpenses = monthlySummary?.reduce((sum, category) => sum + (category.expenseTotal ?? category.total), 0) ?? 0;
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
    } else if (error) {
      window.history.replaceState({}, "", "/");
      toast.error(`שגיאה בחיבור Gmail: ${decodeURIComponent(error)}`);
    }
  }, [utils]);

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
    score -= Math.min(8, overdueInvoices.length * 2);
    return Math.max(0, Math.min(100, score));
  })();

  const recentActivity = useMemo(() => {
    const items: Array<{
      id: string;
      icon: React.ReactNode;
      text: string;
      time: string;
      color: string;
    }> = [];

    analysisRows.slice(0, 3).forEach((analysis) => {
      items.push({
        id: `analysis-${analysis.sessionId}`,
        icon: <FileSearch className="size-4" />,
        text: `פוליסה נסרקה: ${analysis.analysisResult?.generalInfo?.policyName || "סריקת פוליסה"}`,
        time: format(new Date(analysis.createdAt), "dd.MM.yy HH:mm", { locale: he }),
        color: "bg-blue-100 text-blue-600",
      });
    });

    invoices?.slice(0, 3).forEach((invoice) => {
      const amount = Number(invoice.amount ?? 0);
      const flowDirection = getInvoiceFlowDirection(invoice);
      items.push({
        id: `invoice-${invoice.id}`,
        icon: <Mail className="size-4" />,
        text: `${flowDirection === "income" ? "הכנסה" : flowDirection === "expense" ? "חיוב" : "מסמך"} ${invoice.provider}: ₪${amount.toLocaleString("he-IL")}`,
        time: invoice.invoiceDate ? format(new Date(invoice.invoiceDate), "dd.MM.yy", { locale: he }) : "",
        color: flowDirection === "income" ? "bg-emerald-100 text-emerald-600" : "bg-violet-100 text-violet-600",
      });
    });

    insuranceDiscoveries?.slice(0, 2).forEach((discovery) => {
      items.push({
        id: `discovery-${discovery.id}`,
        icon: <Bell className="size-4" />,
        text: discovery.summary || `${discovery.provider || "גוף ביטוחי"} שלח מסמך ביטוחי`,
        time: discovery.documentDate ? format(new Date(discovery.documentDate), "dd.MM.yy", { locale: he }) : "",
        color: "bg-amber-100 text-amber-600",
      });
    });

    return items.slice(0, 5);
  }, [analysisRows, insuranceDiscoveries, invoices]);

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
                : "/savings",
        cta:
          action.type === "savings"
            ? "פתח חיסכון"
            : action.type === "gap"
              ? "פתח מפת ביטוח"
              : action.type === "renewal"
                ? "בדוק חידוש"
                : "לבדיקה",
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
              : `נמצאו ${insuranceDiscoveries?.length ?? 0} ממצאים ביטוחיים ב-Gmail`,
        description:
          priorityDiscovery.actionHint
          || priorityDiscovery.summary
          || "לומי זיהה מהמייל פרמיות, חידושים או מסמכים ביטוחיים שיכולים לעזור לבנות את התיק.",
        path: "/money",
        cta: priorityDiscovery.artifactType === "renewal_notice" ? "בדוק חידוש" : "פתח גילויים",
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
        description: "כדאי לעבור על הפוליסות כדי להבין אם יש כיסוי כפול או כסף שיוצא פעמיים.",
        path: "/insurance",
        cta: "בדוק חפיפות",
        tone: "warning",
      });
    }

    overview.coverageGaps.slice(0, 2).forEach((gap) => {
      items.push({
        id: gap.id,
        title: gap.title,
        description: gap.description,
        path: gap.category ? `/insurance/category/${gap.category}` : "/insurance",
        cta: "לבדיקה",
        tone: gap.tone === "warning" ? "warning" : "info",
      });
    });

    if (overview.renewals[0]) {
      items.push({
        id: `renewal-${overview.renewals[0].sessionId}`,
        title: `${overview.renewals[0].policyName} מתקרבת לחידוש`,
        description: `נשארו ${overview.renewals[0].daysUntilRenewal} ימים לבדוק אם התנאים עדיין מתאימים למשפחה.`,
        path: `/insurance/${overview.renewals[0].sessionId}`,
        cta: "פתח פוליסה",
        tone: "info",
      });
    }

    if (familyMembers.length > 0 && (coverageSnapshot.reviewCount > 0 || coverageSnapshot.missingCount > 0)) {
      items.push({
        id: "family-coverage",
        title: "מפת הכיסוי המשפחתית דורשת תשומת לב",
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
    familyMembers.length,
    gmailConnected,
    insuranceDiscoveries,
    overview.coverageGaps,
    overview.duplicateGroups,
    overview.renewals,
  ]);

  const chartData = monthlySummary?.flatMap((month) => month.categories.map((category) => ({
    name: category.category,
    amount: category.total,
  }))) ?? [];
  const aggregatedChartData = Object.values(
    chartData.reduce<Record<string, { name: string; amount: number }>>((acc, item) => {
      if (!acc[item.name]) acc[item.name] = { name: item.name, amount: 0 };
      acc[item.name].amount += item.amount;
      return acc;
    }, {}),
  );

  if (!user) return null;
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

  return (
    <div className="page-container space-y-6" data-testid="insurance-command-center">
      <div className="animate-fade-in-up relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#1a2744] via-[#1e3a5f] to-[#2563eb] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-20%,rgba(255,255,255,0.14),transparent_60%)]" />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur-sm">
                <Shield className="size-4" />
                מרכז הפיקוד הביטוחי של המשפחה
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">שלום, {firstName}</h1>
                <p className="text-sm text-white/75 mt-2 max-w-2xl leading-relaxed">
                  כאן רואים מה מכוסה, מה מתחדש, איפה יש חפיפות, ואיזה צעדים כדאי לעשות עכשיו כדי לחזק את התיק הביטוחי של הבית.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="bg-white/15 text-white border-white/15">
                  {coverageSnapshot.householdSize} נפשות בתמונה
                </Badge>
                <Badge variant="secondary" className="bg-white/15 text-white border-white/15">
                  {gmailConnected ? "Gmail מחובר" : "Gmail עדיין לא מחובר"}
                </Badge>
                {inFlightPolicies.length > 0 && (
                  <Badge variant="secondary" className="bg-white/15 text-white border-white/15">
                    {inFlightSummary?.totalFiles
                      ? `${inFlightSummary.visibleFiles}/${inFlightSummary.totalFiles} בעיבוד`
                      : `${inFlightPolicies.length} פוליסות בעיבוד`}
                  </Badge>
                )}
              </div>
              {gmailConnected && (
                <div
                  className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm"
                  data-testid="dashboard-gmail-connection"
                >
                  <p className="text-[11px] uppercase tracking-wide text-white/55">חשבון Gmail מחובר</p>
                  <p className="mt-1 text-sm font-semibold break-all">{gmailConnectionSummary.label}</p>
                  <p className="text-xs text-white/65 mt-1">{gmailConnectionSummary.detail}</p>
                </div>
              )}
            </div>

            <div className="w-full sm:w-auto min-w-[220px] rounded-2xl bg-white/10 p-4 backdrop-blur-sm border border-white/15">
              <p className="text-xs text-white/70">ציון תיק ביטוחי</p>
              <div className="mt-3">
                <HealthScoreRing score={insuranceScore} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="animate-fade-in-up stagger-1 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                <Shield className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פוליסות פעילות</p>
                <p className="text-2xl font-bold">{activePolicies.length}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {coverageSnapshot.categoriesWithData} קטגוריות עם מסמכים מזוהים
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-2 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פרמיה חודשית מזוהה</p>
                <p className="text-2xl font-bold">{insuranceSpendLabel}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {insuranceInvoiceTotal > 0 ? `חיובי ביטוח מהמייל: ${formatInsuranceCurrency(insuranceInvoiceTotal)}` : "השלם מסמכים או חבר Gmail כדי לחזק את התמונה"}
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-3 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <PiggyBank className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">פוטנציאל חיסכון</p>
                <p className="text-2xl font-bold">{potentialSavingsLabel}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {savingsReport?.opportunities?.length ?? 0} הזדמנויות פתוחות · {dashboardSummary?.topActions?.length ?? 0} פעולות מומלצות
            </p>
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-4 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
                <Users className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">משפחה וכיסוי</p>
                <p className="text-2xl font-bold">{coverageSnapshot.householdSize}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {coverageSnapshot.reviewCount} שיוכים לבדיקה, {coverageSnapshot.missingCount} פערי מידע
            </p>
          </CardContent>
        </Card>
      </div>

      {inFlightPolicies.length > 0 && (
        <AnalysisQueueProgressCard
          analyses={inFlightPolicies}
          onOpenStatus={() => setLocation(`/insurance/${inFlightPolicies[0].sessionId}`)}
        />
      )}

      <MonthlyReportCard
        report={monitoringReport}
        isRefreshing={monitoringRefreshMutation.isPending}
        onRefresh={() => monitoringRefreshMutation.mutate({ daysBack: 120, scanFirst: true })}
        onOpenSavings={() => setLocation("/savings")}
      />

      <GmailPolicyDiscovery
        returnTo="/"
        title="גילוי פוליסות אוטומטי"
        description="מסמכי פוליסה עם PDF שזוהו ב-Gmail ומוכנים לייבוא לניתוח."
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-4">
        <Card className="animate-fade-in-up">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-500" />
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
                <p className="text-sm font-medium">המערכת עדיין בונה את תמונת הביטוח הראשונית</p>
                <p className="text-xs text-muted-foreground mt-1">
                  העלה פוליסה או חבר Gmail כדי שלומי יתחיל לייצר פעולות והמלצות מדויקות יותר.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">תקציר משפחתי</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">נפשות בתמונה</p>
                <p className="text-xl font-bold mt-1">{coverageSnapshot.householdSize}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">קטגוריות עם נתונים</p>
                <p className="text-xl font-bold mt-1">{coverageSnapshot.categoriesWithData}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">שיוכים לבדיקה</p>
                <p className="text-xl font-bold mt-1">{coverageSnapshot.reviewCount}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">פערי מידע</p>
                <p className="text-xl font-bold mt-1">{coverageSnapshot.missingCount}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              במסך `המשפחה שלי` אפשר לראות מי דורש השלמת מידע, איפה יש כיסויים שצריך לבדוק, ואיך לשאול את לומי על הילדים והבית מתוך הקשר מלא.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => setLocation("/insurance-map")} className="gap-1.5">
                <Users className="size-4" />
                למפת הביטוח
              </Button>
              <Button variant="outline" onClick={() => setLocation("/chat")} className="gap-1.5">
                <MessageSquare className="size-4" />
                שאל את לומי
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4 animate-fade-in-up stagger-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-amber-500" />
            פעולות מהירות
          </h3>
          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => setLocation("/insurance/new")}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#1a1b3d] to-[#2563eb] p-5 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
            >
              <div className="relative z-10">
                <div className="size-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
                  <Plus className="size-5 text-white" />
                </div>
                <p className="text-base font-bold text-white">סריקת פוליסה חדשה</p>
                <p className="text-xs text-white/60 mt-1">העלה פוליסה ותן ללומי לקרוא את הכיסוי לעומק</p>
              </div>
              <ArrowLeft className="absolute left-4 bottom-5 size-5 text-white/30 group-hover:text-white/60 transition-colors" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLocation("/insurance-map")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#155e75] to-[#0891b2] p-4 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
              >
                <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                  <Users className="size-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">מפת ביטוח</p>
                <p className="text-[11px] text-white/50 mt-0.5">כיסויים ופערים</p>
              </button>
              <button
                onClick={() => setLocation("/chat")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#4c1d95] to-[#7c3aed] p-4 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
              >
                <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                  <MessageSquare className="size-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">לומי</p>
                <p className="text-[11px] text-white/50 mt-0.5">שאל על כל התיק</p>
              </button>
              <button
                onClick={() => setLocation("/savings")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#7c2d12] to-[#ea580c] p-4 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
              >
                <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                  <PiggyBank className="size-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">חיסכון ופעולות</p>
                <p className="text-[11px] text-white/50 mt-0.5">משימות ודוח חיסכון</p>
              </button>
              <button
                onClick={() => setLocation(gmailConnected ? "/reminders" : "/money")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#854d0e] to-[#d97706] p-4 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
              >
                <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                  {gmailConnected ? <Calendar className="size-4 text-white" /> : <Mail className="size-4 text-white" />}
                </div>
                <p className="text-sm font-bold text-white">{gmailConnected ? "תזכורות" : "חבר Gmail"}</p>
                <p className="text-[11px] text-white/50 mt-0.5">{gmailConnected ? "חידושים ומועדים" : "לגילוי מסמכים"}</p>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4 animate-fade-in-up stagger-6">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            פעילות אחרונה
          </h3>
          {recentActivity.length > 0 ? (
            <div className="space-y-2">
              {recentActivity.map((item) => (
                <Card key={item.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${item.color}`}>
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.text}</p>
                        <p className="text-[11px] text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                  <Clock className="size-6 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">עדיין אין פעילות</p>
                <p className="text-xs text-muted-foreground/60 mt-1">התחל בהעלאת פוליסה או חיבור Gmail</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {aggregatedChartData.length > 0 && (
        <Card className="animate-fade-in-up">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="size-4 text-muted-foreground" />
                מיילים ומסמכי ביטוח
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/money")}
                className="text-xs gap-1"
              >
                צפה בהכל
                <ArrowLeft className="size-3" />
              </Button>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={aggregatedChartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(value) => `₪${value}`} />
                <Tooltip
                  formatter={(value: number) => [`₪${value.toLocaleString("he-IL")}`, "סכום"]}
                  contentStyle={{ direction: "rtl", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="amount" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {totalMonthlyExpenses > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                סך חיובי הביטוח החודשיים שזוהו במייל: {formatInsuranceCurrency(totalMonthlyExpenses)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {activePolicies.length > 0 && (
        <Card className="animate-fade-in-up">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4 text-muted-foreground" />
                פוליסות אחרונות בתיק
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/insurance")}
                className="text-xs gap-1"
              >
                צפה בהכל
                <ArrowLeft className="size-3" />
              </Button>
            </div>
            <div className="space-y-2">
              {activePolicies.slice(0, 3).map((policy) => (
                <button
                  key={policy.sessionId}
                  onClick={() => setLocation(`/insurance/${policy.sessionId}`)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-muted/50 transition-colors text-right"
                >
                  <div className="size-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                    <FileText className="size-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{policy.policyName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {policy.coverageCount} כיסויים · {policy.premiumLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle className="size-3.5" />
                    <span className="text-xs">מוכן</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

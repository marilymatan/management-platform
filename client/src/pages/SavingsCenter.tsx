import { useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import type { InsuranceCategory } from "@shared/insurance";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInsuranceCurrency, insuranceCategoryLabels } from "@/lib/insuranceOverview";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Loader2,
  PiggyBank,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";

type Opportunity = {
  id: number;
  title: string;
  description: string;
  type: "duplicate" | "overpriced" | "unnecessary" | "gap";
  priority: "high" | "medium" | "low";
  monthlySaving: number;
  annualSaving: number;
  actionSteps: string[];
  status: "open" | "completed" | "dismissed";
};

type ActionItem = {
  id: number;
  title: string;
  description: string;
  type: "savings" | "renewal" | "gap" | "monitoring";
  priority: "high" | "medium" | "low";
  potentialSaving: number;
  instructions: string[];
  status: "pending" | "completed" | "dismissed";
};

type SavingsReport = {
  overview: string;
  totalMonthlySaving: number;
  totalAnnualSaving: number;
  savedSoFar: number;
  opportunities: Opportunity[];
  actionItems: ActionItem[];
  policyCount: number;
  categoriesWithData: InsuranceCategory[];
};

function getPriorityLabel(priority: "high" | "medium" | "low") {
  if (priority === "high") return "דחיפות גבוהה";
  if (priority === "medium") return "דחיפות בינונית";
  return "דחיפות רגילה";
}

function getPriorityWeight(priority: "high" | "medium" | "low") {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function getPriorityBadgeClassName(priority: "high" | "medium" | "low") {
  if (priority === "high") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (priority === "medium") return "border-warning/30 bg-warning/20 text-warning-foreground";
  return "border-primary/15 bg-primary/5 text-primary";
}

function getTypeLabel(type: Opportunity["type"]) {
  if (type === "duplicate") return "חפיפה";
  if (type === "overpriced") return "התייקרות";
  if (type === "unnecessary") return "לא הכרחי";
  return "פער כיסוי";
}

function getOpportunityTypeBadgeClassName(type: Opportunity["type"]) {
  if (type === "duplicate") return "border-warning/30 bg-warning/20 text-warning-foreground";
  if (type === "overpriced") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (type === "unnecessary") return "border-primary/15 bg-primary/5 text-primary";
  return "border-success/20 bg-success/10 text-success";
}

function getActionTypeLabel(type: ActionItem["type"]) {
  if (type === "renewal") return "חידוש";
  if (type === "gap") return "פער";
  if (type === "monitoring") return "ניטור";
  return "חיסכון";
}

function getActionTypeBadgeClassName(type: ActionItem["type"]) {
  if (type === "renewal") return "border-warning/30 bg-warning/20 text-warning-foreground";
  if (type === "gap") return "border-destructive/20 bg-destructive/10 text-destructive";
  if (type === "monitoring") return "border-primary/15 bg-primary/5 text-primary";
  return "border-success/20 bg-success/10 text-success";
}

function getActionStatusLabel(status: ActionItem["status"]) {
  if (status === "completed") return "הושלם";
  if (status === "dismissed") return "נדחה";
  return "פתוח";
}

function getActionStatusWeight(status: ActionItem["status"]) {
  if (status === "pending") return 0;
  if (status === "completed") return 1;
  return 2;
}

function getActionStatusBadgeClassName(status: ActionItem["status"]) {
  if (status === "completed") return "border-success/20 bg-success/10 text-success";
  if (status === "dismissed") return "border-border bg-muted/40 text-muted-foreground";
  return "border-primary/20 bg-primary/10 text-primary";
}

function getFallbackOverview(report?: SavingsReport) {
  const trimmedOverview = report?.overview?.trim();
  if (trimmedOverview) {
    return trimmedOverview;
  }

  if ((report?.policyCount ?? 0) > 0) {
    return `זוהו כבר ${report?.policyCount} פוליסות פעילות. המסך הזה מתמלא רק כשיש חפיפה, פער, חידוש קרוב או שינוי חיוב שמצריך פעולה.`;
  }

  return "כאן יופיעו הזדמנויות חיסכון, פעולות מומלצות ושינויי ניטור ברגע שלומי יזהה מספיק מידע מהפוליסות והמסמכים שלך.";
}

function StepList({
  items,
  itemKeyPrefix,
}: {
  items: string[];
  itemKeyPrefix: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={`${itemKeyPrefix}-${index}`}
          className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-3"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {index + 1}
          </span>
          <p className="text-sm leading-relaxed text-foreground">{item}</p>
        </div>
      ))}
    </div>
  );
}

export default function SavingsCenter() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const queryOptions = {
    enabled: !!user,
    retry: 1,
    refetchOnWindowFocus: false,
  } as const;
  const reportQuery = trpc.savings.getReport.useQuery(undefined, queryOptions);
  const actionsQuery = trpc.actions.list.useQuery(undefined, queryOptions);
  const monitoringQuery = trpc.monitoring.getMonthlyReport.useQuery(undefined, queryOptions);

  const completeOpportunityMutation = trpc.savings.completeOpportunity.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.savings.getReport.invalidate(),
        utils.actions.list.invalidate(),
        utils.monitoring.getMonthlyReport.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const dismissOpportunityMutation = trpc.savings.dismissOpportunity.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.savings.getReport.invalidate(),
        utils.actions.list.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const completeActionMutation = trpc.actions.complete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.actions.list.invalidate(),
        utils.savings.getReport.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  const dismissActionMutation = trpc.actions.dismiss.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.actions.list.invalidate(),
        utils.savings.getReport.invalidate(),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });

  const reportData = reportQuery.data as SavingsReport | undefined;
  const opportunities = (reportData?.opportunities ?? []) as Opportunity[];
  const actionItems = (actionsQuery.data ?? reportData?.actionItems ?? []) as ActionItem[];
  const openOpportunities = opportunities.filter((opportunity) => opportunity.status === "open");
  const sortedActionItems = useMemo(() => {
    return [...actionItems].sort((left, right) => {
      const statusDifference = getActionStatusWeight(left.status) - getActionStatusWeight(right.status);
      if (statusDifference !== 0) {
        return statusDifference;
      }

      const priorityDifference = getPriorityWeight(left.priority) - getPriorityWeight(right.priority);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return right.potentialSaving - left.potentialSaving;
    });
  }, [actionItems]);
  const pendingActions = sortedActionItems.filter((action) => action.status === "pending");
  const completedActions = sortedActionItems.filter((action) => action.status === "completed");
  const dismissedActions = sortedActionItems.filter((action) => action.status === "dismissed");
  const archivedActions = sortedActionItems.filter((action) => action.status !== "pending");
  const hasPolicies = (reportData?.policyCount ?? 0) > 0;
  const categoriesWithData = reportData?.categoriesWithData ?? [];
  const overviewText = getFallbackOverview(reportData);
  const isRefreshing = reportQuery.isRefetching || actionsQuery.isRefetching || monitoringQuery.isRefetching;
  const highPriorityOpportunities = openOpportunities.filter((opportunity) => opportunity.priority === "high").length;
  const highPriorityActions = pendingActions.filter((action) => action.priority === "high").length;
  const highPrioritySignals = highPriorityOpportunities + highPriorityActions;

  const retryQueries = async () => {
    await Promise.all([
      reportQuery.refetch(),
      actionsQuery.refetch(),
      monitoringQuery.refetch(),
    ]);
  };

  const leadOpportunity = useMemo(() => {
    return [...openOpportunities].sort((left, right) => {
      const priorityDifference = getPriorityWeight(left.priority) - getPriorityWeight(right.priority);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return right.monthlySaving - left.monthlySaving;
    })[0];
  }, [openOpportunities]);
  const leadAction = pendingActions[0];

  const groupedOpportunities = useMemo(() => {
    const grouped = [...openOpportunities]
      .sort((left, right) => {
        const priorityDifference = getPriorityWeight(left.priority) - getPriorityWeight(right.priority);
        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return right.monthlySaving - left.monthlySaving;
      })
      .reduce<Record<Opportunity["type"], Opportunity[]>>((acc, opportunity) => {
        if (!acc[opportunity.type]) {
          acc[opportunity.type] = [];
        }
        acc[opportunity.type].push(opportunity);
        return acc;
      }, {} as Record<Opportunity["type"], Opportunity[]>);

    return Object.entries(grouped)
      .map(([type, items]) => {
        const typedItems = items as Opportunity[];
        return {
          type: type as Opportunity["type"],
          label: getTypeLabel(type as Opportunity["type"]),
          items: typedItems,
          totalMonthlySaving: typedItems.reduce((sum, opportunity) => sum + opportunity.monthlySaving, 0),
          totalAnnualSaving: typedItems.reduce((sum, opportunity) => sum + opportunity.annualSaving, 0),
          highPriorityCount: typedItems.filter((opportunity) => opportunity.priority === "high").length,
        };
      })
      .sort((left, right) => {
        const savingsDifference = right.totalMonthlySaving - left.totalMonthlySaving;
        if (savingsDifference !== 0) {
          return savingsDifference;
        }

        return getPriorityWeight(left.items[0]?.priority ?? "low") - getPriorityWeight(right.items[0]?.priority ?? "low");
      });
  }, [openOpportunities]);

  const summaryStats = [
    {
      label: "פוטנציאל חיסכון חודשי",
      value: formatInsuranceCurrency(reportData?.totalMonthlySaving ?? 0),
      helper:
        openOpportunities.length > 0
          ? `${openOpportunities.length} הזדמנויות פתוחות כרגע`
          : hasPolicies
            ? "אין כרגע חיסכון פתוח לטיפול"
            : "ממתין לנתונים כדי לזהות חיסכון",
      icon: PiggyBank,
      toneClassName: "bg-primary/10 text-primary",
    },
    {
      label: "פוטנציאל שנתי",
      value: formatInsuranceCurrency(reportData?.totalAnnualSaving ?? 0),
      helper:
        (reportData?.totalAnnualSaving ?? 0) > 0
          ? "אם סוגרים את כל ההזדמנויות שזוהו"
          : "יתעדכן כשיזוהו חפיפה או התייקרות",
      icon: TrendingDown,
      toneClassName: "bg-warning/20 text-warning-foreground",
    },
    {
      label: "חסכת עד כה",
      value: formatInsuranceCurrency(reportData?.savedSoFar ?? 0),
      helper:
        completedActions.length > 0
          ? `${completedActions.length} פעולות כבר הושלמו`
          : "החיסכון בפועל יתמלא עם סגירת פעולות",
      icon: Wallet,
      toneClassName: "bg-success/10 text-success",
    },
    {
      label: "מוקדים דחופים",
      value: highPrioritySignals.toLocaleString("he-IL"),
      helper:
        highPrioritySignals > 0
          ? "משלבים הזדמנויות חיסכון ופעולות טיפול"
          : hasPolicies
            ? "אין כרגע איתותים דחופים"
            : "אין עדיין מספיק נתונים",
      icon: AlertCircle,
      toneClassName: "bg-destructive/10 text-destructive",
    },
  ] as const;

  const renderActionCard = (action: ActionItem) => {
    return (
      <div key={action.id} className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-semibold">{action.title}</p>
                <Badge variant="outline" className={getActionTypeBadgeClassName(action.type)}>
                  {getActionTypeLabel(action.type)}
                </Badge>
                <Badge variant="outline" className={getPriorityBadgeClassName(action.priority)}>
                  {getPriorityLabel(action.priority)}
                </Badge>
                <Badge variant="outline" className={getActionStatusBadgeClassName(action.status)}>
                  {getActionStatusLabel(action.status)}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{action.description}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-start sm:text-end">
              <p className="text-xs text-muted-foreground">השפעה צפויה</p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {action.potentialSaving > 0 ? `${formatInsuranceCurrency(action.potentialSaving)} לחודש` : "ללא חיסכון ישיר"}
              </p>
            </div>
          </div>

          <StepList items={action.instructions} itemKeyPrefix={`action-${action.id}`} />

          {action.status === "pending" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                onClick={() => completeActionMutation.mutate({ actionId: action.id })}
                disabled={completeActionMutation.isPending || dismissActionMutation.isPending}
                className="gap-1.5"
              >
                <CheckCircle2 className="size-4" />
                הושלם
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dismissActionMutation.mutate({ actionId: action.id })}
                disabled={completeActionMutation.isPending || dismissActionMutation.isPending}
              >
                דחה
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading || (user && (reportQuery.isLoading || actionsQuery.isLoading))) {
    return (
      <div className="page-container">
        <Card className="overflow-hidden border-border/70">
          <CardContent className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Loader2 className="size-5 animate-spin" />
            </div>
            <div className="space-y-1 text-start">
              <p className="font-medium text-foreground">בונה את מרכז החיסכון והפעולות...</p>
              <p className="text-sm text-muted-foreground">אוסף כרגע הזדמנויות, חידושים ותמונת ניטור עדכנית.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (reportQuery.error && !reportData) {
    return (
      <div className="page-container">
        <Card data-testid="savings-center-error">
          <CardContent className="py-10 text-center space-y-3">
            <div className="size-12 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
              <AlertCircle className="size-6" />
            </div>
            <p className="text-base font-semibold">לא הצלחנו לטעון את מרכז החיסכון</p>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              במקום להציג מסך ריק, לומי תעדכן כאן אם יש חיסכון, פערים או משימות פתוחות. כרגע הטעינה נכשלה ואפשר לנסות שוב.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
              <Button variant="outline" onClick={() => setLocation("/insurance")}>
                למסך הביטוחים
              </Button>
              <Button onClick={() => void retryQueries()}>
                נסה שוב
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6" data-testid="savings-center-page">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card
          className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/10 via-background to-warning/20"
          data-testid="savings-center-hero"
        >
          <CardContent className="space-y-5 pt-6 pb-6 lg:pt-7 lg:pb-7">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/10 bg-background/80 px-3 py-1 text-xs font-medium text-primary">
              <PiggyBank className="size-4" />
              חיסכון ופעולות
            </div>

            <div className="space-y-3">
              <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">איפה אפשר לחסוך ואיזה צעדים עושים עכשיו</h1>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                זה המקום שבו לומי מתרגמת את התיק הביטוחי למשימות ברורות, חיסכון פוטנציאלי, וניטור חודשי מתמשך.
              </p>
            </div>

            <div className="rounded-2xl border border-primary/10 bg-background/85 p-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{overviewText}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {hasPolicies && <Badge variant="outline">{reportData?.policyCount} פוליסות פעילות</Badge>}
              {highPrioritySignals > 0 && (
                <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                  {highPrioritySignals} מוקדים דורשים תשומת לב
                </Badge>
              )}
              {categoriesWithData.map((category) => (
                <Badge key={category} variant="outline">
                  {insuranceCategoryLabels[category]}
                </Badge>
              ))}
            </div>

            {monitoringQuery.data?.summary ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                {monitoringQuery.data.summary}
              </div>
            ) : actionsQuery.error ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                לא הצלחנו לרענן כרגע את רשימת הפעולות, אז לומי מציגה כאן את נתוני הגיבוי שכבר הופקו בדוח החיסכון.
              </div>
            ) : monitoringQuery.error ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
                לא הצלחנו לטעון כרגע את סיכום הניטור החודשי, אבל נתוני החיסכון והפעולות כבר זמינים.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border/70 bg-background/95" data-testid="savings-center-highlight-card">
          <CardContent className="space-y-4 pt-6 pb-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">תמונת מצב עכשיו</h2>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {openOpportunities.length > 0
                  ? `לומי זיהתה ${openOpportunities.length} הזדמנויות חיסכון פתוחות ו-${pendingActions.length} פעולות שממשיכות את העבודה.`
                  : hasPolicies
                    ? "התיק כבר נסרק, וכרגע המסך משמש בעיקר לניטור שוטף כדי לזהות חידושים, פערים והתייקרויות בזמן."
                    : "כשהמסמכים והפוליסות יגיעו, זה יהיה המקום לראות את ההזדמנות הכי משמעותית ואת הצעד הבא."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3" data-testid="savings-center-summary-strip">
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">חיסכון מזוהה עכשיו</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{formatInsuranceCurrency(reportData?.totalMonthlySaving ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">פוטנציאל חודשי</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                <p className="text-xs text-muted-foreground">פעולות פתוחות</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{pendingActions.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">ממתינות לטיפול</p>
              </div>
            </div>

            <div
              className={`rounded-2xl border p-4 ${leadOpportunity ? "border-primary/15 bg-primary/5" : "border-border/70 bg-muted/30"}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-medium text-muted-foreground">הזדמנות מרכזית</p>
                  {leadOpportunity ? (
                    <Badge variant="outline" className={getPriorityBadgeClassName(leadOpportunity.priority)}>
                      {getPriorityLabel(leadOpportunity.priority)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">אין פתוחות</Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">
                    {leadOpportunity
                      ? leadOpportunity.title
                      : hasPolicies
                        ? "כרגע אין הזדמנות חיסכון פתוחה"
                        : "עדיין אין מספיק נתונים כדי לייצר דוח חיסכון מלא"}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {leadOpportunity
                      ? leadOpportunity.description
                      : hasPolicies
                        ? "זה בדרך כלל אומר שהתיק נקי מחפיפות או התייקרויות שמצריכות טיפול מיידי, אבל הניטור ממשיך לעבוד ברקע."
                        : "העלאת פוליסות, חיבור Gmail או זיהוי מסמכים יעזרו ללומי לבנות תמונת חיסכון מדויקת יותר."}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {leadOpportunity ? (
                    <>
                      <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                        {formatInsuranceCurrency(leadOpportunity.monthlySaving)} לחודש
                      </Badge>
                      <Badge variant="outline">{formatInsuranceCurrency(leadOpportunity.annualSaving)} בשנה</Badge>
                      <Badge variant="outline" className={getOpportunityTypeBadgeClassName(leadOpportunity.type)}>
                        {getTypeLabel(leadOpportunity.type)}
                      </Badge>
                    </>
                  ) : hasPolicies ? (
                    <Badge variant="outline">{categoriesWithData.length || reportData?.policyCount || 0} אזורים כבר עם נתונים</Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">הפעולה הבאה שכדאי לקדם</h3>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {leadAction
                      ? leadAction.title
                      : hasPolicies
                        ? "אין כרגע משימה פתוחה"
                        : "הפעולות יופיעו אחרי זיהוי נתונים"}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {leadAction
                      ? leadAction.description
                      : hasPolicies
                        ? "ברגע שתזוהה התייקרות, חידוש קרוב או חפיפה, היא תופיע כאן עם הצעד הבא."
                        : "כדאי לחבר Gmail או להוסיף פוליסות כדי שלומי תוכל לייצר פעולות מדויקות יותר."}
                  </p>
                </div>
                {leadAction && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={getActionTypeBadgeClassName(leadAction.type)}>
                      {getActionTypeLabel(leadAction.type)}
                    </Badge>
                    <Badge variant="outline" className={getPriorityBadgeClassName(leadAction.priority)}>
                      {getPriorityLabel(leadAction.priority)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={leadAction.potentialSaving > 0 ? "border-success/20 bg-success/10 text-success" : ""}
                    >
                      {leadAction.potentialSaving > 0 ? `${formatInsuranceCurrency(leadAction.potentialSaving)} לחודש` : "ללא חיסכון ישיר"}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void retryQueries()} disabled={isRefreshing} className="gap-1.5">
                <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                רענן בדיקה
              </Button>
              <Button variant="outline" onClick={() => setLocation("/insurance")} className="gap-1.5">
                <ArrowUpRight className="size-4" />
                למסך הביטוחים
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="overflow-hidden border-border/70">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-xl ${stat.toneClassName}`}>
                    <Icon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{stat.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="report" dir="rtl" className="gap-4">
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="report" className="gap-2 rounded-lg">
            <PiggyBank className="size-4" />
            דוח חיסכון
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-2 rounded-lg">
            <CheckCircle2 className="size-4" />
            מעקב פעולות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-4">
          <Card className="border-primary/15 bg-primary/5">
            <CardContent className="pt-5 pb-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <h2 className="text-sm font-semibold">דוח החיסכון שלך</h2>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {openOpportunities.length > 0
                      ? `כרגע יש ${openOpportunities.length} הזדמנויות פתוחות, והן ממוקדות סביב ${groupedOpportunities.length} מוקדי טיפול.`
                      : hasPolicies
                        ? "כרגע אין הזדמנויות פתוחות, ולכן הדוח עובר למצב ניטור עד שזוהה שינוי חדש."
                        : "כשהמסמכים הראשונים ינותחו, כאן תופיע רשימת ההזדמנויות עם חיסכון צפוי וצעדים לביצוע."}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{formatInsuranceCurrency(reportData?.totalMonthlySaving ?? 0)} לחודש</Badge>
                  <Badge variant="outline">{formatInsuranceCurrency(reportData?.totalAnnualSaving ?? 0)} בשנה</Badge>
                  {highPriorityOpportunities > 0 && (
                    <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                      {highPriorityOpportunities} בדחיפות גבוהה
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {groupedOpportunities.length === 0 ? (
            <Card data-testid={hasPolicies ? "savings-center-report-empty-with-policies" : "savings-center-report-empty"}>
              <CardContent className="pt-8 pb-8 text-center space-y-4">
                <div className={`size-12 rounded-2xl mx-auto flex items-center justify-center ${hasPolicies ? "bg-success/10 text-success" : "bg-muted text-muted-foreground/60"}`}>
                  {hasPolicies ? <ShieldCheck className="size-6" /> : <ShieldAlert className="size-6" />}
                </div>
                <div className="space-y-2">
                  <p className="font-medium">
                    {hasPolicies ? `זיהינו כבר ${reportData?.policyCount} פוליסות, אבל אין כרגע הזדמנויות פתוחות` : "כרגע אין הזדמנויות פתוחות"}
                  </p>
                  <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    {hasPolicies
                      ? "העמוד הזה לא מציג רשימת ביטוחים מלאה. הוא מתמלא רק כשיש חפיפת כיסוי, חידוש קרוב, פער כיסוי או שינוי חיוב שמצדיקים פעולה."
                      : "ככל שיתווספו מסמכים, חידושים או שינויי חיוב, לומי תעדכן כאן חיסכון פוטנציאלי."}
                  </p>
                </div>
                {hasPolicies && categoriesWithData.length > 0 && (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {categoriesWithData.map((category) => (
                      <Badge key={category} variant="outline">
                        {insuranceCategoryLabels[category]}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
                  <Button variant="outline" onClick={() => setLocation("/insurance")} className="gap-1.5">
                    <ArrowUpRight className="size-4" />
                    למסך הביטוחים
                  </Button>
                  <Button onClick={() => void retryQueries()} className="gap-1.5" disabled={isRefreshing}>
                    <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    רענן בדיקה
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            groupedOpportunities.map((group) => (
              <Card key={group.type} className="overflow-hidden border-border/70">
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold">{group.label}</h2>
                        <Badge variant="outline">{group.items.length} הזדמנויות</Badge>
                        {group.highPriorityCount > 0 && (
                          <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
                            {group.highPriorityCount} דחופות
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {formatInsuranceCurrency(group.totalMonthlySaving)} פוטנציאל חודשי בקבוצה זו
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-start sm:text-end">
                      <p className="text-xs text-muted-foreground">פוטנציאל שנתי</p>
                      <p className="mt-1 text-lg font-bold tabular-nums">{formatInsuranceCurrency(group.totalAnnualSaving)}</p>
                    </div>
                  </div>

                  <Accordion type="single" collapsible className="w-full space-y-3">
                    {group.items.map((opportunity) => (
                      <AccordionItem
                        key={opportunity.id}
                        value={String(opportunity.id)}
                        className="rounded-2xl border border-border/70 bg-background px-4 shadow-sm last:border-b"
                      >
                        <AccordionTrigger className="py-5 hover:no-underline">
                          <div className="flex w-full flex-col gap-4 text-start">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-base font-semibold">{opportunity.title}</p>
                                  <Badge variant="outline" className={getPriorityBadgeClassName(opportunity.priority)}>
                                    {getPriorityLabel(opportunity.priority)}
                                  </Badge>
                                  <Badge variant="outline" className={getOpportunityTypeBadgeClassName(opportunity.type)}>
                                    {getTypeLabel(opportunity.type)}
                                  </Badge>
                                </div>
                                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{opportunity.description}</p>
                              </div>
                              <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3 text-start sm:text-end">
                                <p className="text-xs text-muted-foreground">פוטנציאל מיידי</p>
                                <p className="mt-1 text-xl font-bold tabular-nums">{formatInsuranceCurrency(opportunity.monthlySaving)}</p>
                                <p className="text-xs text-muted-foreground">{formatInsuranceCurrency(opportunity.annualSaving)} בשנה</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline">{opportunity.actionSteps.length} צעדים מוצעים</Badge>
                              <Badge variant="outline">{opportunity.status === "open" ? "פתוח" : opportunity.status === "completed" ? "הושלם" : "נדחה"}</Badge>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-5">
                          <Separator />
                          <StepList items={opportunity.actionSteps} itemKeyPrefix={`opportunity-${opportunity.id}`} />
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => completeOpportunityMutation.mutate({ opportunityId: opportunity.id })}
                              disabled={completeOpportunityMutation.isPending || dismissOpportunityMutation.isPending}
                              className="gap-1.5"
                            >
                              <CheckCircle2 className="size-4" />
                              סמן כהושלם
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dismissOpportunityMutation.mutate({ opportunityId: opportunity.id })}
                              disabled={completeOpportunityMutation.isPending || dismissOpportunityMutation.isPending}
                            >
                              דחה
                            </Button>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card className="border-border/70" data-testid="savings-center-actions-summary">
            <CardContent className="pt-5 pb-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">פתוחות עכשיו</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{pendingActions.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">ממתינות לביצוע</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">הושלמו</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{completedActions.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">כבר נסגרו</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">נדחו</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{dismissedActions.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">לא דורשות טיפול כרגע</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {actionItems.length === 0 ? (
            <Card data-testid={hasPolicies ? "savings-center-actions-empty-with-policies" : "savings-center-actions-empty"}>
              <CardContent className="pt-8 pb-8 text-center space-y-4">
                <div className={`size-12 rounded-2xl mx-auto flex items-center justify-center ${hasPolicies ? "bg-success/10 text-success" : "bg-muted text-muted-foreground/60"}`}>
                  <CheckCircle2 className="size-6" />
                </div>
                <div className="space-y-2">
                  <p className="font-medium">{hasPolicies ? "כרגע אין משימות פתוחות על הביטוחים שזוהו" : "אין כרגע פעולות פתוחות"}</p>
                  <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                    {hasPolicies
                      ? "זה בדרך כלל אומר שלא זוהו חידושים קרובים, פערי כיסוי, התייקרויות או הזדמנויות חיסכון שמחייבות טיפול מיידי."
                      : "כאן תופיע רשימת המשימות שנולדת מהחידושים, הפערים, החיסכון והניטור החודשי."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {pendingActions.length > 0 ? (
                <Card className="border-border/70">
                  <CardContent className="pt-5 pb-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold">מה פתוח עכשיו</h2>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          אלו הפעולות שכדאי לקדם קודם כדי לסגור פערים, למנוע התייקרויות או לממש חיסכון.
                        </p>
                      </div>
                      <Badge variant="outline">{pendingActions.length} פתוחות</Badge>
                    </div>
                    <div className="space-y-3">
                      {pendingActions.map((action) => renderActionCard(action))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border/70">
                  <CardContent className="pt-5 pb-5">
                    <p className="text-sm font-medium">אין כרגע פעולות פתוחות</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      כל הפעולות שכבר הופקו נסגרו או נדחו, ולומי תמשיך לעקוב אחרי שינויים חדשים.
                    </p>
                  </CardContent>
                </Card>
              )}

              {archivedActions.length > 0 && (
                <Card className="border-border/70">
                  <CardContent className="pt-5 pb-5 space-y-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold">טופל לאחרונה</h2>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          כך אפשר לראות בקלות מה כבר נסגר ומה נשמר רק למעקב.
                        </p>
                      </div>
                      <Badge variant="outline">{archivedActions.length}</Badge>
                    </div>
                    <div className="space-y-3">
                      {archivedActions.map((action) => renderActionCard(action))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

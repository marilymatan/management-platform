import { useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import type { InsuranceCategory } from "@shared/insurance";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { insuranceCategoryLabels } from "@/lib/insuranceOverview";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  PiggyBank,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
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

function getTypeLabel(type: Opportunity["type"]) {
  if (type === "duplicate") return "כפל";
  if (type === "overpriced") return "התייקרות";
  if (type === "unnecessary") return "לא הכרחי";
  return "פער כיסוי";
}

function getActionTypeLabel(type: ActionItem["type"]) {
  if (type === "renewal") return "חידוש";
  if (type === "gap") return "פער";
  if (type === "monitoring") return "ניטור";
  return "חיסכון";
}

function getFallbackOverview(report?: SavingsReport) {
  const trimmedOverview = report?.overview?.trim();
  if (trimmedOverview) {
    return trimmedOverview;
  }

  if ((report?.policyCount ?? 0) > 0) {
    return `זוהו כבר ${report?.policyCount} פוליסות פעילות. המסך הזה מתמלא רק כשיש כפל, פער, חידוש קרוב או שינוי חיוב שמצריך פעולה.`;
  }

  return "כאן יופיעו הזדמנויות חיסכון, פעולות מומלצות ושינויי ניטור ברגע שלומי יזהה מספיק מידע מהפוליסות והמסמכים שלך.";
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
  const completedActions = actionItems.filter((action) => action.status === "completed");
  const hasPolicies = (reportData?.policyCount ?? 0) > 0;
  const categoriesWithData = reportData?.categoriesWithData ?? [];
  const overviewText = getFallbackOverview(reportData);

  const retryQueries = async () => {
    await Promise.all([
      reportQuery.refetch(),
      actionsQuery.refetch(),
      monitoringQuery.refetch(),
    ]);
  };

  const groupedOpportunities = useMemo(() => {
    return openOpportunities.reduce<Record<string, Opportunity[]>>((acc, opportunity) => {
      const key = getTypeLabel(opportunity.type);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(opportunity);
      return acc;
    }, {});
  }, [openOpportunities]);

  if (loading || (user && (reportQuery.isLoading || actionsQuery.isLoading))) {
    return (
      <div className="page-container">
        <Card>
          <CardContent className="pt-8 pb-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            בונה את מרכז החיסכון והפעולות...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (reportQuery.error || actionsQuery.error) {
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
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
          <PiggyBank className="size-4" />
          חיסכון ופעולות
        </div>
        <h1 className="text-2xl font-bold">איפה אפשר לחסוך ואיזה צעדים עושים עכשיו</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          זה המקום שבו לומי מתרגמת את התיק הביטוחי למשימות ברורות, חיסכון פוטנציאלי, וניטור חודשי מתמשך.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">פוטנציאל חיסכון חודשי</p>
            <p className="text-2xl font-bold mt-1">₪{Math.round(reportData?.totalMonthlySaving ?? 0).toLocaleString("he-IL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">פוטנציאל שנתי</p>
            <p className="text-2xl font-bold mt-1">₪{Math.round(reportData?.totalAnnualSaving ?? 0).toLocaleString("he-IL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">חסכת עד כה</p>
            <p className="text-2xl font-bold mt-1">₪{Math.round(reportData?.savedSoFar ?? 0).toLocaleString("he-IL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">פעולות שהושלמו</p>
            <p className="text-2xl font-bold mt-1">{completedActions.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground leading-relaxed">{overviewText}</p>
              {hasPolicies && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{reportData?.policyCount} פוליסות פעילות</Badge>
                  {categoriesWithData.map((category) => (
                    <Badge key={category} variant="outline">
                      {insuranceCategoryLabels[category]}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {monitoringQuery.data?.summary ? (
              <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                {monitoringQuery.data.summary}
              </div>
            ) : monitoringQuery.error ? (
              <div className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                לא הצלחנו לטעון כרגע את סיכום הניטור החודשי, אבל נתוני החיסכון והפעולות כבר זמינים.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="report" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="report">דוח חיסכון</TabsTrigger>
          <TabsTrigger value="actions">מעקב פעולות</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-4">
          {Object.keys(groupedOpportunities).length === 0 ? (
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
                      ? "העמוד הזה לא מציג רשימת ביטוחים מלאה. הוא מתמלא רק כשיש כפל כיסוי, חידוש קרוב, פער כיסוי או שינוי חיוב שמצדיקים פעולה."
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
                  <Button onClick={() => void retryQueries()} className="gap-1.5">
                    <RefreshCw className="size-4" />
                    רענן בדיקה
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedOpportunities).map(([group, items]) => (
              <Card key={group}>
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h2 className="text-lg font-semibold">{group}</h2>
                    <Badge variant="outline">{items.length} הזדמנויות</Badge>
                  </div>
                  <Accordion type="single" collapsible className="w-full">
                    {items.map((opportunity) => (
                      <AccordionItem key={opportunity.id} value={String(opportunity.id)}>
                        <AccordionTrigger>
                          <div className="text-start">
                            <p>{opportunity.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              ₪{Math.round(opportunity.monthlySaving).toLocaleString("he-IL")} לחודש · {getPriorityLabel(opportunity.priority)}
                            </p>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4">
                          <p className="text-sm text-muted-foreground">{opportunity.description}</p>
                          <div className="space-y-2">
                            {opportunity.actionSteps.map((step, index) => (
                              <div key={`${opportunity.id}-${index}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                                {step}
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => completeOpportunityMutation.mutate({ opportunityId: opportunity.id })}
                              disabled={completeOpportunityMutation.isPending}
                              className="gap-1.5"
                            >
                              <CheckCircle2 className="size-4" />
                              סמן כהושלם
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => dismissOpportunityMutation.mutate({ opportunityId: opportunity.id })}
                              disabled={dismissOpportunityMutation.isPending}
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
            actionItems.map((action) => (
              <Card key={action.id}>
                <CardContent className="pt-5 pb-5 space-y-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-base font-semibold">{action.title}</p>
                        <Badge variant="outline">{getActionTypeLabel(action.type)}</Badge>
                        <Badge variant="outline">{getPriorityLabel(action.priority)}</Badge>
                        <Badge variant="outline">{action.status === "completed" ? "הושלם" : action.status === "dismissed" ? "נדחה" : "פתוח"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    <div className="text-sm font-medium">
                      {action.potentialSaving > 0 ? `₪${Math.round(action.potentialSaving).toLocaleString("he-IL")} לחודש` : "ללא חיסכון ישיר"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {action.instructions.map((instruction, index) => (
                      <div key={`${action.id}-${index}`} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                        {instruction}
                      </div>
                    ))}
                  </div>
                  {action.status === "pending" && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" onClick={() => completeActionMutation.mutate({ actionId: action.id })} disabled={completeActionMutation.isPending}>
                        הושלם
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => dismissActionMutation.mutate({ actionId: action.id })} disabled={dismissActionMutation.isPending}>
                        דחה
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

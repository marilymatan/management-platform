import { useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, PiggyBank, ShieldAlert } from "lucide-react";

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

export default function SavingsCenter() {
  useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();
  const reportQuery = trpc.savings.getReport.useQuery();
  const actionsQuery = trpc.actions.list.useQuery();
  const monitoringQuery = trpc.monitoring.getMonthlyReport.useQuery();

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

  const opportunities = (reportQuery.data?.opportunities ?? []) as Opportunity[];
  const actionItems = (actionsQuery.data ?? reportQuery.data?.actionItems ?? []) as ActionItem[];
  const openOpportunities = opportunities.filter((opportunity) => opportunity.status === "open");
  const completedActions = actionItems.filter((action) => action.status === "completed");

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

  if (reportQuery.isLoading || actionsQuery.isLoading) {
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
            <p className="text-2xl font-bold mt-1">₪{Math.round(reportQuery.data?.totalMonthlySaving ?? 0).toLocaleString("he-IL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">פוטנציאל שנתי</p>
            <p className="text-2xl font-bold mt-1">₪{Math.round(reportQuery.data?.totalAnnualSaving ?? 0).toLocaleString("he-IL")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">חסכת עד כה</p>
            <p className="text-2xl font-bold mt-1">₪{Math.round(reportQuery.data?.savedSoFar ?? 0).toLocaleString("he-IL")}</p>
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
          <p className="text-sm text-muted-foreground">{reportQuery.data?.overview}</p>
          {monitoringQuery.data?.summary && (
            <div className="mt-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              {monitoringQuery.data.summary}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="report" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="report">דוח חיסכון</TabsTrigger>
          <TabsTrigger value="actions">מעקב פעולות</TabsTrigger>
        </TabsList>

        <TabsContent value="report" className="space-y-4">
          {Object.keys(groupedOpportunities).length === 0 ? (
            <Card>
              <CardContent className="pt-8 pb-8 text-center space-y-3">
                <ShieldAlert className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="font-medium">כרגע אין הזדמנויות פתוחות</p>
                <p className="text-sm text-muted-foreground">ככל שיתווספו מסמכים, חידושים או שינויי חיוב, לומי תעדכן כאן חיסכון פוטנציאלי.</p>
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
            <Card>
              <CardContent className="pt-8 pb-8 text-center space-y-3">
                <CheckCircle2 className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="font-medium">אין כרגע פעולות פתוחות</p>
                <p className="text-sm text-muted-foreground">כאן תופיע רשימת המשימות שנולדת מהחידושים, הפערים, החיסכון והניטור החודשי.</p>
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

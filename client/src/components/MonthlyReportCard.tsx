import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowUpRight, CalendarDays, RefreshCw } from "lucide-react";

type MonthlyReportChange = {
  id: string;
  type: "new_charge" | "amount_change" | "missing_charge";
  provider: string;
  summary: string;
};

type MonthlyReportAction = {
  id?: number;
  title: string;
  description: string;
  priority?: "high" | "medium" | "low";
};

type MonthlyReportCardProps = {
  report: {
    month: string;
    scoreAtTime: number;
    scoreChange: number;
    summary: string;
    changes: MonthlyReportChange[];
    newActions: MonthlyReportAction[];
  } | null | undefined;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  onOpenSavings?: () => void;
};

const MONTH_LABELS: Record<string, string> = {
  "01": "ינואר",
  "02": "פברואר",
  "03": "מרץ",
  "04": "אפריל",
  "05": "מאי",
  "06": "יוני",
  "07": "יולי",
  "08": "אוגוסט",
  "09": "ספטמבר",
  "10": "אוקטובר",
  "11": "נובמבר",
  "12": "דצמבר",
};

function formatMonthLabel(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${MONTH_LABELS[monthNumber] ?? monthNumber} ${year}`;
}

function getChangeBadgeLabel(type: MonthlyReportChange["type"]) {
  if (type === "new_charge") return "חיוב חדש";
  if (type === "missing_charge") return "חיוב שנעלם";
  return "שינוי סכום";
}

function getPriorityLabel(priority?: "high" | "medium" | "low") {
  if (priority === "high") return "דחוף";
  if (priority === "medium") return "בינוני";
  return "רגיל";
}

export function MonthlyReportCard({
  report,
  isRefreshing = false,
  onRefresh,
  onOpenSavings,
}: MonthlyReportCardProps) {
  if (!report) {
    return null;
  }

  return (
    <Card data-testid="monthly-report-card">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <h3 className="text-base font-semibold">דוח חודשי · {formatMonthLabel(report.month)}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{report.summary}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">ציון: {report.scoreAtTime}</Badge>
              <Badge
                variant="outline"
                className={report.scoreChange >= 0 ? "border-success/20 bg-success/10 text-success" : "border-destructive/20 bg-destructive/10 text-destructive"}
              >
                {report.scoreChange >= 0 ? "+" : ""}{report.scoreChange}
              </Badge>
              <Badge variant="outline">{report.changes.length} שינויים</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-1.5">
                <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                רענן בדיקה
              </Button>
            )}
            {onOpenSavings && (
              <Button size="sm" onClick={onOpenSavings} className="gap-1.5">
                <ArrowUpRight className="size-4" />
                לחיסכון ופעולות
              </Button>
            )}
          </div>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="changes">
            <AccordionTrigger>שינויים שזוהו</AccordionTrigger>
            <AccordionContent className="space-y-3">
              {report.changes.length === 0 ? (
                <p className="text-sm text-muted-foreground">לא זוהו שינויי חיוב מהותיים בחודש הזה.</p>
              ) : (
                report.changes.map((change) => (
                  <div key={change.id} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm font-medium">{change.provider}</p>
                      <Badge variant="outline">{getChangeBadgeLabel(change.type)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{change.summary}</p>
                  </div>
                ))
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="actions">
            <AccordionTrigger>פעולות חדשות</AccordionTrigger>
            <AccordionContent className="space-y-3">
              {report.newActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין פעולות חדשות שנולדו מהבדיקה החודשית.</p>
              ) : (
                report.newActions.map((action, index) => (
                  <div key={`${action.title}-${index}`} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm font-medium">{action.title}</p>
                      <Badge variant="outline">{getPriorityLabel(action.priority)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                ))
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}

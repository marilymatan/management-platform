import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Shield,
  Wallet,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileText,
  ArrowLeft,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { he } from "date-fns/locale";

interface ReminderItem {
  id: string;
  type: "policy" | "invoice" | "document";
  title: string;
  description: string;
  dueDate: Date | null;
  daysLeft: number | null;
  priority: "high" | "medium" | "low";
  link?: string;
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "high":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 gap-1">
          <AlertTriangle className="size-3" />
          דחוף
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
          <Clock className="size-3" />
          בקרוב
        </Badge>
      );
    case "low":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
          <Calendar className="size-3" />
          עתידי
        </Badge>
      );
    default:
      return null;
  }
}

function getTypeIcon(type: string) {
  switch (type) {
    case "policy":
      return { icon: <Shield className="size-4" />, color: "bg-blue-100 text-blue-600" };
    case "invoice":
      return { icon: <Wallet className="size-4" />, color: "bg-emerald-100 text-emerald-600" };
    case "document":
      return { icon: <FileText className="size-4" />, color: "bg-violet-100 text-violet-600" };
    default:
      return { icon: <Bell className="size-4" />, color: "bg-gray-100 text-gray-600" };
  }
}

function tryParseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || dateStr === "לא צוין בפוליסה" || dateStr === "לא צוין") return null;
  try {
    const parts = dateStr.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
    if (parts) {
      const day = parseInt(parts[1]);
      const month = parseInt(parts[2]) - 1;
      let year = parseInt(parts[3]);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function Reminders() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();

  const { data: analyses } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 100 }, {
    enabled: !!user,
  });

  if (!user) return null;

  const now = new Date();
  const reminders: ReminderItem[] = [];

  const completedAnalyses = analyses?.filter(a => a.status === "completed") || [];
  completedAnalyses.forEach(analysis => {
    const endDateStr = analysis.analysisResult?.generalInfo?.endDate;
    const endDate = tryParseDate(endDateStr);
    if (endDate) {
      const daysLeft = differenceInDays(endDate, now);
      if (daysLeft > -30) {
        reminders.push({
          id: `policy-${analysis.sessionId}`,
          type: "policy",
          title: `חידוש: ${analysis.analysisResult?.generalInfo?.policyName || "פוליסה"}`,
          description: `הפוליסה ${daysLeft < 0 ? "פגה" : "מסתיימת"} ב-${endDateStr}`,
          dueDate: endDate,
          daysLeft,
          priority: daysLeft < 0 ? "high" : daysLeft <= 30 ? "medium" : "low",
          link: `/insurance/${analysis.sessionId}`,
        });
      }
    }
  });

  invoices?.forEach(inv => {
    if (inv.status === "pending" || inv.status === "overdue") {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
      const daysLeft = dueDate ? differenceInDays(dueDate, now) : null;
      reminders.push({
        id: `invoice-${inv.id}`,
        type: "invoice",
        title: `תשלום: ${inv.provider}`,
        description: inv.amount ? `₪${Number(inv.amount).toLocaleString("he-IL")}` : "סכום לא ידוע",
        dueDate,
        daysLeft,
        priority: inv.status === "overdue" ? "high" : (daysLeft !== null && daysLeft <= 7) ? "medium" : "low",
      });
    }
  });

  reminders.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    if (a.daysLeft !== null && b.daysLeft !== null) return a.daysLeft - b.daysLeft;
    if (a.daysLeft !== null) return -1;
    return 1;
  });

  const highPriority = reminders.filter(r => r.priority === "high");
  const mediumPriority = reminders.filter(r => r.priority === "medium");
  const lowPriority = reminders.filter(r => r.priority === "low");

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Bell className="size-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">תזכורות</h2>
            <p className="text-xs text-muted-foreground">חידוש פוליסות, תשלומים ומועדים חשובים</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {reminders.length > 0 && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {reminders.length} תזכורות
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-in-up stagger-1">
        <Card className={highPriority.length > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-red-600">{highPriority.length}</p>
            <p className="text-xs text-muted-foreground mt-1">דחופים</p>
          </CardContent>
        </Card>
        <Card className={mediumPriority.length > 0 ? "border-amber-200 bg-amber-50/30" : ""}>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-amber-600">{mediumPriority.length}</p>
            <p className="text-xs text-muted-foreground mt-1">בקרוב</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-blue-600">{lowPriority.length}</p>
            <p className="text-xs text-muted-foreground mt-1">עתידיים</p>
          </CardContent>
        </Card>
      </div>

      {reminders.length > 0 ? (
        <div className="space-y-3 animate-fade-in-up stagger-2">
          {reminders.map(reminder => {
            const typeInfo = getTypeIcon(reminder.type);
            return (
              <Card
                key={reminder.id}
                className={`hover:shadow-md transition-all duration-200 ${
                  reminder.priority === "high" ? "border-red-200" : ""
                }`}
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4">
                    <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${typeInfo.color}`}>
                      {typeInfo.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold truncate">{reminder.title}</p>
                        {getPriorityBadge(reminder.priority)}
                      </div>
                      <p className="text-xs text-muted-foreground">{reminder.description}</p>
                    </div>
                    <div className="text-left shrink-0">
                      {reminder.daysLeft !== null && (
                        <div className="text-center">
                          <p className={`text-lg font-bold ${
                            reminder.daysLeft < 0 ? "text-red-600" :
                            reminder.daysLeft <= 7 ? "text-amber-600" :
                            "text-foreground"
                          }`}>
                            {reminder.daysLeft < 0 ? `${Math.abs(reminder.daysLeft)}-` : reminder.daysLeft}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {reminder.daysLeft < 0 ? "ימים באיחור" : "ימים נותרו"}
                          </p>
                        </div>
                      )}
                    </div>
                    {reminder.link && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocation(reminder.link!)}
                        className="gap-1"
                      >
                        צפה
                        <ArrowLeft className="size-3" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed animate-fade-in-up stagger-2">
          <CardContent className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="size-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">אין תזכורות פתוחות</h3>
            <p className="text-sm text-muted-foreground mb-5">
              כשתעלה פוליסות או תחבר Gmail, תזכורות יופיעו כאן אוטומטית
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setLocation("/insurance/new")} className="gap-2">
                <Shield className="size-4" />
                העלה פוליסה
              </Button>
              <Button variant="outline" onClick={() => setLocation("/expenses")} className="gap-2">
                <Wallet className="size-4" />
                חבר Gmail
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

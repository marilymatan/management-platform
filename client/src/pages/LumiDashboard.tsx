import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Shield,
  Wallet,
  Bell,
  Heart,
  Plus,
  Mail,
  ArrowLeft,
  FileSearch,
  Clock,
  CheckCircle,
  FileText,
  TrendingUp,
  Sparkles,
  Calendar,
  AlertCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { he } from "date-fns/locale";

function HealthScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative size-24 mx-auto">
      <svg className="size-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/40" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
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

export default function LumiDashboard() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();

  const { data: analyses } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: monthlySummary } = trpc.gmail.getMonthlySummary.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 20 }, {
    enabled: !!user,
  });
  const { data: profileData } = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });

  const activePolicies = analyses?.filter(a => a.status === "completed") || [];
  const totalMonthlyExpenses = monthlySummary?.reduce((sum, cat) => sum + cat.total, 0) ?? 0;
  const overdueInvoices = invoices?.filter(inv => inv.status === "overdue") || [];
  const pendingInvoices = invoices?.filter(inv => inv.status === "pending") || [];

  const remindersCount = (() => {
    let count = 0;
    activePolicies.forEach(policy => {
      const endDate = policy.analysisResult?.generalInfo?.endDate;
      if (endDate && endDate !== "לא צוין בפוליסה") {
        count++;
      }
    });
    count += pendingInvoices.length;
    return count;
  })();

  const healthScore = (() => {
    let score = 50;
    if (activePolicies.length > 0) score += 15;
    if (activePolicies.length >= 3) score += 10;
    if (profileData?.dateOfBirth) score += 5;
    if (profileData?.employmentStatus) score += 5;
    if (invoices && invoices.length > 0) score += 10;
    score -= overdueInvoices.length * 5;
    if (totalMonthlyExpenses > 0) score += 5;
    return Math.max(0, Math.min(100, score));
  })();

  const chartData = monthlySummary?.flatMap(m => m.categories.map(cat => ({
    name: cat.category,
    amount: cat.total,
  }))) ?? [];
  const aggregatedChartData = Object.values(
    chartData.reduce<Record<string, { name: string; amount: number }>>((acc, item) => {
      if (!acc[item.name]) acc[item.name] = { name: item.name, amount: 0 };
      acc[item.name].amount += item.amount;
      return acc;
    }, {})
  );

  const recentActivity = (() => {
    const items: Array<{
      id: string;
      icon: React.ReactNode;
      text: string;
      time: string;
      color: string;
    }> = [];

    analyses?.slice(0, 3).forEach(analysis => {
      items.push({
        id: `analysis-${analysis.sessionId}`,
        icon: <FileSearch className="size-4" />,
        text: `פוליסה נסרקה: ${analysis.analysisResult?.generalInfo?.policyName || "סריקת פוליסה"}`,
        time: format(new Date(analysis.createdAt), "dd.MM.yy HH:mm", { locale: he }),
        color: "bg-blue-100 text-blue-600",
      });
    });

    invoices?.slice(0, 3).forEach(inv => {
      items.push({
        id: `invoice-${inv.id}`,
        icon: <Wallet className="size-4" />,
        text: `חשבונית ${inv.provider}: ₪${Number(inv.amount).toLocaleString("he-IL")}`,
        time: inv.invoiceDate ? format(new Date(inv.invoiceDate), "dd.MM.yy", { locale: he }) : "",
        color: "bg-violet-100 text-violet-600",
      });
    });

    return items.slice(0, 5);
  })();

  if (!user) return null;

  const firstName = user.name?.split(" ")[0] || "משתמש";

  return (
    <div className="page-container space-y-6">
      <div className="animate-fade-in-up">
        <h2 className="text-2xl font-bold text-foreground">
          שלום, {firstName}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          הנה הסקירה הפיננסית שלך
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="animate-fade-in-up stagger-1 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                <Shield className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ביטוחים פעילים</p>
                <p className="text-2xl font-bold">{activePolicies.length}</p>
              </div>
            </div>
            {activePolicies.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">טרם הועלו פוליסות</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-2 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">הוצאות החודש</p>
                <p className="text-2xl font-bold">
                  {totalMonthlyExpenses > 0 ? `₪${totalMonthlyExpenses.toLocaleString("he-IL")}` : "—"}
                </p>
              </div>
            </div>
            {overdueInvoices.length > 0 && (
              <div className="flex items-center gap-1 mt-2 text-red-600">
                <AlertCircle className="size-3" />
                <p className="text-[11px]">{overdueInvoices.length} באיחור</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-3 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Bell className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">תזכורות קרובות</p>
                <p className="text-2xl font-bold">{remindersCount}</p>
              </div>
            </div>
            {pendingInvoices.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">{pendingInvoices.length} תשלומים ממתינים</p>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-in-up stagger-4 overflow-hidden">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 rounded-xl bg-pink-100 flex items-center justify-center text-pink-600">
                <Heart className="size-5" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">בריאות פיננסית</p>
              </div>
            </div>
            <HealthScoreRing score={healthScore} />
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
                <p className="text-xs text-white/60 mt-1">העלה פוליסה וקבל סריקת AI מפורטת</p>
              </div>
              <ArrowLeft className="absolute left-4 bottom-5 size-5 text-white/30 group-hover:text-white/60 transition-colors" />
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLocation("/expenses")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#4c1d95] to-[#7c3aed] p-4 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
              >
                <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                  <Mail className="size-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">סריקת חשבוניות</p>
                <p className="text-[11px] text-white/50 mt-0.5">מ-Gmail</p>
              </button>
              <button
                onClick={() => setLocation("/reminders")}
                className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#854d0e] to-[#d97706] p-4 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
              >
                <div className="size-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
                  <Calendar className="size-4 text-white" />
                </div>
                <p className="text-sm font-bold text-white">תזכורות</p>
                <p className="text-[11px] text-white/50 mt-0.5">צפה בכולן</p>
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
              {recentActivity.map(item => (
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
                הוצאות לפי קטגוריה
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/expenses")}
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
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₪${v}`} />
                <Tooltip
                  formatter={(value: number) => [`₪${value.toLocaleString("he-IL")}`, "סכום"]}
                  contentStyle={{ direction: "rtl", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {activePolicies.length > 0 && (
        <Card className="animate-fade-in-up">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="size-4 text-muted-foreground" />
                ביטוחים פעילים
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
              {activePolicies.slice(0, 3).map(policy => (
                <button
                  key={policy.sessionId}
                  onClick={() => setLocation(`/insurance/${policy.sessionId}`)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 hover:bg-muted/50 transition-colors text-right"
                >
                  <div className="size-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                    <FileText className="size-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {policy.analysisResult?.generalInfo?.policyName || "פוליסה"}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {policy.analysisResult?.coverages?.length || 0} כיסויים
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle className="size-3.5" />
                    <span className="text-xs">פעיל</span>
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

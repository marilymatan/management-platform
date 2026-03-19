import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Users,
  FileText,
  Zap,
  DollarSign,
  TrendingUp,
  Activity,
  Mail,
  Receipt,
  Shield,
  Server,
  Search,
  MessageSquare,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("he-IL");
}

function formatDateTime(d: string | Date) {
  return new Date(d).toLocaleString("he-IL");
}

const CATEGORY_LABELS: Record<string, string> = {
  health: "בריאות",
  life: "חיים",
  car: "רכב",
  home: "דירה",
};

const ACTION_LABELS: Record<string, string> = {
  login: "כניסה",
  logout: "יציאה",
  login_failed: "כניסה נכשלה",
  view_analysis: "צפייה בסריקה",
  create_analysis: "יצירת סריקה",
  delete_analysis: "מחיקת סריקה",
  view_chat: "צפייה בצ׳אט",
  send_chat: "שליחת הודעה",
  upload_file: "העלאת קובץ",
  download_file: "הורדת קובץ",
  access_file: "גישה לקובץ",
  connect_gmail: "חיבור Gmail",
  disconnect_gmail: "ניתוק Gmail",
  scan_gmail: "סריקת Gmail",
  clear_invoices: "ניקוי חשבוניות",
  admin_view_users: "צפייה במשתמשים",
  admin_view_stats: "צפייה בסטטיסטיקות",
  geo_blocked: "חסימת Geo",
  rate_limited: "הגבלת קצב",
  unauthorized_access: "גישה לא מורשית",
  add_manual_expense: "הוצאה ידנית",
  update_invoice_category: "עדכון קטגוריה",
};

const ACTION_COLORS: Record<string, string> = {
  login: "bg-emerald-100 text-emerald-700",
  logout: "bg-slate-100 text-slate-600",
  login_failed: "bg-red-100 text-red-700",
  create_analysis: "bg-violet-100 text-violet-700",
  view_analysis: "bg-blue-100 text-blue-700",
  delete_analysis: "bg-rose-100 text-rose-700",
  send_chat: "bg-sky-100 text-sky-700",
  upload_file: "bg-amber-100 text-amber-700",
  connect_gmail: "bg-teal-100 text-teal-700",
  scan_gmail: "bg-cyan-100 text-cyan-700",
  geo_blocked: "bg-red-100 text-red-700",
  rate_limited: "bg-orange-100 text-orange-700",
  unauthorized_access: "bg-red-100 text-red-700",
};

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700",
  processing: "bg-blue-100 text-blue-700",
  pending: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
};

function OverviewTab() {
  const { data: stats, isLoading } = trpc.admin.dashboardStats.useQuery();
  const { data: newUsers } = trpc.admin.newUsersOverTime.useQuery();

  if (isLoading) return <DashboardSkeleton />;
  if (!stats) return null;

  const kpis = [
    { label: "סה״כ משתמשים", value: stats.totalUsers, icon: Users, color: "bg-blue-100 text-blue-600" },
    { label: "פעילים החודש", value: stats.activeUsersThisMonth, icon: TrendingUp, color: "bg-emerald-100 text-emerald-600" },
    { label: "סריקות", value: stats.totalAnalyses, icon: FileText, color: "bg-violet-100 text-violet-600" },
    { label: "הודעות צ׳אט", value: stats.totalChats, icon: MessageSquare, color: "bg-sky-100 text-sky-600" },
    { label: "סה״כ קריאות", value: stats.totalCalls, icon: Zap, color: "bg-amber-100 text-amber-600" },
    { label: "עלות כוללת", value: formatCost(stats.totalCost), icon: DollarSign, color: "bg-rose-100 text-rose-600" },
    { label: "חיבורי Gmail", value: stats.totalGmailConnections, icon: Mail, color: "bg-teal-100 text-teal-600" },
    { label: "חשבוניות", value: stats.totalInvoices, icon: Receipt, color: "bg-orange-100 text-orange-600" },
  ];

  const dailyData = stats.dailyUsage.map(d => ({
    date: d.date,
    calls: d.calls,
    tokens: d.tokens,
    cost: d.cost,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <Card key={i} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)}`} data-testid={`kpi-card-${i}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className={`size-9 rounded-xl flex items-center justify-center ${kpi.color}`}>
                  <kpi.icon className="size-4" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  <p className="text-lg font-bold">{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card data-testid="success-rate-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">אחוז הצלחה</h3>
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
            <p className="text-3xl font-bold text-emerald-600">{stats.successRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.completedAnalyses} הצליחו / {stats.errorAnalyses} נכשלו
            </p>
          </CardContent>
        </Card>
        <Card data-testid="month-cost-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">עלות החודש</h3>
              <DollarSign className="size-4 text-rose-600" />
            </div>
            <p className="text-3xl font-bold text-rose-600">{formatCost(stats.currentMonthCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              צפי חודשי: {formatCost(stats.projectedMonthlyCost)}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="tokens-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">טוקנים</h3>
              <Activity className="size-4 text-cyan-600" />
            </div>
            <p className="text-3xl font-bold text-cyan-600">{formatTokens(stats.totalTokens)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              קלט: {formatTokens(stats.totalPromptTokens)} | פלט: {formatTokens(stats.totalCompletionTokens)}
            </p>
          </CardContent>
        </Card>
      </div>

      {dailyData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card data-testid="daily-usage-chart">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-4">שימוש יומי — 30 ימים אחרונים</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [name === "tokens" ? formatTokens(value) : value, name === "tokens" ? "טוקנים" : "קריאות"]}
                    labelFormatter={(label) => new Date(label).toLocaleDateString("he-IL")}
                  />
                  <Bar dataKey="calls" fill="var(--chart-1)" radius={[4, 4, 0, 0]} name="calls" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card data-testid="daily-cost-chart">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-4">עלות יומית ($)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dailyData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value: number) => [formatCost(value), "עלות"]} labelFormatter={(label) => new Date(label).toLocaleDateString("he-IL")} />
                  <Area type="monotone" dataKey="cost" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {newUsers && newUsers.length > 0 && (
        <Card data-testid="new-users-chart">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">משתמשים חדשים — 30 ימים אחרונים</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={newUsers} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip formatter={(value: number) => [value, "משתמשים חדשים"]} labelFormatter={(label) => new Date(label).toLocaleDateString("he-IL")} />
                <Line type="monotone" dataKey="count" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function UsersTab() {
  const { data: allUsers, isLoading } = trpc.admin.allUsers.useQuery();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { data: userSummary } = trpc.admin.userSummary.useQuery(
    { userId: selectedUserId! },
    { enabled: selectedUserId !== null }
  );

  const filtered = useMemo(() => {
    if (!allUsers) return [];
    if (!search) return allUsers;
    const q = search.toLowerCase();
    return allUsers.filter(
      u => (u.name?.toLowerCase().includes(q)) || (u.email?.toLowerCase().includes(q))
    );
  }, [allUsers, search]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-4">
      <div className="relative" data-testid="user-search">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש לפי שם או אימייל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-10"
          data-testid="user-search-input"
        />
      </div>

      <Card data-testid="users-table">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">משתמש</th>
                  <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">תפקיד</th>
                  <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">הצטרף</th>
                  <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">כניסה אחרונה</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">קריאות</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">טוקנים</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">עלות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedUserId(u.id)}
                    data-testid={`user-row-${u.id}`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-sm">{u.name || "—"}</p>
                        <p className="text-[11px] text-muted-foreground">{u.email || "—"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-[11px]">
                        {u.role === "admin" ? "מנהל" : "משתמש"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(u.lastSignedIn)}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs">{Number(u.callCount)}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs">{formatTokens(Number(u.totalTokens))}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs text-rose-600">{formatCost(Number(u.totalCost))}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                        <Users className="size-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {search ? "לא נמצאו תוצאות" : "אין משתמשים רשומים עדיין"}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={selectedUserId !== null} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <SheetContent side="left" className="w-[480px] sm:max-w-[480px] overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle className="text-right">
              {userSummary?.user.name || "משתמש"}
            </SheetTitle>
          </SheetHeader>
          {userSummary && <UserDetailPanel data={userSummary} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function UserDetailPanel({ data }: { data: any }) {
  return (
    <div className="space-y-5 mt-4">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{data.user.email}</p>
        <p className="text-xs text-muted-foreground">
          הצטרף: {formatDate(data.user.createdAt)} | כניסה אחרונה: {formatDate(data.user.lastSignedIn)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[11px] text-muted-foreground">סריקות</p>
            <p className="text-lg font-bold">{data.usage.analyzeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[11px] text-muted-foreground">צ׳אט</p>
            <p className="text-lg font-bold">{data.usage.chatCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[11px] text-muted-foreground">טוקנים</p>
            <p className="text-lg font-bold">{formatTokens(data.usage.totalTokens)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2">
            <p className="text-[11px] text-muted-foreground">עלות</p>
            <p className="text-lg font-bold text-rose-600">{formatCost(data.usage.totalCost)}</p>
          </CardContent>
        </Card>
      </div>

      {data.analyses.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">סריקות ({data.analyses.length})</h4>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {data.analyses.map((a: any) => (
              <div key={a.sessionId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] ${STATUS_COLORS[a.status] || ""}`}>{a.status}</Badge>
                  {a.insuranceCategory && (
                    <span className="text-muted-foreground">{CATEGORY_LABELS[a.insuranceCategory] || a.insuranceCategory}</span>
                  )}
                </div>
                <span className="text-muted-foreground">{formatDate(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.gmail.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">חיבורי Gmail</h4>
          {data.gmail.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
              <span>{g.email}</span>
              <span className="text-muted-foreground">
                {g.lastSyncedAt ? `סנכרון אחרון: ${formatDate(g.lastSyncedAt)}` : "לא סונכרן"}
              </span>
            </div>
          ))}
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold mb-2">חשבוניות</h4>
        <p className="text-sm text-muted-foreground">{data.invoices.count} חשבוניות</p>
      </div>

      {data.recentAudit.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">פעילות אחרונה</h4>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {data.recentAudit.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                <Badge className={`text-[10px] ${ACTION_COLORS[a.action] || "bg-muted text-muted-foreground"}`}>
                  {ACTION_LABELS[a.action] || a.action}
                </Badge>
                <span className="text-muted-foreground">{formatDateTime(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityTab() {
  const { data: activity, isLoading } = trpc.admin.recentActivity.useQuery({ limit: 150 });
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!activity) return [];
    if (filter === "all") return activity;
    return activity.filter(a => a.action === filter);
  }, [activity, filter]);

  const actionOptions = useMemo(() => {
    if (!activity) return [];
    const unique = Array.from(new Set(activity.map(a => a.action)));
    return unique.sort();
  }, [activity]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-4">
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-[200px]" data-testid="activity-filter">
          <SelectValue placeholder="סינון לפי פעולה" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">הכל</SelectItem>
          {actionOptions.map(a => (
            <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card data-testid="activity-feed">
        <CardContent className="p-0">
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <div className="shrink-0">
                  <Badge className={`text-[10px] ${ACTION_COLORS[entry.action] || "bg-muted text-muted-foreground"}`}>
                    {ACTION_LABELS[entry.action] || entry.action}
                  </Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    {entry.userName || entry.userEmail || "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {entry.resource}{entry.resourceId ? ` / ${entry.resourceId}` : ""}
                  </p>
                </div>
                <div className="text-left shrink-0">
                  <Badge variant={entry.status === "allowed" ? "secondary" : "destructive"} className="text-[10px]">
                    {entry.status}
                  </Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(entry.createdAt)}</p>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Eye className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">אין פעילות להצגה</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LLMCostsTab() {
  const { data: breakdown, isLoading } = trpc.admin.llmBreakdown.useQuery();

  if (isLoading) return <DashboardSkeleton />;
  if (!breakdown) return null;

  const actionPieData = breakdown.costByAction.map(a => ({
    name: a.action === "analyze" ? "סריקה" : "צ׳אט",
    value: a.totalCost,
  }));

  const tokenPieData = breakdown.costByAction.map(a => ({
    name: a.action === "analyze" ? "סריקה" : "צ׳אט",
    prompt: a.promptTokens,
    completion: a.completionTokens,
  }));

  const topUsers = breakdown.costByUser.slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card data-testid="avg-cost-analysis">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-1">עלות ממוצעת לסריקה</h3>
            <p className="text-3xl font-bold text-violet-600">{formatCost(breakdown.avgCostPerAnalysis)}</p>
          </CardContent>
        </Card>
        <Card data-testid="avg-cost-chat">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-1">עלות ממוצעת להודעת צ׳אט</h3>
            <p className="text-3xl font-bold text-sky-600">{formatCost(breakdown.avgCostPerChat)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="cost-by-action-chart">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">עלות לפי סוג פעולה</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={actionPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {actionPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatCost(value), "עלות"]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card data-testid="top-users-cost-chart">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">עלות לפי משתמש (Top 10)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topUsers} layout="vertical" margin={{ top: 4, right: 4, bottom: 4, left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v.toFixed(3)}`} />
                <YAxis type="category" dataKey="userEmail" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={(value: number) => [formatCost(value), "עלות"]} />
                <Bar dataKey="totalCost" fill="var(--chart-4)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {breakdown.dailyCost.length > 0 && (
        <Card data-testid="daily-cost-trend">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">מגמת עלות יומית — 30 ימים</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={breakdown.dailyCost} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: number) => [formatCost(value), "עלות"]} labelFormatter={(label) => new Date(label).toLocaleDateString("he-IL")} />
                <Area type="monotone" dataKey="cost" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {breakdown.weeklyCost.length > 0 && (
        <Card data-testid="weekly-cost-trend">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">מגמה שבועית — 12 שבועות</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={breakdown.weeklyCost} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} tickFormatter={(v) => { const d = new Date(v); return `${d.getDate()}/${d.getMonth() + 1}`; }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value: number) => [formatCost(value), "עלות"]} labelFormatter={(label) => `שבוע של ${new Date(label).toLocaleDateString("he-IL")}`} />
                <Bar dataKey="cost" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold mb-3">פירוט טוקנים לפי פעולה</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right px-4 py-2 font-medium text-xs text-muted-foreground">פעולה</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">קריאות</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">טוקני קלט</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">טוקני פלט</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">סה״כ טוקנים</th>
                  <th className="text-left px-4 py-2 font-medium text-xs text-muted-foreground">עלות</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.costByAction.map(a => (
                  <tr key={a.action} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{a.action === "analyze" ? "סריקה" : "צ׳אט"}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs">{a.callCount}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs">{formatTokens(a.promptTokens)}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs">{formatTokens(a.completionTokens)}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs">{formatTokens(a.totalTokens)}</td>
                    <td className="px-4 py-2 text-left font-mono text-xs text-rose-600">{formatCost(a.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const { data: events, isLoading } = trpc.admin.securityEvents.useQuery({ limit: 100 });

  const statusBreakdown = useMemo(() => {
    if (!events) return [];
    const map: Record<string, number> = {};
    events.forEach(e => { map[e.status] = (map[e.status] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [events]);

  const actionBreakdown = useMemo(() => {
    if (!events) return [];
    const map: Record<string, number> = {};
    events.forEach(e => { map[e.action] = (map[e.action] || 0) + 1; });
    return Object.entries(map).map(([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count);
  }, [events]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card data-testid="security-total">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">אירועי אבטחה</h3>
              <Shield className="size-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold">{events?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card data-testid="security-blocked">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">נחסמו</h3>
              <XCircle className="size-4 text-red-500" />
            </div>
            <p className="text-3xl font-bold text-red-600">
              {events?.filter(e => e.status === "blocked").length ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card data-testid="security-errors">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">שגיאות</h3>
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
            <p className="text-3xl font-bold text-amber-600">
              {events?.filter(e => e.status === "error").length ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {statusBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-4">התפלגות סטטוסים</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusBreakdown.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "var(--chart-2)" : "var(--chart-1)"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-3">סוגי אירועים</h3>
              <div className="space-y-2">
                {actionBreakdown.map(a => (
                  <div key={a.action} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <Badge className={`text-[10px] ${ACTION_COLORS[a.action] || "bg-muted text-muted-foreground"}`}>
                      {ACTION_LABELS[a.action] || a.action}
                    </Badge>
                    <span className="font-mono text-xs font-bold">{a.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card data-testid="security-events-feed">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">יומן אירועי אבטחה</h3>
          </div>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {(events ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                <Badge className={`text-[10px] shrink-0 ${ACTION_COLORS[entry.action] || "bg-red-100 text-red-700"}`}>
                  {ACTION_LABELS[entry.action] || entry.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{entry.userName || entry.userEmail || "אנונימי"}</p>
                  {entry.ipAddress && (
                    <p className="text-[10px] text-muted-foreground">IP: {entry.ipAddress}</p>
                  )}
                </div>
                <div className="text-left shrink-0">
                  <Badge variant="destructive" className="text-[10px]">{entry.status}</Badge>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(entry.createdAt)}</p>
                </div>
              </div>
            ))}
            {(events ?? []).length === 0 && (
              <div className="px-4 py-12 text-center">
                <Shield className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">אין אירועי אבטחה</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SystemTab() {
  const { data: health, isLoading } = trpc.admin.systemHealth.useQuery();
  const { data: categories } = trpc.admin.categoryDistribution.useQuery();

  if (isLoading) return <DashboardSkeleton />;
  if (!health) return null;

  const statusData = health.analysisStatusDistribution.map(s => ({
    name: s.status === "completed" ? "הושלם" : s.status === "error" ? "שגיאה" : s.status === "processing" ? "בעיבוד" : "ממתין",
    value: s.count,
    status: s.status,
  }));

  const categoryData = (categories ?? health.categoryDistribution).map(c => ({
    name: CATEGORY_LABELS[c.category as string] || c.category,
    value: c.count,
  }));

  const avgDurationSec = health.avgAnalysisDurationMs / 1000;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card data-testid="avg-duration-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">זמן סריקה ממוצע</h3>
              <Clock className="size-4 text-blue-500" />
            </div>
            <p className="text-3xl font-bold">{avgDurationSec.toFixed(1)}s</p>
          </CardContent>
        </Card>
        <Card data-testid="gmail-connections-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">חיבורי Gmail</h3>
              <Mail className="size-4 text-teal-500" />
            </div>
            <p className="text-3xl font-bold">{health.gmailSyncStatus.totalConnections}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {health.gmailSyncStatus.recentSyncs24h} סנכרנו ב-24 שעות
            </p>
          </CardContent>
        </Card>
        <Card data-testid="pipeline-status-card">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">צינור סריקות</h3>
              <Server className="size-4 text-violet-500" />
            </div>
            <div className="flex gap-2 mt-1">
              {statusData.map(s => (
                <Badge key={s.status} className={`text-[10px] ${STATUS_COLORS[s.status] || ""}`}>
                  {s.name}: {s.value}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="analysis-status-chart">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">סטטוס סריקות</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                  {statusData.map((entry, i) => {
                    const colors: Record<string, string> = {
                      completed: "var(--chart-3)",
                      error: "var(--chart-1)",
                      processing: "var(--chart-4)",
                      pending: "var(--chart-5)",
                    };
                    return <Cell key={i} fill={colors[entry.status] || PIE_COLORS[i]} />;
                  })}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {categoryData.length > 0 && (
          <Card data-testid="category-chart">
            <CardContent className="pt-5">
              <h3 className="text-sm font-semibold mb-4">סריקות לפי קטגוריה</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {health.recentErrors.length > 0 && (
        <Card data-testid="recent-errors">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold">שגיאות אחרונות</h3>
            </div>
            <div className="divide-y">
              {health.recentErrors.map((err) => (
                <div key={err.sessionId} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-mono">{err.sessionId}</p>
                    <p className="text-[11px] text-muted-foreground">User ID: {err.userId}</p>
                  </div>
                  <div className="text-left">
                    <Badge variant="destructive" className="text-[10px]">שגיאה</Badge>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDateTime(err.updatedAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-muted animate-pulse" />
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-5 w-10 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="pt-5">
          <div className="h-[220px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      setLocation("/");
    }
  }, [loading, user, setLocation]);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="relative size-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  return (
    <div className="page-container" data-testid="admin-dashboard">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
        <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center">
          <BarChart3 className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">לוח בקרה — מנהל</h2>
          <p className="text-xs text-muted-foreground">ניהול וניטור מערכת לומי</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" className="animate-fade-in-up stagger-1">
        <TabsList className="w-full justify-start bg-card border p-1.5 rounded-xl gap-1 mb-6 flex-wrap" data-testid="admin-tabs">
          <TabsTrigger value="overview" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Activity className="size-4" />
            סקירה
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="size-4" />
            משתמשים
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Eye className="size-4" />
            פעילות
          </TabsTrigger>
          <TabsTrigger value="llm" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <DollarSign className="size-4" />
            עלויות
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Shield className="size-4" />
            אבטחה
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2 text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Server className="size-4" />
            מערכת
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
        <TabsContent value="llm"><LLMCostsTab /></TabsContent>
        <TabsContent value="security"><SecurityTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
      </Tabs>
    </div>
  );
}

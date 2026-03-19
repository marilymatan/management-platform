import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useEffect } from "react";
import {
  Users,
  FileText,
  Zap,
  DollarSign,
  TrendingUp,
  Activity,
  ArrowRight,
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

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-xl bg-muted ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats, isLoading: statsLoading } = trpc.admin.platformStats.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });
  const { data: allUsers, isLoading: usersLoading } = trpc.admin.allUsers.useQuery(undefined, {
    enabled: !!user && user.role === "admin",
  });

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      setLocation("/");
    }
  }, [loading, user, setLocation]);

  if (loading || statsLoading || usersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  const dailyData = (stats?.dailyUsage ?? []).map((d) => ({
    date: d.date,
    calls: Number(d.calls),
    tokens: Number(d.tokens),
  }));

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">לוח בקרה - מנהל</h1>
              <p className="text-xs text-muted-foreground">ניהול משתמשים וצריכת API</p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
            חזרה לאפליקציה
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            icon={Users}
            label="סה״כ משתמשים"
            value={stats?.totalUsers ?? 0}
            color="text-blue-500"
          />
          <StatCard
            icon={TrendingUp}
            label="פעילים החודש"
            value={stats?.activeUsersThisMonth ?? 0}
            color="text-green-500"
          />
          <StatCard
            icon={FileText}
            label="ניתוחים"
            value={stats?.totalAnalyses ?? 0}
            color="text-violet-500"
          />
          <StatCard
            icon={Zap}
            label="סה״כ קריאות"
            value={stats?.totalCalls ?? 0}
            color="text-amber-500"
          />
          <StatCard
            icon={Activity}
            label="טוקנים"
            value={formatTokens(stats?.totalTokens ?? 0)}
            color="text-cyan-500"
          />
          <StatCard
            icon={DollarSign}
            label="עלות מוערכת"
            value={formatCost(stats?.totalCost ?? 0)}
            sub="USD"
            color="text-rose-500"
          />
        </div>

        {/* Daily usage chart */}
        {dailyData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">שימוש יומי - 30 ימים אחרונים</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => {
                      const d = new Date(v);
                      return `${d.getDate()}/${d.getMonth() + 1}`;
                    }}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === "tokens" ? formatTokens(value) : value,
                      name === "tokens" ? "טוקנים" : "קריאות",
                    ]}
                    labelFormatter={(label) => {
                      const d = new Date(label);
                      return d.toLocaleDateString("he-IL");
                    }}
                  />
                  <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="calls" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Users table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">כל המשתמשים</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">משתמש</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">תפקיד</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">הצטרף</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">כניסה אחרונה</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">קריאות API</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">טוקנים</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">עלות</th>
                  </tr>
                </thead>
                <tbody>
                  {(allUsers ?? []).map((u) => (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium">{u.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.email || "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role === "admin" ? "מנהל" : "משתמש"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString("he-IL")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(u.lastSignedIn).toLocaleDateString("he-IL")}
                      </td>
                      <td className="px-4 py-3 text-left font-mono">{Number(u.callCount)}</td>
                      <td className="px-4 py-3 text-left font-mono">{formatTokens(Number(u.totalTokens))}</td>
                      <td className="px-4 py-3 text-left font-mono text-rose-600 dark:text-rose-400">
                        {formatCost(Number(u.totalCost))}
                      </td>
                    </tr>
                  ))}
                  {(allUsers ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                        אין משתמשים רשומים עדיין
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

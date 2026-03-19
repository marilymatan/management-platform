import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
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

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

const STAT_CONFIG: Array<{
  key: string;
  icon: React.ElementType;
  label: string;
  color: string;
  format?: string;
}> = [
  { key: "totalUsers", icon: Users, label: "סה״כ משתמשים", color: "bg-blue-100 text-blue-600" },
  { key: "activeUsersThisMonth", icon: TrendingUp, label: "פעילים החודש", color: "bg-emerald-100 text-emerald-600" },
  { key: "totalAnalyses", icon: FileText, label: "סריקות", color: "bg-violet-100 text-violet-600" },
  { key: "totalCalls", icon: Zap, label: "סה״כ קריאות", color: "bg-amber-100 text-amber-600" },
  { key: "totalTokens", icon: Activity, label: "טוקנים", color: "bg-cyan-100 text-cyan-600", format: "tokens" },
  { key: "totalCost", icon: DollarSign, label: "עלות מוערכת", color: "bg-rose-100 text-rose-600", format: "cost" },
];

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
      <div className="min-h-full flex items-center justify-center">
        <div className="relative size-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  const dailyData = (stats?.dailyUsage ?? []).map((d) => ({
    date: d.date,
    calls: Number(d.calls),
    tokens: Number(d.tokens),
  }));

  const getStatValue = (key: string, format?: string) => {
    const val = (stats as any)?.[key] ?? 0;
    if (format === "tokens") return formatTokens(val);
    if (format === "cost") return formatCost(val);
    return val;
  };

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
        <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center">
          <Activity className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">לוח בקרה — מנהל</h2>
          <p className="text-xs text-muted-foreground">ניהול משתמשים וצריכת API</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {STAT_CONFIG.map((stat, i) => (
          <Card key={stat.key} className={`animate-fade-in-up stagger-${Math.min(i + 1, 6)}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <div className={`size-9 rounded-xl flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="size-4" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold">{getStatValue(stat.key, stat.format)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {dailyData.length > 0 && (
        <Card className="mb-6 animate-fade-in-up stagger-6">
          <CardContent className="pt-5">
            <h3 className="text-sm font-semibold mb-4">שימוש יומי — 30 ימים אחרונים</h3>
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
                  labelFormatter={(label) => new Date(label).toLocaleDateString("he-IL")}
                />
                <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="calls" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="animate-fade-in-up">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">כל המשתמשים</h3>
          </div>
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
                {(allUsers ?? []).map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
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
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString("he-IL")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.lastSignedIn).toLocaleDateString("he-IL")}
                    </td>
                    <td className="px-4 py-3 text-left font-mono text-xs">{Number(u.callCount)}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs">{formatTokens(Number(u.totalTokens))}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs text-rose-600">
                      {formatCost(Number(u.totalCost))}
                    </td>
                  </tr>
                ))}
                {(allUsers ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                        <Users className="size-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">אין משתמשים רשומים עדיין</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

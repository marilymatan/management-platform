import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, DollarSign, MessageSquare, FileText } from "lucide-react";

function formatCost(cost: number) {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

export default function UsagePage() {
  const { user, loading } = useAuth();

  const { data: usage, isLoading } = trpc.policy.myUsage.useQuery(undefined, {
    enabled: !!user,
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="relative size-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const rows = usage?.rows ?? [];

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-6 animate-fade-in-up">
        <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center">
          <Zap className="size-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">צריכת API שלי</h2>
          <p className="text-xs text-muted-foreground">מעקב שימוש וטוקנים</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: <FileText className="size-5" />, label: "סריקות", value: usage?.analyzeCount ?? 0, color: "bg-violet-100 text-violet-600" },
          { icon: <MessageSquare className="size-5" />, label: "שאלות צ׳אט", value: usage?.chatCount ?? 0, color: "bg-blue-100 text-blue-600" },
          { icon: <Zap className="size-5" />, label: "סה״כ טוקנים", value: formatTokens(usage?.totalTokens ?? 0), color: "bg-amber-100 text-amber-600" },
          { icon: <DollarSign className="size-5" />, label: "עלות מוערכת", value: formatCost(usage?.totalCost ?? 0), color: "bg-rose-100 text-rose-600" },
        ].map((stat, i) => (
          <Card key={i} className={`animate-fade-in-up stagger-${i + 1}`}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-xl flex items-center justify-center ${stat.color}`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="animate-fade-in-up stagger-5">
        <CardContent className="p-0">
          <div className="px-5 py-4 border-b">
            <h3 className="text-sm font-semibold">היסטוריית שימוש</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">תאריך</th>
                  <th className="text-right px-4 py-3 font-medium text-xs text-muted-foreground">פעולה</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">טוקני קלט</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">טוקני פלט</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">סה״כ</th>
                  <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">עלות</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString("he-IL")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.action === "analyze" ? "default" : "secondary"} className="text-[11px]">
                        {row.action === "analyze" ? "סריקה" : "צ׳אט"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-left font-mono text-xs">{formatTokens(row.promptTokens)}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs">{formatTokens(row.completionTokens)}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs font-medium">{formatTokens(row.totalTokens)}</td>
                    <td className="px-4 py-3 text-left font-mono text-xs text-rose-600">
                      {formatCost(parseFloat(row.costUsd as string))}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                        <Zap className="size-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm text-muted-foreground">אין נתוני שימוש עדיין</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[11px] text-muted-foreground text-center mt-4">
        * העלות מחושבת לפי $0.0025 לכל 1,000 טוקנים. הנתונים לצורך מעקב בלבד.
      </p>
    </div>
  );
}

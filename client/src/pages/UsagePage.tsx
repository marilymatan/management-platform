import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { ArrowRight, Zap, DollarSign, MessageSquare, FileText } from "lucide-react";

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
  const [, setLocation] = useLocation();

  const { data: usage, isLoading } = trpc.policy.myUsage.useQuery(undefined, {
    enabled: !!user,
  });

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const rows = usage?.rows ?? [];

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">צריכת API שלי</h1>
              <p className="text-xs text-muted-foreground">מעקב שימוש וטוקנים</p>
            </div>
          </div>
          <button
            onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowRight className="h-4 w-4" />
            חזרה לדשבורד
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-violet-500" />
                <div>
                  <p className="text-xs text-muted-foreground">ניתוחים</p>
                  <p className="text-xl font-bold">{usage?.analyzeCount ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-xs text-muted-foreground">שאלות צ׳אט</p>
                  <p className="text-xl font-bold">{usage?.chatCount ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-xs text-muted-foreground">סה״כ טוקנים</p>
                  <p className="text-xl font-bold">{formatTokens(usage?.totalTokens ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-rose-500" />
                <div>
                  <p className="text-xs text-muted-foreground">עלות מוערכת</p>
                  <p className="text-xl font-bold">{formatCost(usage?.totalCost ?? 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage log table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">היסטוריית שימוש</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">תאריך</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">פעולה</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">טוקני קלט</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">טוקני פלט</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">סה״כ טוקנים</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">עלות</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString("he-IL")}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={row.action === "analyze" ? "default" : "secondary"}>
                          {row.action === "analyze" ? "ניתוח פוליסה" : "שאלת צ׳אט"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-left font-mono">{formatTokens(row.promptTokens)}</td>
                      <td className="px-4 py-3 text-left font-mono">{formatTokens(row.completionTokens)}</td>
                      <td className="px-4 py-3 text-left font-mono font-medium">{formatTokens(row.totalTokens)}</td>
                      <td className="px-4 py-3 text-left font-mono text-rose-600 dark:text-rose-400">
                        {formatCost(parseFloat(row.costUsd as string))}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        אין נתוני שימוש עדיין. נסה לנתח פוליסה!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground text-center">
          * העלות מחושבת לפי $0.0025 לכל 1,000 טוקנים. הנתונים לצורך מעקב בלבד.
        </p>
      </div>
    </div>
  );
}

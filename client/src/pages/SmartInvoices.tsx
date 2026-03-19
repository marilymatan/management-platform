import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Mail,
  Plus,
  RefreshCw,
  Unlink,
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Zap,
  ShieldCheck,
  Car,
  Building,
  Droplets,
  Wifi,
  CreditCard,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Calendar,
  Hash,
  ExternalLink,
  Trash2,
  BarChart3,
  Search,
  Filter,
  X,
  Download,
} from "lucide-react";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  תקשורת: <Wifi className="w-4 h-4" />,
  חשמל: <Zap className="w-4 h-4" />,
  מים: <Droplets className="w-4 h-4" />,
  ארנונה: <Building className="w-4 h-4" />,
  ביטוח: <ShieldCheck className="w-4 h-4" />,
  בנק: <CreditCard className="w-4 h-4" />,
  רכב: <Car className="w-4 h-4" />,
  אחר: <TrendingUp className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  תקשורת: "bg-blue-50 text-blue-700 border-blue-200",
  חשמל: "bg-yellow-50 text-yellow-700 border-yellow-200",
  מים: "bg-cyan-50 text-cyan-700 border-cyan-200",
  ארנונה: "bg-orange-50 text-orange-700 border-orange-200",
  ביטוח: "bg-green-50 text-green-700 border-green-200",
  בנק: "bg-purple-50 text-purple-700 border-purple-200",
  רכב: "bg-red-50 text-red-700 border-red-200",
  אחר: "bg-gray-50 text-gray-700 border-gray-200",
};

const CATEGORY_BAR_COLORS: Record<string, string> = {
  תקשורת: "bg-blue-500",
  חשמל: "bg-yellow-500",
  מים: "bg-cyan-500",
  ארנונה: "bg-orange-500",
  ביטוח: "bg-green-500",
  בנק: "bg-purple-500",
  רכב: "bg-red-500",
  אחר: "bg-gray-400",
};

const CATEGORY_ICON_BG: Record<string, string> = {
  תקשורת: "bg-blue-100 text-blue-600",
  חשמל: "bg-yellow-100 text-yellow-600",
  מים: "bg-cyan-100 text-cyan-600",
  ארנונה: "bg-orange-100 text-orange-600",
  ביטוח: "bg-green-100 text-green-600",
  בנק: "bg-purple-100 text-purple-600",
  רכב: "bg-red-100 text-red-600",
  אחר: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "ממתין לתשלום", color: "text-yellow-600", icon: <Clock className="w-3.5 h-3.5" /> },
  paid: { label: "שולם", color: "text-green-600", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  overdue: { label: "באיחור", color: "text-red-600", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  unknown: { label: "לא ידוע", color: "text-gray-500", icon: <Clock className="w-3.5 h-3.5" /> },
};

const ALL_CATEGORIES = ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"];
const ALL_STATUSES = ["pending", "paid", "overdue", "unknown"];

type ExtractedData = {
  description?: string;
  invoiceNumber?: string | null;
  items?: Array<{ name: string; amount: number | null }>;
  pdfUrl?: string;
  pdfFilename?: string;
  fromEmail?: string;
  currency?: string;
  amount?: number | null;
};

function getExtractedData(inv: { extractedData?: unknown }): ExtractedData {
  if (!inv.extractedData || typeof inv.extractedData !== "object") return {};
  return inv.extractedData as ExtractedData;
}

function getEffectiveAmount(inv: { amount?: string | null; extractedData?: unknown }): number {
  if (inv.amount != null) {
    const parsed = Number(inv.amount);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  const ed = getExtractedData(inv);
  if (typeof ed.amount === "number" && ed.amount > 0) return ed.amount;
  if (typeof ed.amount === "string") {
    const parsed = parseFloat(ed.amount);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function getCurrency(inv: { extractedData?: unknown }): string {
  const ed = getExtractedData(inv);
  if (ed.currency === "USD") return "$";
  if (ed.currency === "EUR") return "€";
  return "₪";
}

type Invoice = {
  id: number;
  provider?: string | null;
  category?: string | null;
  amount?: string | null;
  status?: string | null;
  subject?: string | null;
  sourceEmail?: string | null;
  invoiceDate?: string | Date | null;
  dueDate?: string | Date | null;
  extractedData?: unknown;
};

type ProviderGroup = {
  provider: string;
  invoices: Invoice[];
  totalAmount: number;
  categories: string[];
  hasPdf: boolean;
};

export default function SmartInvoices() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanDays, setScanDays] = useState(7);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: connectionStatus, isLoading: statusLoading } =
    trpc.gmail.connectionStatus.useQuery(undefined, { enabled: !!user });

  const { data: invoices, isLoading: invoicesLoading } =
    trpc.gmail.getInvoices.useQuery({ limit: 100 }, { enabled: !!user });

  const { data: monthlySummary } = trpc.gmail.getMonthlySummary.useQuery(undefined, {
    enabled: !!user,
  });

  const { data: authUrlData } = trpc.gmail.getAuthUrl.useQuery(
    {},
    { enabled: !!user }
  );

  const disconnectMutation = trpc.gmail.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Gmail נותק");
      utils.gmail.connectionStatus.invalidate();
      utils.gmail.getInvoices.invalidate();
    },
  });

  const scanMutation = trpc.gmail.scan.useMutation({
    onSuccess: (result) => {
      setIsScanning(false);
      toast.success(
        `סריקה הושלמה — נסרקו ${result.scanned} מיילים, נמצאו ${result.found} חשבוניות, נשמרו ${result.saved} חדשות.`
      );
      utils.gmail.getInvoices.invalidate();
      utils.gmail.getMonthlySummary.invalidate();
      utils.gmail.connectionStatus.invalidate();
    },
    onError: (err) => {
      setIsScanning(false);
      toast.error(`שגיאה בסריקה: ${err.message}`);
    },
  });

  const clearAndRescanMutation = trpc.gmail.clearAndRescan.useMutation({
    onSuccess: (result) => {
      setIsScanning(false);
      toast.success(
        `סריקה מחדש הושלמה — נסרקו ${result.scanned} מיילים, נמצאו ${result.found} חשבוניות, נשמרו ${result.saved}.`
      );
      utils.gmail.getInvoices.invalidate();
      utils.gmail.getMonthlySummary.invalidate();
      utils.gmail.connectionStatus.invalidate();
    },
    onError: (err) => {
      setIsScanning(false);
      toast.error(`שגיאה בסריקה מחדש: ${err.message}`);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("gmail_connected");
    const error = params.get("gmail_error");

    if (connected === "1") {
      window.history.replaceState({}, "", "/expenses");
      toast.success("Gmail חובר בהצלחה!");
      utils.gmail.connectionStatus.invalidate();
    } else if (error) {
      window.history.replaceState({}, "", "/expenses");
      toast.error(`שגיאה בחיבור Gmail: ${decodeURIComponent(error)}`);
    }
  }, []);

  function handleConnect() {
    if (authUrlData?.url) {
      window.location.href = authUrlData.url;
    }
  }

  function handleScan() {
    setIsScanning(true);
    scanMutation.mutate({ daysBack: scanDays });
  }

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => {
      if (categoryFilter && inv.category !== categoryFilter) return false;
      if (statusFilter && inv.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const ed = getExtractedData(inv);
        const searchable = [
          inv.provider,
          inv.subject,
          inv.category,
          ed.description,
          ed.fromEmail,
          ed.invoiceNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, categoryFilter, statusFilter, searchQuery]);

  const providerGroups = useMemo((): ProviderGroup[] => {
    const map = new Map<string, Invoice[]>();
    for (const inv of filteredInvoices) {
      const key = inv.provider ?? "ספק לא ידוע";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv);
    }
    return Array.from(map.entries())
      .map(([provider, invs]) => ({
        provider,
        invoices: invs.sort((a, b) => {
          const da = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0;
          const db = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0;
          return db - da;
        }),
        totalAmount: invs.reduce((sum, inv) => sum + getEffectiveAmount(inv), 0),
        categories: [...new Set(invs.map((i) => i.category ?? "אחר"))],
        hasPdf: invs.some((i) => !!getExtractedData(i).pdfUrl),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredInvoices]);

  const hasActiveFilters = !!categoryFilter || !!statusFilter || !!searchQuery.trim();

  if (authLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="relative size-12">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center border-dashed">
          <CardContent className="py-12">
            <div className="size-14 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-4">
              <Mail className="size-7 text-primary" />
            </div>
            <h2 className="text-lg font-bold mb-2">הוצאות</h2>
            <p className="text-sm text-muted-foreground mb-5">יש להתחבר כדי לגשת לפיצ'ר זה</p>
            <Button onClick={() => navigate("/")}>חזרה לדשבורד</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalMonthly = monthlySummary?.reduce((sum, cat) => sum + cat.total, 0) ?? 0;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Mail className="size-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">הוצאות</h2>
            <p className="text-xs text-muted-foreground">חשבוניות חכמות, מעקב הוצאות וסריקת מיילים</p>
          </div>
        </div>
        {connectionStatus?.connected && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="hidden sm:inline">
              {connectionStatus.connections.length} {connectionStatus.connections.length === 1 ? "חשבון" : "חשבונות"} מחוברים
            </span>
          </div>
        )}
      </div>

      <div className="space-y-6">
        {statusLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="relative size-10">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          </div>
        ) : !connectionStatus?.connected ? (
          <Card className="border-dashed border-2 border-primary/20 animate-fade-in-up">
            <CardContent className="py-14 text-center">
              <div className="size-16 rounded-2xl bg-primary/8 flex items-center justify-center mx-auto mb-5">
                <Mail className="size-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">חבר את Gmail שלך</h2>
              <p className="text-sm text-muted-foreground mb-2 max-w-md mx-auto">
                אנחנו נסרוק את המיילים שלך ונמצא חשבוניות מחברות תקשורת, חשמל, ביטוח ועוד — הכל אוטומטי.
              </p>
              <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto">
                גישה לקריאה בלבד · לא שומרים תוכן מיילים אישיים · ניתן לנתק בכל עת
              </p>
              <Button onClick={handleConnect} disabled={!authUrlData?.url} size="lg" className="gap-2">
                <Mail className="w-4 h-4" />
                חבר Gmail
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="space-y-2 animate-fade-in-up">
              {connectionStatus.connections.map((conn) => (
                <Card key={conn.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                          <CheckCircle className="size-4 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{conn.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {conn.lastSyncedAt
                              ? `סריקה אחרונה: ${new Date(conn.lastSyncedAt).toLocaleString("he-IL")} · ${conn.lastSyncCount} חשבוניות`
                              : "טרם בוצעה סריקה"}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectMutation.mutate({ connectionId: conn.id })}
                        disabled={disconnectMutation.isPending}
                        className="text-muted-foreground hover:text-destructive gap-1.5"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        נתק
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={handleConnect}
                disabled={!authUrlData?.url}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                חבר חשבון Gmail נוסף
              </Button>
            </div>

            <Card className="animate-fade-in-up">
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={scanDays}
                    onChange={(e) => setScanDays(Number(e.target.value))}
                    className="text-sm border rounded-lg px-2.5 py-1.5 bg-card"
                  >
                    <option value={7}>7 ימים</option>
                    <option value={14}>14 ימים</option>
                    <option value={30}>30 ימים</option>
                    <option value={60}>60 ימים</option>
                    <option value={90}>90 ימים</option>
                  </select>
                  <Button onClick={handleScan} disabled={isScanning} size="sm" className="gap-1.5">
                    {isScanning ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> סורק...</>
                    ) : (
                      <><RefreshCw className="w-3.5 h-3.5" /> סרוק את כל החשבונות</>
                    )}
                  </Button>
                  {invoices && invoices.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (confirm("האם למחוק את כל החשבוניות ולסרוק מחדש?")) {
                          setIsScanning(true);
                          clearAndRescanMutation.mutate({ daysBack: scanDays });
                        }
                      }}
                      disabled={isScanning}
                      className="text-orange-600 border-orange-200 hover:bg-orange-50 gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> מחק וסרוק מחדש
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {monthlySummary && monthlySummary.length > 0 && (
              <div className="animate-fade-in-up stagger-2 space-y-4">
                <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-primary/5 via-background to-primary/3">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-l from-primary via-primary/60 to-transparent" />
                  <CardContent className="py-6 px-6">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BarChart3 className="size-4 text-primary" />
                      </div>
                      <h3 className="text-sm font-semibold">סיכום הוצאות</h3>
                    </div>

                    <div className="grid grid-cols-3 gap-6 mb-6">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">סה"כ הוצאות</p>
                        <p className="text-3xl font-bold tracking-tight text-primary">
                          ₪{totalMonthly.toLocaleString("he-IL")}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">חשבוניות</p>
                        <p className="text-3xl font-bold tracking-tight">
                          {monthlySummary.reduce((sum, c) => sum + c.count, 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">ממוצע לחשבונית</p>
                        <p className="text-3xl font-bold tracking-tight">
                          ₪{monthlySummary.reduce((sum, c) => sum + c.count, 0) > 0
                            ? Math.round(totalMonthly / monthlySummary.reduce((sum, c) => sum + c.count, 0)).toLocaleString("he-IL")
                            : "0"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {monthlySummary.map((cat) => {
                        const pct = totalMonthly > 0 ? (cat.total / totalMonthly) * 100 : 0;
                        return (
                          <div key={cat.category} className="group">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2.5">
                                <div className={`size-7 rounded-lg flex items-center justify-center ${CATEGORY_ICON_BG[cat.category] ?? "bg-gray-100 text-gray-600"}`}>
                                  {CATEGORY_ICONS[cat.category] ?? <TrendingUp className="w-3.5 h-3.5" />}
                                </div>
                                <span className="text-sm font-medium">{cat.category}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                                  {cat.count} {cat.count === 1 ? "חשבונית" : "חשבוניות"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                                <span className="text-sm font-semibold">₪{cat.total.toLocaleString("he-IL")}</span>
                              </div>
                            </div>
                            <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ease-out ${CATEGORY_BAR_COLORS[cat.category] ?? "bg-gray-400"}`}
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            <div className="animate-fade-in-up stagger-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  חשבוניות
                  {invoices && invoices.length > 0 && (
                    <span className="text-muted-foreground font-normal">({filteredInvoices.length})</span>
                  )}
                </h3>
              </div>

              {invoices && invoices.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="חיפוש לפי ספק, נושא, תיאור..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-9 h-9 text-sm"
                    />
                  </div>
                  <select
                    value={categoryFilter ?? ""}
                    onChange={(e) => setCategoryFilter(e.target.value || null)}
                    className="text-sm border rounded-lg px-2.5 py-1.5 bg-card h-9"
                  >
                    <option value="">כל הקטגוריות</option>
                    {ALL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter ?? ""}
                    onChange={(e) => setStatusFilter(e.target.value || null)}
                    className="text-sm border rounded-lg px-2.5 py-1.5 bg-card h-9"
                  >
                    <option value="">כל הסטטוסים</option>
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]?.label ?? s}</option>
                    ))}
                  </select>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearchQuery(""); setCategoryFilter(null); setStatusFilter(null); }}
                      className="gap-1 text-muted-foreground h-9"
                    >
                      <X className="w-3.5 h-3.5" />
                      נקה
                    </Button>
                  )}
                </div>
              )}

              {invoicesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="relative size-10">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  </div>
                </div>
              ) : !invoices || invoices.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-14 text-center">
                    <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                      <Mail className="size-7 text-muted-foreground/40" />
                    </div>
                    <h3 className="text-sm font-semibold mb-1">לא נמצאו חשבוניות</h3>
                    <p className="text-xs text-muted-foreground">
                      לחץ על "סרוק" כדי לחפש חשבוניות בתיבת הדואר שלך
                    </p>
                  </CardContent>
                </Card>
              ) : filteredInvoices.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center">
                    <Filter className="size-8 text-muted-foreground/40 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold mb-1">אין תוצאות</h3>
                    <p className="text-xs text-muted-foreground">נסה לשנות את הסינון או החיפוש</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {providerGroups.map((group) => {
                    const isGroupExpanded = expandedProvider === group.provider;
                    const isSingle = group.invoices.length === 1;
                    const singleInv = isSingle ? group.invoices[0] : null;
                    const singleExtracted = singleInv ? getExtractedData(singleInv) : null;
                    const primaryCat = group.categories[0] ?? "אחר";
                    const catColor = CATEGORY_COLORS[primaryCat] ?? CATEGORY_COLORS["אחר"];

                    return (
                      <Card key={group.provider} className="overflow-hidden transition-all hover:shadow-md hover:border-primary/20">
                        <CardContent className="p-0">
                          <div
                            className="flex items-center justify-between cursor-pointer py-3 px-4"
                            onClick={() => {
                              if (isSingle) {
                                setExpandedInvoiceId(expandedInvoiceId === singleInv!.id ? null : singleInv!.id);
                                setExpandedProvider(null);
                              } else {
                                setExpandedProvider(isGroupExpanded ? null : group.provider);
                                setExpandedInvoiceId(null);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge variant="outline" className={`shrink-0 text-xs gap-1 ${catColor}`}>
                                {CATEGORY_ICONS[primaryCat] ?? <TrendingUp className="w-3.5 h-3.5" />}
                                {primaryCat}
                              </Badge>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{group.provider}</p>
                                  {!isSingle && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                      {group.invoices.length} חשבוניות
                                    </Badge>
                                  )}
                                </div>
                                {isSingle && singleExtracted?.description && (
                                  <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                                    {singleExtracted.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {group.hasPdf && (
                                <a
                                  href={isSingle && singleExtracted?.pdfUrl ? singleExtracted.pdfUrl : undefined}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => {
                                    if (isSingle && singleExtracted?.pdfUrl) {
                                      e.stopPropagation();
                                    } else {
                                      e.preventDefault();
                                    }
                                  }}
                                  className={`p-1.5 rounded-md transition-colors ${isSingle && singleExtracted?.pdfUrl ? "hover:bg-red-50 text-red-500" : "text-red-300 cursor-default"}`}
                                  title="פתח PDF"
                                >
                                  <FileText className="w-4 h-4" />
                                </a>
                              )}
                              {group.totalAmount > 0 && (
                                <p className="font-semibold text-sm">
                                  {isSingle ? getCurrency(singleInv!) : "₪"}{group.totalAmount.toLocaleString("he-IL")}
                                </p>
                              )}
                              {isSingle && (
                                <div className={`flex items-center gap-1 text-xs ${(STATUS_LABELS[singleInv!.status ?? "unknown"] ?? STATUS_LABELS.unknown).color}`}>
                                  {(STATUS_LABELS[singleInv!.status ?? "unknown"] ?? STATUS_LABELS.unknown).icon}
                                  <span className="hidden sm:inline">{(STATUS_LABELS[singleInv!.status ?? "unknown"] ?? STATUS_LABELS.unknown).label}</span>
                                </div>
                              )}
                              {(isSingle ? expandedInvoiceId === singleInv!.id : isGroupExpanded) ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {isSingle && expandedInvoiceId === singleInv!.id && (
                            <InvoiceDetails inv={singleInv!} connectionCount={connectionStatus?.connections.length ?? 1} />
                          )}

                          {!isSingle && isGroupExpanded && (
                            <div className="border-t bg-muted/20">
                              {group.invoices.map((inv) => {
                                const extracted = getExtractedData(inv);
                                const status = STATUS_LABELS[inv.status ?? "unknown"] ?? STATUS_LABELS.unknown;
                                const amount = getEffectiveAmount(inv);
                                const isSubExpanded = expandedInvoiceId === inv.id;

                                return (
                                  <div key={inv.id} className="border-b last:border-b-0">
                                    <div
                                      className="flex items-center justify-between cursor-pointer py-2.5 px-6 hover:bg-muted/30 transition-colors"
                                      onClick={() => setExpandedInvoiceId(isSubExpanded ? null : inv.id)}
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="size-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-xs truncate max-w-xs">
                                            {extracted.description || inv.subject || "חשבונית"}
                                          </p>
                                          {inv.invoiceDate && (
                                            <p className="text-[10px] text-muted-foreground">
                                              {new Date(inv.invoiceDate).toLocaleDateString("he-IL")}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        {extracted.pdfUrl && (
                                          <a
                                            href={extracted.pdfUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
                                            title="פתח PDF"
                                          >
                                            <FileText className="w-3.5 h-3.5" />
                                          </a>
                                        )}
                                        {amount > 0 && (
                                          <span className="text-xs font-semibold">
                                            {getCurrency(inv)}{amount.toLocaleString("he-IL")}
                                          </span>
                                        )}
                                        <div className={`flex items-center gap-1 text-[11px] ${status.color}`}>
                                          {status.icon}
                                        </div>
                                        {isSubExpanded ? (
                                          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                        ) : (
                                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                        )}
                                      </div>
                                    </div>
                                    {isSubExpanded && (
                                      <InvoiceDetails inv={inv} connectionCount={connectionStatus?.connections.length ?? 1} nested />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InvoiceDetails({ inv, connectionCount, nested }: { inv: Invoice; connectionCount: number; nested?: boolean }) {
  const extracted = getExtractedData(inv);
  return (
    <div className={`border-t space-y-3 animate-fade-in ${nested ? "py-3 px-8 bg-muted/10" : "py-3 px-4"}`}>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {inv.subject && (
          <div className="col-span-2 sm:col-span-3">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Mail className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">נושא המייל</span>
            </div>
            <p className="text-xs">{inv.subject}</p>
          </div>
        )}
        {inv.invoiceDate && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Calendar className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">תאריך</span>
            </div>
            <p className="text-xs">{new Date(inv.invoiceDate).toLocaleDateString("he-IL")}</p>
          </div>
        )}
        {inv.dueDate && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">מועד תשלום</span>
            </div>
            <p className="text-xs">{new Date(inv.dueDate).toLocaleDateString("he-IL")}</p>
          </div>
        )}
        {extracted.invoiceNumber && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Hash className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">מספר חשבונית</span>
            </div>
            <p className="text-xs">{extracted.invoiceNumber}</p>
          </div>
        )}
        {extracted.fromEmail && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Mail className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">שולח</span>
            </div>
            <p className="text-xs truncate">{extracted.fromEmail}</p>
          </div>
        )}
        {inv.sourceEmail && connectionCount > 1 && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Mail className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">נלקח מחשבון</span>
            </div>
            <p className="text-xs truncate">{inv.sourceEmail}</p>
          </div>
        )}
      </div>

      {extracted.description && (
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">תיאור</p>
          <p className="text-sm">{extracted.description}</p>
        </div>
      )}

      {extracted.items && extracted.items.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground mb-2">פירוט פריטים</p>
          <div className="bg-muted/30 rounded-lg divide-y divide-border">
            {extracted.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs">
                <span>{item.name}</span>
                {item.amount != null && (
                  <span className="font-medium">₪{item.amount.toLocaleString("he-IL")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {extracted.pdfUrl && (
        <div className="flex items-center gap-2 pt-1">
          <a
            href={extracted.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {extracted.pdfFilename ?? "פתח PDF"}
          </a>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "ממתין לתשלום", color: "text-yellow-600", icon: <Clock className="w-3.5 h-3.5" /> },
  paid: { label: "שולם", color: "text-green-600", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  overdue: { label: "באיחור", color: "text-red-600", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  unknown: { label: "לא ידוע", color: "text-gray-500", icon: <Clock className="w-3.5 h-3.5" /> },
};

function getExtractedData(inv: { extractedData?: unknown }): {
  description?: string;
  invoiceNumber?: string | null;
  items?: Array<{ name: string; amount: number | null }>;
  pdfUrl?: string;
  pdfFilename?: string;
  fromEmail?: string;
  currency?: string;
} {
  if (!inv.extractedData || typeof inv.extractedData !== "object") return {};
  return inv.extractedData as ReturnType<typeof getExtractedData>;
}

export default function SmartInvoices() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanDays, setScanDays] = useState(7);

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
      window.history.replaceState({}, "", "/smart-invoices");
      toast.success("Gmail חובר בהצלחה!");
      utils.gmail.connectionStatus.invalidate();
    } else if (error) {
      window.history.replaceState({}, "", "/smart-invoices");
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
            <h2 className="text-lg font-bold mb-2">חשבוניות חכמות</h2>
            <p className="text-sm text-muted-foreground mb-5">יש להתחבר כדי לגשת לפיצ'ר זה</p>
            <Button onClick={() => navigate("/")}>חזרה לדף הבית</Button>
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
          <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center">
            <Mail className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">חשבוניות חכמות</h2>
            <p className="text-xs text-muted-foreground">סריקת מיילים וניתוח חשבוניות אוטומטי</p>
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
              <div className="animate-fade-in-up stagger-2">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="size-4 text-muted-foreground" />
                  סיכום הוצאות
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-bl from-primary/8 to-transparent" />
                    <CardContent className="relative py-3 px-4">
                      <p className="text-[11px] text-muted-foreground mb-1">סה"כ הוצאות</p>
                      <p className="text-2xl font-bold text-primary">₪{totalMonthly.toLocaleString("he-IL")}</p>
                    </CardContent>
                  </Card>
                  {monthlySummary.map((cat) => (
                    <Card key={cat.category}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-muted-foreground">
                            {CATEGORY_ICONS[cat.category] ?? <TrendingUp className="w-4 h-4" />}
                          </span>
                          <p className="text-[11px] text-muted-foreground">{cat.category}</p>
                        </div>
                        <p className="text-lg font-semibold">₪{cat.total.toLocaleString("he-IL")}</p>
                        <p className="text-[11px] text-muted-foreground">{cat.count} חשבוניות</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="animate-fade-in-up stagger-3">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                חשבוניות
              </h3>
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
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => {
                    const status = STATUS_LABELS[inv.status ?? "unknown"] ?? STATUS_LABELS.unknown;
                    const catColor = CATEGORY_COLORS[inv.category ?? "אחר"] ?? CATEGORY_COLORS["אחר"];
                    const isExpanded = expandedId === inv.id;
                    const extracted = getExtractedData(inv);

                    return (
                      <Card key={inv.id} className="overflow-hidden transition-all hover:shadow-md hover:border-primary/20">
                        <CardContent className="py-3 px-4">
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge variant="outline" className={`shrink-0 text-xs gap-1 ${catColor}`}>
                                {CATEGORY_ICONS[inv.category ?? "אחר"] ?? <TrendingUp className="w-3.5 h-3.5" />}
                                {inv.category ?? "אחר"}
                              </Badge>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{inv.provider}</p>
                                  {inv.sourceEmail && connectionStatus && connectionStatus.connections.length > 1 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 font-normal text-muted-foreground">
                                      {inv.sourceEmail}
                                    </Badge>
                                  )}
                                </div>
                                {extracted.description && (
                                  <p className="text-[11px] text-muted-foreground truncate max-w-xs">
                                    {extracted.description}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              {inv.amount != null && (
                                <p className="font-semibold text-sm">
                                  {extracted.currency === "USD" ? "$" : extracted.currency === "EUR" ? "€" : "₪"}
                                  {Number(inv.amount).toLocaleString("he-IL")}
                                </p>
                              )}
                              <div className={`flex items-center gap-1 text-xs ${status.color}`}>
                                {status.icon}
                                <span className="hidden sm:inline">{status.label}</span>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t space-y-3 animate-fade-in">
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
                                {inv.sourceEmail && (
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
                                <div className="flex items-center gap-2">
                                  <FileText className="w-4 h-4 text-red-500" />
                                  <a
                                    href={extracted.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-primary hover:underline flex items-center gap-1"
                                  >
                                    {extracted.pdfFilename ?? "צפה בקובץ PDF"}
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                </div>
                              )}
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

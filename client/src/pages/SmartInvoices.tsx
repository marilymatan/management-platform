import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Mail,
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
  תקשורת: "bg-blue-100 text-blue-800 border-blue-200",
  חשמל: "bg-yellow-100 text-yellow-800 border-yellow-200",
  מים: "bg-cyan-100 text-cyan-800 border-cyan-200",
  ארנונה: "bg-orange-100 text-orange-800 border-orange-200",
  ביטוח: "bg-green-100 text-green-800 border-green-200",
  בנק: "bg-purple-100 text-purple-800 border-purple-200",
  רכב: "bg-red-100 text-red-800 border-red-200",
  אחר: "bg-gray-100 text-gray-800 border-gray-200",
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "ממתין לתשלום", color: "text-yellow-600", icon: <Clock className="w-3.5 h-3.5" /> },
  paid: { label: "שולם", color: "text-green-600", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  overdue: { label: "באיחור", color: "text-red-600", icon: <AlertCircle className="w-3.5 h-3.5" /> },
  unknown: { label: "לא ידוע", color: "text-gray-500", icon: <Clock className="w-3.5 h-3.5" /> },
};

// Helper to safely parse extractedData
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
    { enabled: !!user && !connectionStatus?.connected }
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

  // Handle server-side OAuth callback result
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full text-center p-8">
          <Mail className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h2 className="text-xl font-bold mb-2">חשבוניות חכמות</h2>
          <p className="text-muted-foreground mb-4">יש להתחבר כדי לגשת לפיצ'ר זה</p>
          <Button onClick={() => navigate("/")}>חזרה לדף הבית</Button>
        </Card>
      </div>
    );
  }

  const totalMonthly = monthlySummary?.reduce((sum, cat) => sum + cat.total, 0) ?? 0;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              ← חזרה
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold">חשבוניות חכמות</h1>
            </div>
          </div>
          {connectionStatus?.connected && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span>{connectionStatus.email}</span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Gmail Connection Card */}
        {statusLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : !connectionStatus?.connected ? (
          <Card className="border-dashed border-2 border-primary/30 bg-primary/5">
            <CardContent className="py-10 text-center">
              <Mail className="w-14 h-14 mx-auto mb-4 text-primary" />
              <h2 className="text-xl font-bold mb-2">חבר את Gmail שלך</h2>
              <p className="text-muted-foreground mb-2 max-w-md mx-auto">
                אנחנו נסרוק את המיילים שלך ונמצא חשבוניות מחברות תקשורת, חשמל, ביטוח ועוד — הכל
                אוטומטי.
              </p>
              <p className="text-xs text-muted-foreground mb-4 max-w-md mx-auto">
                נדרשת הרשאת קריאת מיילים. יש לאשר את כל ההרשאות המבוקשות בעת החיבור.
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                גישה לקריאה בלבד · לא שומרים תוכן מיילים אישיים · ניתן לנתק בכל עת
              </p>
              <Button
                onClick={handleConnect}
                disabled={!authUrlData?.url}
                size="lg"
              >
                <Mail className="w-4 h-4 ml-2" />
                חבר Gmail
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Connected Status + Scan Controls */}
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{connectionStatus.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {connectionStatus.lastSyncedAt
                          ? `סריקה אחרונה: ${new Date(connectionStatus.lastSyncedAt).toLocaleString(
                              "he-IL"
                            )} · ${connectionStatus.lastSyncCount} חשבוניות`
                          : "טרם בוצעה סריקה"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={scanDays}
                      onChange={(e) => setScanDays(Number(e.target.value))}
                      className="text-sm border rounded-md px-2 py-1.5 bg-background"
                    >
                      <option value={7}>7 ימים אחרונים</option>
                      <option value={14}>14 ימים אחרונים</option>
                      <option value={30}>30 ימים אחרונים</option>
                      <option value={60}>60 ימים אחרונים</option>
                      <option value={90}>90 ימים אחרונים</option>
                    </select>
                    <Button onClick={handleScan} disabled={isScanning} size="sm">
                      {isScanning ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin ml-1" /> סורק...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 ml-1" /> סרוק עכשיו
                        </>
                      )}
                    </Button>
                    {invoices && invoices.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm("האם למחוק את כל החשבוניות ולסרוק מחדש? הפעולה תמחק את כל החשבוניות הקיימות ותסרוק את המיילים מחדש.")) {
                            setIsScanning(true);
                            clearAndRescanMutation.mutate({ daysBack: scanDays });
                          }
                        }}
                        disabled={isScanning}
                        className="text-orange-600 border-orange-200 hover:bg-orange-50"
                      >
                        <Trash2 className="w-4 h-4 ml-1" /> מחק וסרוק מחדש
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Unlink className="w-4 h-4 ml-1" />
                      נתק
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Summary */}
            {monthlySummary && monthlySummary.length > 0 && (
              <div>
                <h2 className="text-base font-semibold mb-3">סיכום הוצאות</h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="py-3 px-4">
                      <p className="text-xs text-muted-foreground mb-1">סה"כ הוצאות</p>
                      <p className="text-2xl font-bold text-primary">
                        ₪{totalMonthly.toLocaleString("he-IL")}
                      </p>
                    </CardContent>
                  </Card>
                  {monthlySummary.map((cat) => (
                    <Card key={cat.category}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-muted-foreground">
                            {CATEGORY_ICONS[cat.category] ?? <TrendingUp className="w-4 h-4" />}
                          </span>
                          <p className="text-xs text-muted-foreground">{cat.category}</p>
                        </div>
                        <p className="text-lg font-semibold">
                          ₪{cat.total.toLocaleString("he-IL")}
                        </p>
                        <p className="text-xs text-muted-foreground">{cat.count} חשבוניות</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Invoice List */}
            <div>
              <h2 className="text-base font-semibold mb-3">חשבוניות</h2>
              {invoicesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : !invoices || invoices.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Mail className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-muted-foreground">לא נמצאו חשבוניות</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      לחץ על "סרוק עכשיו" כדי לחפש חשבוניות בתיבת הדואר שלך
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {invoices.map((inv) => {
                    const status = STATUS_LABELS[inv.status ?? "unknown"] ?? STATUS_LABELS.unknown;
                    const catColor =
                      CATEGORY_COLORS[inv.category ?? "אחר"] ?? CATEGORY_COLORS["אחר"];
                    const isExpanded = expandedId === inv.id;
                    const extracted = getExtractedData(inv);

                    return (
                      <Card key={inv.id} className="overflow-hidden transition-shadow hover:shadow-md">
                        <CardContent className="py-3 px-4">
                          {/* Main row - always visible */}
                          <div
                            className="flex items-center justify-between cursor-pointer"
                            onClick={() => setExpandedId(isExpanded ? null : inv.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Badge
                                variant="outline"
                                className={`shrink-0 text-xs ${catColor}`}
                              >
                                <span className="ml-1">
                                  {CATEGORY_ICONS[inv.category ?? "אחר"] ?? (
                                    <TrendingUp className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                {inv.category ?? "אחר"}
                              </Badge>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {inv.provider}
                                </p>
                                {/* Show description instead of raw text */}
                                {extracted.description && (
                                  <p className="text-xs text-muted-foreground truncate max-w-xs">
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
                                <span>{status.label}</span>
                              </div>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t space-y-3">
                              {/* Invoice details grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                {/* Subject */}
                                {inv.subject && (
                                  <div className="col-span-2 sm:col-span-3">
                                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                      <Mail className="w-3.5 h-3.5" />
                                      <span className="text-xs font-medium">נושא המייל</span>
                                    </div>
                                    <p className="text-xs">{inv.subject}</p>
                                  </div>
                                )}

                                {/* Invoice Date */}
                                {inv.invoiceDate && (
                                  <div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                      <Calendar className="w-3.5 h-3.5" />
                                      <span className="text-xs font-medium">תאריך</span>
                                    </div>
                                    <p className="text-xs">
                                      {new Date(inv.invoiceDate).toLocaleDateString("he-IL")}
                                    </p>
                                  </div>
                                )}

                                {/* Due Date */}
                                {inv.dueDate && (
                                  <div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span className="text-xs font-medium">מועד תשלום</span>
                                    </div>
                                    <p className="text-xs">
                                      {new Date(inv.dueDate).toLocaleDateString("he-IL")}
                                    </p>
                                  </div>
                                )}

                                {/* Invoice Number */}
                                {extracted.invoiceNumber && (
                                  <div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                      <Hash className="w-3.5 h-3.5" />
                                      <span className="text-xs font-medium">מספר חשבונית</span>
                                    </div>
                                    <p className="text-xs">{extracted.invoiceNumber}</p>
                                  </div>
                                )}

                                {/* From Email */}
                                {extracted.fromEmail && (
                                  <div>
                                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                                      <Mail className="w-3.5 h-3.5" />
                                      <span className="text-xs font-medium">שולח</span>
                                    </div>
                                    <p className="text-xs truncate">{extracted.fromEmail}</p>
                                  </div>
                                )}
                              </div>

                              {/* Description */}
                              {extracted.description && (
                                <div className="bg-muted/50 rounded-md p-3">
                                  <p className="text-xs font-medium text-muted-foreground mb-1">תיאור</p>
                                  <p className="text-sm">{extracted.description}</p>
                                </div>
                              )}

                              {/* Items breakdown */}
                              {extracted.items && extracted.items.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-2">פירוט פריטים</p>
                                  <div className="bg-muted/30 rounded-md divide-y divide-border">
                                    {extracted.items.map((item, idx) => (
                                      <div key={idx} className="flex items-center justify-between px-3 py-2 text-xs">
                                        <span>{item.name}</span>
                                        {item.amount != null && (
                                          <span className="font-medium">
                                            ₪{item.amount.toLocaleString("he-IL")}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* PDF attachment link */}
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

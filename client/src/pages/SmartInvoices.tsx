import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Trash2,
  BarChart3,
  Search,
  Filter,
  X,
  Download,
  PencilLine,
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

const ALL_CATEGORIES = ["תקשורת", "חשמל", "מים", "ארנונה", "ביטוח", "בנק", "רכב", "אחר"] as const;
const ALL_STATUSES = ["pending", "paid", "overdue", "unknown"] as const;

const HEBREW_MONTHS: Record<string, string> = {
  "01": "ינואר", "02": "פברואר", "03": "מרץ", "04": "אפריל",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוגוסט",
  "09": "ספטמבר", "10": "אוקטובר", "11": "נובמבר", "12": "דצמבר",
};

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
  customCategory?: string | null;
  amount?: string | null;
  status?: string | null;
  subject?: string | null;
  sourceEmail?: string | null;
  invoiceDate?: string | Date | null;
  dueDate?: string | Date | null;
  extractedData?: unknown;
};

function getEffectiveCategory(inv: Invoice): string {
  return inv.customCategory ?? inv.category ?? "אחר";
}

type ProviderGroup = {
  provider: string;
  invoices: Invoice[];
  totalAmount: number;
  categories: string[];
  hasPdf: boolean;
};

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${HEBREW_MONTHS[month] ?? month} ${year}`;
}

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
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [editCategoryDialogOpen, setEditCategoryDialogOpen] = useState(false);
  const [editCategoryInvoice, setEditCategoryInvoice] = useState<Invoice | null>(null);
  const [editCategoryValue, setEditCategoryValue] = useState("");
  const [manualForm, setManualForm] = useState({
    provider: "",
    amount: "",
    category: "אחר" as (typeof ALL_CATEGORIES)[number],
    invoiceDate: new Date().toISOString().slice(0, 10),
    status: "paid" as (typeof ALL_STATUSES)[number],
    description: "",
  });

  const utils = trpc.useUtils();

  const { data: connectionStatus, isLoading: statusLoading } =
    trpc.gmail.connectionStatus.useQuery(undefined, { enabled: !!user });

  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } =
    trpc.gmail.getInvoices.useQuery({ limit: 100 }, { enabled: !!user, retry: 2 });

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

  const addManualMutation = trpc.gmail.addManualExpense.useMutation({
    onSuccess: () => {
      toast.success("הוצאה נוספה בהצלחה");
      setManualDialogOpen(false);
      setManualForm({
        provider: "",
        amount: "",
        category: "אחר",
        invoiceDate: new Date().toISOString().slice(0, 10),
        status: "paid",
        description: "",
      });
      utils.gmail.getInvoices.invalidate();
      utils.gmail.getMonthlySummary.invalidate();
    },
    onError: (err) => {
      toast.error(`שגיאה בהוספת הוצאה: ${err.message}`);
    },
  });

  const updateCategoryMutation = trpc.gmail.updateInvoiceCategory.useMutation({
    onSuccess: () => {
      toast.success("הקטגוריה עודכנה בהצלחה");
      setEditCategoryDialogOpen(false);
      setEditCategoryInvoice(null);
      setEditCategoryValue("");
      utils.gmail.getInvoices.invalidate();
      utils.gmail.getMonthlySummary.invalidate();
    },
    onError: (err) => {
      toast.error(`שגיאה בעדכון קטגוריה: ${err.message}`);
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

  function handleSubmitManual() {
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.provider.trim() || isNaN(amt) || amt <= 0) {
      toast.error("יש למלא שם ספק וסכום תקין");
      return;
    }
    addManualMutation.mutate({
      provider: manualForm.provider.trim(),
      amount: amt,
      category: manualForm.category,
      invoiceDate: manualForm.invoiceDate,
      status: manualForm.status,
      description: manualForm.description.trim() || undefined,
    });
  }

  function handleEditCategory(inv: Invoice) {
    setEditCategoryInvoice(inv);
    setEditCategoryValue(getEffectiveCategory(inv));
    setEditCategoryDialogOpen(true);
  }

  function handleSubmitCategory() {
    if (!editCategoryInvoice || !editCategoryValue.trim()) return;
    updateCategoryMutation.mutate({
      invoiceId: editCategoryInvoice.id,
      customCategory: editCategoryValue.trim(),
    });
  }

  function toggleMonth(monthKey: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => {
      const effectiveCat = getEffectiveCategory(inv as Invoice);
      if (categoryFilter && effectiveCat !== categoryFilter && inv.category !== categoryFilter) return false;
      if (statusFilter && inv.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const ed = getExtractedData(inv);
        const searchable = [
          inv.provider,
          inv.subject,
          inv.category,
          (inv as Invoice).customCategory,
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
      map.get(key)!.push(inv as Invoice);
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
        categories: [...new Set(invs.map((i) => getEffectiveCategory(i)))],
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

  const grandTotal = monthlySummary?.reduce((sum, m) => sum + m.total, 0) ?? 0;
  const grandCount = monthlySummary?.reduce((sum, m) => sum + m.categories.reduce((s, c) => s + c.count, 0), 0) ?? 0;

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
        <Button onClick={() => setManualDialogOpen(true)} size="sm" variant="outline" className="gap-1.5">
          <PencilLine className="w-4 h-4" />
          הוסף הוצאה
        </Button>
      </div>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הוספת הוצאה ידנית</DialogTitle>
            <DialogDescription>הזן את פרטי ההוצאה</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="m-provider">שם ספק / הוצאה</Label>
              <Input
                id="m-provider"
                placeholder='למשל "חברת חשמל"'
                value={manualForm.provider}
                onChange={(e) => setManualForm((p) => ({ ...p, provider: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="m-amount">סכום (₪)</Label>
                <Input
                  id="m-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm((p) => ({ ...p, amount: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-category">קטגוריה</Label>
                <select
                  id="m-category"
                  value={manualForm.category}
                  onChange={(e) => setManualForm((p) => ({ ...p, category: e.target.value as typeof manualForm.category }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ALL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="m-date">תאריך</Label>
                <Input
                  id="m-date"
                  type="date"
                  value={manualForm.invoiceDate}
                  onChange={(e) => setManualForm((p) => ({ ...p, invoiceDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-status">סטטוס</Label>
                <select
                  id="m-status"
                  value={manualForm.status}
                  onChange={(e) => setManualForm((p) => ({ ...p, status: e.target.value as typeof manualForm.status }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s].label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-desc">תיאור (אופציונלי)</Label>
              <Input
                id="m-desc"
                placeholder="פרטים נוספים..."
                value={manualForm.description}
                onChange={(e) => setManualForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>ביטול</Button>
            <Button onClick={handleSubmitManual} disabled={addManualMutation.isPending} className="gap-1.5">
              {addManualMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              הוסף
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editCategoryDialogOpen} onOpenChange={setEditCategoryDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>עריכת קטגוריה</DialogTitle>
            <DialogDescription>
              {editCategoryInvoice?.provider
                ? `שנה את הקטגוריה עבור "${editCategoryInvoice.provider}". השינוי יחול על כל החשבוניות מספק זה.`
                : "שנה את הקטגוריה של החשבונית"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-cat">קטגוריה חדשה</Label>
              <Input
                id="edit-cat"
                placeholder='למשל "קלינאית תקשורת"'
                value={editCategoryValue}
                onChange={(e) => setEditCategoryValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmitCategory();
                }}
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setEditCategoryValue(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    editCategoryValue === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 hover:bg-muted border-transparent"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCategoryDialogOpen(false)}>ביטול</Button>
            <Button
              onClick={handleSubmitCategory}
              disabled={updateCategoryMutation.isPending || !editCategoryValue.trim()}
              className="gap-1.5"
            >
              {updateCategoryMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PencilLine className="w-4 h-4" />}
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Card className="animate-fade-in-up">
              <CardContent className="py-4 px-4">
                <div className="flex flex-wrap gap-2.5 mb-3">
                  {connectionStatus.connections.map((conn) => (
                    <div
                      key={conn.id}
                      className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2 min-w-0"
                    >
                      <div className="size-2 rounded-full bg-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate max-w-[180px]">{conn.email}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {conn.lastSyncCount ?? 0} חשבוניות
                          {conn.lastSyncedAt && (
                            <> · {new Date(conn.lastSyncedAt).toLocaleDateString("he-IL")}</>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => disconnectMutation.mutate({ connectionId: conn.id })}
                        disabled={disconnectMutation.isPending}
                        className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        title="נתק חשבון"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleConnect}
                    disabled={!authUrlData?.url}
                    className="flex items-center gap-2 rounded-xl border-2 border-dashed border-muted-foreground/25 px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    חבר חשבון
                  </button>
                </div>

                <div className="border-t pt-3 flex flex-wrap items-center gap-2">
                  <select
                    value={scanDays}
                    onChange={(e) => setScanDays(Number(e.target.value))}
                    className="text-xs border rounded-lg px-2 py-1.5 bg-card"
                  >
                    <option value={7}>7 ימים</option>
                    <option value={14}>14 ימים</option>
                    <option value={30}>30 ימים</option>
                    <option value={60}>60 ימים</option>
                    <option value={90}>90 ימים</option>
                  </select>
                  <Button onClick={handleScan} disabled={isScanning} size="sm" className="gap-1.5 h-8 text-xs">
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
                      className="text-orange-600 border-orange-200 hover:bg-orange-50 gap-1.5 h-8 text-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> מחק וסרוק מחדש
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {monthlySummary && monthlySummary.length > 0 && (
              <div className="animate-fade-in-up stagger-2 space-y-3">
                <Card className="relative overflow-hidden border-0 shadow-lg bg-gradient-to-br from-primary/5 via-background to-primary/3">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-l from-primary via-primary/60 to-transparent" />
                  <CardContent className="py-5 px-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <BarChart3 className="size-4 text-primary" />
                        </div>
                        <h3 className="text-sm font-semibold">סיכום הוצאות</h3>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-left">
                          <p className="text-[10px] text-muted-foreground">סה"כ</p>
                          <p className="font-bold text-primary">₪{grandTotal.toLocaleString("he-IL")}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-[10px] text-muted-foreground">חשבוניות</p>
                          <p className="font-bold">{grandCount}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {monthlySummary.map((monthData) => {
                        const isExpanded = expandedMonths.has(monthData.month);
                        const monthInvoiceCount = monthData.categories.reduce((s, c) => s + c.count, 0);
                        return (
                          <div key={monthData.month} className="rounded-xl border bg-card/60 overflow-hidden">
                            <button
                              onClick={() => toggleMonth(monthData.month)}
                              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-center gap-2.5">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-semibold">{formatMonthLabel(monthData.month)}</span>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {monthInvoiceCount} {monthInvoiceCount === 1 ? "חשבונית" : "חשבוניות"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold">₪{monthData.total.toLocaleString("he-IL")}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-3 space-y-2.5 border-t">
                                {monthData.categories.map((cat) => {
                                  const pct = monthData.total > 0 ? (cat.total / monthData.total) * 100 : 0;
                                  return (
                                    <div key={cat.category} className="pt-2.5">
                                      <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                          <div className={`size-6 rounded-md flex items-center justify-center ${CATEGORY_ICON_BG[cat.category] ?? "bg-gray-100 text-gray-600"}`}>
                                            {CATEGORY_ICONS[cat.category] ?? <TrendingUp className="w-3 h-3" />}
                                          </div>
                                          <span className="text-xs font-medium">{cat.category}</span>
                                          <span className="text-[10px] text-muted-foreground">
                                            {cat.count} {cat.count === 1 ? "חשבונית" : "חשבוניות"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[10px] text-muted-foreground">{pct.toFixed(0)}%</span>
                                          <span className="text-xs font-semibold">₪{cat.total.toLocaleString("he-IL")}</span>
                                        </div>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-700 ease-out ${CATEGORY_BAR_COLORS[cat.category] ?? "bg-gray-400"}`}
                                          style={{ width: `${Math.max(pct, 2)}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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
              ) : invoicesError ? (
                <Card className="border-destructive/40">
                  <CardContent className="py-10 text-center">
                    <AlertCircle className="size-8 text-destructive/60 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold mb-1">שגיאה בטעינת חשבוניות</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      {invoicesError.message.includes("Rate limit") || invoicesError.message.includes("Too many")
                        ? "יותר מדי בקשות — נסה שוב בעוד רגע"
                        : "אירעה שגיאה בטעינת הנתונים"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => utils.gmail.getInvoices.invalidate()}
                    >
                      נסה שוב
                    </Button>
                  </CardContent>
                </Card>
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
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge variant="outline" className={`text-xs gap-1 ${catColor}`}>
                                  {CATEGORY_ICONS[primaryCat] ?? <TrendingUp className="w-3.5 h-3.5" />}
                                  {primaryCat}
                                </Badge>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditCategory(isSingle ? singleInv! : group.invoices[0]);
                                  }}
                                  className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                                  title="ערוך קטגוריה"
                                >
                                  <PencilLine className="w-3 h-3" />
                                </button>
                              </div>
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

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
  CheckCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
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
  Users,
  Search,
  Filter,
  X,
  Download,
  PencilLine,
  Banknote,
  Sparkles,
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
const ALL_FLOW_DIRECTIONS = ["expense", "income", "unknown"] as const;

const FLOW_DIRECTION_LABELS: Record<(typeof ALL_FLOW_DIRECTIONS)[number], { label: string; badgeClass: string; amountClass: string; icon: React.ReactNode }> = {
  expense: {
    label: "הוצאה",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
    amountClass: "text-rose-600",
    icon: <TrendingDown className="w-3.5 h-3.5" />,
  },
  income: {
    label: "הכנסה",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amountClass: "text-emerald-600",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
  },
  unknown: {
    label: "לא ברור",
    badgeClass: "bg-gray-50 text-gray-700 border-gray-200",
    amountClass: "text-muted-foreground",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
};

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "חשבונית",
  receipt: "קבלה",
  credit_note: "זיכוי",
  order_confirmation: "אישור הזמנה",
  unknown: "לא ידוע",
};

const COUNTERPARTY_ROLE_LABELS: Record<string, string> = {
  supplier: "ספק",
  customer: "לקוח",
  unknown: "לא ידוע",
};

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
  issuerName?: string | null;
  recipientName?: string | null;
  flowDirection?: (typeof ALL_FLOW_DIRECTIONS)[number];
  documentType?: string;
  counterpartyRole?: string;
  classificationReason?: string;
  confidence?: number;
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

function getFlowDirection(inv: { flowDirection?: string | null; extractedData?: unknown }): (typeof ALL_FLOW_DIRECTIONS)[number] {
  if (inv.flowDirection === "expense" || inv.flowDirection === "income" || inv.flowDirection === "unknown") {
    return inv.flowDirection;
  }
  const ed = getExtractedData(inv);
  if (ed.flowDirection === "expense" || ed.flowDirection === "income" || ed.flowDirection === "unknown") {
    return ed.flowDirection;
  }
  return "expense";
}

function formatAmountDisplay(inv: { flowDirection?: string | null; extractedData?: unknown }, amount: number): string {
  const currency = getCurrency(inv);
  const flowDirection = getFlowDirection(inv);
  const sign = flowDirection === "income" ? "+" : flowDirection === "expense" ? "-" : "";
  return `${sign}${currency}${amount.toLocaleString("he-IL")}`;
}

type Invoice = {
  id: number;
  provider?: string | null;
  category?: string | null;
  customCategory?: string | null;
  amount?: string | null;
  status?: string | null;
  flowDirection?: string | null;
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
  expenseTotal: number;
  incomeTotal: number;
  expenseCount: number;
  incomeCount: number;
  unknownCount: number;
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
  const [flowFilter, setFlowFilter] = useState<string | null>(null);
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
    flowDirection: "expense" as (typeof ALL_FLOW_DIRECTIONS)[number],
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
  const { data: profileData } = trpc.profile.get.useQuery(undefined, {
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
      toast.success("התנועה נוספה בהצלחה");
      setManualDialogOpen(false);
      setManualForm({
        provider: "",
        amount: "",
        category: "אחר",
        invoiceDate: new Date().toISOString().slice(0, 10),
        status: "paid",
        flowDirection: "expense",
        description: "",
      });
      utils.gmail.getInvoices.invalidate();
      utils.gmail.getMonthlySummary.invalidate();
    },
    onError: (err) => {
      toast.error(`שגיאה בהוספת תנועה: ${err.message}`);
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
      toast.error("יש למלא שם צד שני וסכום תקין");
      return;
    }
    addManualMutation.mutate({
      provider: manualForm.provider.trim(),
      amount: amt,
      category: manualForm.category,
      invoiceDate: manualForm.invoiceDate,
      status: manualForm.status,
      flowDirection: manualForm.flowDirection,
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
      if (flowFilter && getFlowDirection(inv as Invoice) !== flowFilter) return false;
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
        expenseTotal: invs.reduce((sum, inv) => sum + (getFlowDirection(inv) === "expense" ? getEffectiveAmount(inv) : 0), 0),
        incomeTotal: invs.reduce((sum, inv) => sum + (getFlowDirection(inv) === "income" ? getEffectiveAmount(inv) : 0), 0),
        expenseCount: invs.filter((inv) => getFlowDirection(inv) === "expense").length,
        incomeCount: invs.filter((inv) => getFlowDirection(inv) === "income").length,
        unknownCount: invs.filter((inv) => getFlowDirection(inv) === "unknown").length,
        categories: Array.from(new Set(invs.map((i) => getEffectiveCategory(i)))),
        hasPdf: invs.some((i) => !!getExtractedData(i).pdfUrl),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredInvoices]);

  const hasActiveFilters = !!categoryFilter || !!statusFilter || !!flowFilter || !!searchQuery.trim();

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
            <h2 className="text-lg font-bold mb-2">הוצאות והכנסות</h2>
            <p className="text-sm text-muted-foreground mb-5">יש להתחבר כדי לגשת לפיצ'ר זה</p>
            <Button onClick={() => navigate("/")}>חזרה ללומי</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const grandExpenseTotal = monthlySummary?.reduce((sum, m) => sum + (m.expenseTotal ?? m.total), 0) ?? 0;
  const grandIncomeTotal = monthlySummary?.reduce((sum, m) => sum + (m.incomeTotal ?? 0), 0) ?? 0;
  const grandNetTotal = monthlySummary?.reduce((sum, m) => sum + (m.netTotal ?? ((m.incomeTotal ?? 0) - (m.expenseTotal ?? m.total ?? 0))), 0) ?? 0;
  const grandCount = monthlySummary?.reduce((sum, m) => {
    if (m.flowCounts) {
      return sum + (m.flowCounts.expense ?? 0) + (m.flowCounts.income ?? 0) + (m.flowCounts.unknown ?? 0);
    }
    return sum + m.categories.reduce((s, c) => s + c.count, 0);
  }, 0) ?? 0;

  const moneyInsights = useMemo(() => {
    const insights: Array<{ tone: "warning" | "info" | "success"; title: string; description: string }> = [];
    const currentMonth = monthlySummary?.[0];
    const topExpenseCategory = currentMonth?.categories?.[0];
    const unknownFlowCount = invoices?.filter((invoice) => getFlowDirection(invoice as Invoice) === "unknown").length ?? 0;

    if (currentMonth) {
      if (currentMonth.netTotal < 0) {
        insights.push({
          tone: "warning",
          title: "הנטו החודשי כרגע שלילי",
          description: `נכון לעכשיו ההוצאות גבוהות מההכנסות ב-${Math.abs(currentMonth.netTotal).toLocaleString("he-IL")} ₪.`,
        });
      } else {
        insights.push({
          tone: "success",
          title: "החודש נמצא כרגע באיזון חיובי",
          description: `הנטו החודשי עומד כרגע על ${currentMonth.netTotal.toLocaleString("he-IL")} ₪.`,
        });
      }
    }

    if (topExpenseCategory) {
      insights.push({
        tone: "info",
        title: "זו הקטגוריה הכי כבדה אצלך כרגע",
        description: `${topExpenseCategory.category} מובילה את ההוצאות עם ${topExpenseCategory.total.toLocaleString("he-IL")} ₪ החודש.`,
      });
    }

    if ((profileData?.numberOfChildren ?? 0) > 0 && currentMonth) {
      insights.push({
        tone: "info",
        title: "המשפחה משנה את ההקשר הכספי",
        description: `לומי יודע שיש ${profileData?.numberOfChildren} ילדים בבית, ולכן כדאי להסתכל על תזרים חודשי מול אירועים, חוגים והוצאות לא צפויות.`,
      });
    }

    if (profileData?.businessName && currentMonth && currentMonth.incomeTotal === 0) {
      insights.push({
        tone: "warning",
        title: "אין עדיין הכנסות מזוהות החודש",
        description: `למרות שמוגדר עסק (${profileData.businessName}), עדיין לא זוהו הכנסות במסמכים החודשיים.`,
      });
    }

    if (unknownFlowCount > 0) {
      insights.push({
        tone: "warning",
        title: "יש תנועות שעדיין לא סווגו כתזרים",
        description: `${unknownFlowCount} מסמכים עדיין לא ברורים כהוצאה או הכנסה, וכדאי להשלים להם סיווג.`,
      });
    }

    return insights.slice(0, 3);
  }, [invoices, monthlySummary, profileData]);

  return (
    <div className="page-container" data-testid="money-page">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-bl from-[#1a2744] via-[#1e3a5f] to-[#2563eb] text-white mb-6 animate-fade-in-up">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_-20%,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="absolute -bottom-12 -start-12 size-52 rounded-full bg-white/[0.06] blur-3xl" />
        <div className="absolute -top-8 -end-8 size-36 rounded-full bg-white/[0.06] blur-2xl" />
        <div className="relative p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <Banknote className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">הוצאות והכנסות</h1>
                <p className="text-sm text-white/70 mt-0.5">מסמכים כספיים חכמים, סיווג תזרים וסריקת מיילים</p>
              </div>
            </div>
            <Button
              onClick={() => setManualDialogOpen(true)}
              size="sm"
              data-testid="manual-entry-button"
              className="bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-sm gap-1.5 shadow-lg shadow-black/10"
            >
              <PencilLine className="w-4 h-4" />
              הוסף תנועה
            </Button>
          </div>
          {connectionStatus?.connected && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
              <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm p-4 ring-1 ring-white/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingDown className="size-3.5 text-white/50" />
                  <p className="text-[11px] text-white/50 font-medium">סה"כ הוצאות</p>
                </div>
                <p className="text-2xl font-bold tabular-nums leading-none">₪{grandExpenseTotal.toLocaleString("he-IL")}</p>
              </div>
              <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm p-4 ring-1 ring-white/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <TrendingUp className="size-3.5 text-white/50" />
                  <p className="text-[11px] text-white/50 font-medium">סה"כ הכנסות</p>
                </div>
                <p className="text-2xl font-bold tabular-nums leading-none">₪{grandIncomeTotal.toLocaleString("he-IL")}</p>
              </div>
              <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm p-4 ring-1 ring-white/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <Banknote className="size-3.5 text-white/50" />
                  <p className="text-[11px] text-white/50 font-medium">נטו</p>
                </div>
                <p className="text-2xl font-bold tabular-nums leading-none">{grandNetTotal >= 0 ? "+" : "-"}₪{Math.abs(grandNetTotal).toLocaleString("he-IL")}</p>
              </div>
              <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm p-4 ring-1 ring-white/10">
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="size-3.5 text-white/50" />
                  <p className="text-[11px] text-white/50 font-medium">מסמכים</p>
                </div>
                <p className="text-2xl font-bold tabular-nums leading-none">{grandCount}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>הוספת תנועה ידנית</DialogTitle>
            <DialogDescription>הזן את פרטי ההוצאה או ההכנסה</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="m-provider">שם צד שני / ספק / לקוח</Label>
              <Input
                id="m-provider"
                placeholder='למשל "חברת חשמל" או "לקוח פרטי"'
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
                <Label htmlFor="m-flow">סוג תנועה</Label>
                <select
                  id="m-flow"
                  data-testid="manual-flow-direction"
                  value={manualForm.flowDirection}
                  onChange={(e) => setManualForm((p) => ({ ...p, flowDirection: e.target.value as typeof manualForm.flowDirection }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {ALL_FLOW_DIRECTIONS.map((flow) => (
                    <option key={flow} value={flow}>{FLOW_DIRECTION_LABELS[flow].label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
            <Card className="animate-fade-in-up overflow-hidden border-0 shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 flex-wrap p-4 pb-3.5">
                  {connectionStatus.connections.map((conn) => (
                    <div
                      key={conn.id}
                      className="group flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200/80 pe-2.5 ps-3 py-1.5 transition-all hover:shadow-sm"
                    >
                      <div className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 shrink-0" />
                      <span className="text-xs font-medium text-emerald-900 truncate max-w-[180px]">{conn.email}</span>
                      <span className="text-[10px] text-emerald-600/60 border-s border-emerald-200 ps-2 ms-0.5 shrink-0">
                        {conn.lastSyncCount ?? 0} חשבוניות
                        {conn.lastSyncedAt && (<> · {new Date(conn.lastSyncedAt).toLocaleDateString("he-IL")}</>)}
                      </span>
                      <button
                        onClick={() => disconnectMutation.mutate({ connectionId: conn.id })}
                        disabled={disconnectMutation.isPending}
                        className="p-0.5 rounded-full text-emerald-400 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="נתק חשבון"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleConnect}
                    disabled={!authUrlData?.url}
                    className="flex items-center gap-1.5 rounded-full border-2 border-dashed border-muted-foreground/20 px-3.5 py-1.5 text-xs text-muted-foreground hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    חבר חשבון
                  </button>
                </div>
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-t">
                  <select
                    value={scanDays}
                    onChange={(e) => setScanDays(Number(e.target.value))}
                    className="text-xs border rounded-lg px-2.5 py-1.5 bg-card font-medium"
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

            {moneyInsights.length > 0 && (
              <div className="animate-fade-in-up stagger-2 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-500" />
                  <h2 className="text-sm font-semibold">תובנות לומי</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {moneyInsights.map((insight) => (
                    <Card key={insight.title} className="border-border/70">
                      <CardContent className="p-4 space-y-2">
                        <Badge
                          variant="outline"
                          className={
                            insight.tone === "warning"
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : insight.tone === "success"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-blue-50 text-blue-700 border-blue-200"
                          }
                        >
                          {insight.tone === "warning" ? "דורש תשומת לב" : insight.tone === "success" ? "מצב טוב" : "מבט חכם"}
                        </Badge>
                        <p className="text-sm font-semibold">{insight.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {monthlySummary && monthlySummary.length > 0 && (
              <div className="animate-fade-in-up stagger-2 space-y-2">
                {monthlySummary.map((monthData) => {
                  const isExpanded = expandedMonths.has(monthData.month);
                  const monthInvoiceCount = monthData.flowCounts
                    ? (monthData.flowCounts.expense ?? 0) + (monthData.flowCounts.income ?? 0) + (monthData.flowCounts.unknown ?? 0)
                    : monthData.categories.reduce((s, c) => s + c.count, 0);
                  return (
                    <Card key={monthData.month} className="overflow-hidden transition-all hover:shadow-sm">
                      <button
                        onClick={() => toggleMonth(monthData.month)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div className="text-start">
                            <span className="text-sm font-semibold block">{formatMonthLabel(monthData.month)}</span>
                            <span className="text-[11px] text-muted-foreground">{monthInvoiceCount} {monthInvoiceCount === 1 ? "מסמך" : "מסמכים"}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-end">
                            <p className="text-sm font-semibold text-rose-600 tabular-nums">-₪{(monthData.expenseTotal ?? monthData.total).toLocaleString("he-IL")}</p>
                            <p className="text-[10px] text-emerald-600 tabular-nums">+₪{(monthData.incomeTotal ?? 0).toLocaleString("he-IL")}</p>
                          </div>
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-3 space-y-2.5 border-t">
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-3">
                            <div className="rounded-lg bg-rose-50 border border-rose-100 px-3 py-2">
                              <p className="text-[10px] text-rose-600">הוצאות</p>
                              <p className="text-sm font-semibold text-rose-700">₪{(monthData.expenseTotal ?? monthData.total).toLocaleString("he-IL")}</p>
                            </div>
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                              <p className="text-[10px] text-emerald-600">הכנסות</p>
                              <p className="text-sm font-semibold text-emerald-700">₪{(monthData.incomeTotal ?? 0).toLocaleString("he-IL")}</p>
                            </div>
                            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                              <p className="text-[10px] text-blue-600">נטו</p>
                              <p className="text-sm font-semibold text-blue-700">
                                {(monthData.netTotal ?? ((monthData.incomeTotal ?? 0) - (monthData.expenseTotal ?? monthData.total))) >= 0 ? "+" : "-"}
                                ₪{Math.abs(monthData.netTotal ?? ((monthData.incomeTotal ?? 0) - (monthData.expenseTotal ?? monthData.total))).toLocaleString("he-IL")}
                              </p>
                            </div>
                            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2">
                              <p className="text-[10px] text-muted-foreground">לא מסווג</p>
                              <p className="text-sm font-semibold">₪{(monthData.unknownTotal ?? 0).toLocaleString("he-IL")}</p>
                            </div>
                          </div>
                          {monthData.categories.map((cat) => {
                            const pct = (monthData.expenseTotal ?? monthData.total) > 0 ? (cat.total / (monthData.expenseTotal ?? monthData.total)) * 100 : 0;
                            return (
                              <div key={cat.category} className="pt-2.5">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <div className={`size-6 rounded-md flex items-center justify-center ${CATEGORY_ICON_BG[cat.category] ?? "bg-gray-100 text-gray-600"}`}>
                                      {CATEGORY_ICONS[cat.category] ?? <TrendingUp className="w-3 h-3" />}
                                    </div>
                                    <span className="text-xs font-medium">{cat.category}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {cat.count} {cat.count === 1 ? "מסמך" : "מסמכים"}
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
                          {monthData.incomeCategories && monthData.incomeCategories.length > 0 && (
                            <div className="pt-3">
                              <p className="text-[11px] font-medium text-muted-foreground mb-2">קטגוריות הכנסה</p>
                              <div className="space-y-2">
                                {monthData.incomeCategories.map((cat) => (
                                  <div key={`income-${cat.category}`} className="flex items-center justify-between rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium">{cat.category}</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        {cat.count} {cat.count === 1 ? "מסמך" : "מסמכים"}
                                      </span>
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-700">₪{cat.total.toLocaleString("he-IL")}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="animate-fade-in-up stagger-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" />
                  מסמכים כספיים
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
                  <select
                    data-testid="flow-filter"
                    value={flowFilter ?? ""}
                    onChange={(e) => setFlowFilter(e.target.value || null)}
                    className="text-sm border rounded-lg px-2.5 py-1.5 bg-card h-9"
                  >
                    <option value="">כל סוגי התזרים</option>
                    {ALL_FLOW_DIRECTIONS.map((flow) => (
                      <option key={flow} value={flow}>{FLOW_DIRECTION_LABELS[flow].label}</option>
                    ))}
                  </select>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSearchQuery(""); setCategoryFilter(null); setStatusFilter(null); setFlowFilter(null); }}
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
                    <h3 className="text-sm font-semibold mb-1">שגיאה בטעינת מסמכים כספיים</h3>
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
                    <h3 className="text-sm font-semibold mb-1">לא נמצאו מסמכים כספיים</h3>
                    <p className="text-xs text-muted-foreground">
                      לחץ על "סרוק" כדי לחפש מסמכים כספיים בתיבת הדואר שלך
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
                    const singleFlowDirection = singleInv ? getFlowDirection(singleInv) : "unknown";
                    const primaryCat = group.categories[0] ?? "אחר";
                    const catColor = CATEGORY_COLORS[primaryCat] ?? CATEGORY_COLORS["אחר"];
                    const groupFlowDirection = group.incomeCount > 0 && group.expenseCount === 0 && group.unknownCount === 0
                      ? "income"
                      : group.expenseCount > 0 && group.incomeCount === 0 && group.unknownCount === 0
                        ? "expense"
                        : group.unknownCount > 0 && group.incomeCount === 0 && group.expenseCount === 0
                          ? "unknown"
                          : null;
                    const groupFlowLabel = groupFlowDirection
                      ? FLOW_DIRECTION_LABELS[groupFlowDirection].label
                      : "מעורב";
                    const groupFlowClass = groupFlowDirection
                      ? FLOW_DIRECTION_LABELS[groupFlowDirection].badgeClass
                      : "bg-amber-50 text-amber-700 border-amber-200";
                    const groupAmountText = isSingle && singleInv
                      ? formatAmountDisplay(singleInv, getEffectiveAmount(singleInv))
                      : group.incomeCount > 0 && group.expenseCount === 0 && group.unknownCount === 0
                        ? `+₪${group.totalAmount.toLocaleString("he-IL")}`
                        : group.expenseCount > 0 && group.incomeCount === 0 && group.unknownCount === 0
                          ? `-₪${group.totalAmount.toLocaleString("he-IL")}`
                          : `₪${group.totalAmount.toLocaleString("he-IL")}`;
                    const groupAmountClass = isSingle && singleInv
                      ? FLOW_DIRECTION_LABELS[singleFlowDirection].amountClass
                      : groupFlowDirection
                        ? FLOW_DIRECTION_LABELS[groupFlowDirection].amountClass
                        : "text-foreground";

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
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${groupFlowClass}`}>
                                    {groupFlowLabel}
                                  </Badge>
                                  {!isSingle && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                      {group.invoices.length} מסמכים
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
                                <p className={`font-semibold text-sm ${groupAmountClass}`}>
                                  {groupAmountText}
                                </p>
                              )}
                              {isSingle && (
                                <>
                                  <div className={`flex items-center gap-1 text-xs ${(STATUS_LABELS[singleInv!.status ?? "unknown"] ?? STATUS_LABELS.unknown).color}`}>
                                    {(STATUS_LABELS[singleInv!.status ?? "unknown"] ?? STATUS_LABELS.unknown).icon}
                                    <span className="hidden sm:inline">{(STATUS_LABELS[singleInv!.status ?? "unknown"] ?? STATUS_LABELS.unknown).label}</span>
                                  </div>
                                  {singleExtracted?.documentType && (
                                    <span className="text-[10px] text-muted-foreground hidden md:inline">
                                      {DOCUMENT_TYPE_LABELS[singleExtracted.documentType] ?? singleExtracted.documentType}
                                    </span>
                                  )}
                                </>
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
                                const flowDirection = getFlowDirection(inv);

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
                                          <div className="flex items-center gap-2">
                                            {inv.invoiceDate && (
                                              <p className="text-[10px] text-muted-foreground">
                                                {new Date(inv.invoiceDate).toLocaleDateString("he-IL")}
                                              </p>
                                            )}
                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${FLOW_DIRECTION_LABELS[flowDirection].badgeClass}`}>
                                              {FLOW_DIRECTION_LABELS[flowDirection].label}
                                            </Badge>
                                          </div>
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
                                          <span className={`text-xs font-semibold ${FLOW_DIRECTION_LABELS[flowDirection].amountClass}`}>
                                            {formatAmountDisplay(inv, amount)}
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
  const effectiveAmount = getEffectiveAmount(inv);
  const flowDirection = getFlowDirection(inv);
  return (
    <div className={`border-t space-y-3 animate-fade-in ${nested ? "py-3 px-8 bg-muted/10" : "py-3 px-4"}`}>
      {effectiveAmount > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/10 px-4 py-2.5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Banknote className="w-4 h-4" />
            <span className="text-xs font-medium">סכום</span>
          </div>
          <p className={`text-lg font-bold ${FLOW_DIRECTION_LABELS[flowDirection].amountClass}`}>{formatAmountDisplay(inv, effectiveAmount)}</p>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
            {FLOW_DIRECTION_LABELS[flowDirection].icon}
            <span className="text-[11px] font-medium">סוג תזרים</span>
          </div>
          <p className="text-xs">{FLOW_DIRECTION_LABELS[flowDirection].label}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">סוג מסמך</span>
          </div>
          <p className="text-xs">{DOCUMENT_TYPE_LABELS[extracted.documentType ?? "unknown"] ?? extracted.documentType ?? "לא ידוע"}</p>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">תפקיד הצד השני</span>
          </div>
          <p className="text-xs">{COUNTERPARTY_ROLE_LABELS[extracted.counterpartyRole ?? "unknown"] ?? extracted.counterpartyRole ?? "לא ידוע"}</p>
        </div>
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
              <span className="text-[11px] font-medium">מספר מסמך</span>
            </div>
            <p className="text-xs">{extracted.invoiceNumber}</p>
          </div>
        )}
        {extracted.issuerName && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Building className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">מנפיק</span>
            </div>
            <p className="text-xs">{extracted.issuerName}</p>
          </div>
        )}
        {extracted.recipientName && (
          <div>
            <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
              <Users className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">נמען</span>
            </div>
            <p className="text-xs">{extracted.recipientName}</p>
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

      {extracted.classificationReason && (
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[11px] font-medium text-muted-foreground mb-1">סיבת הסיווג</p>
          <p className="text-sm">{extracted.classificationReason}</p>
          {typeof extracted.confidence === "number" && (
            <p className="text-[11px] text-muted-foreground mt-1">רמת ביטחון: {Math.round(extracted.confidence * 100)}%</p>
          )}
        </div>
      )}

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

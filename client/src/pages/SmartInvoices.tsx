import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Calendar,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  formatInsuranceMailAmount,
  getInsuranceMailDate,
  getInsuranceMailExtractedData,
  getInsuranceMailSearchText,
  hasInsuranceMailAttachment,
  isInsuranceRelatedInvoice,
} from "@/lib/insuranceMail";

const INSURANCE_DISCOVERY_LABELS: Record<string, string> = {
  policy_document: "מסמך פוליסה",
  renewal_notice: "חידוש",
  premium_notice: "פרמיה",
  coverage_update: "עדכון כיסוי",
  claim_update: "תביעה",
  other: "איתות כללי",
};

const INSURANCE_DISCOVERY_BADGES: Record<string, string> = {
  policy_document: "bg-blue-50 text-blue-700 border-blue-200",
  renewal_notice: "bg-amber-50 text-amber-700 border-amber-200",
  premium_notice: "bg-emerald-50 text-emerald-700 border-emerald-200",
  coverage_update: "bg-violet-50 text-violet-700 border-violet-200",
  claim_update: "bg-rose-50 text-rose-700 border-rose-200",
  other: "bg-slate-50 text-slate-700 border-slate-200",
};

const INSURANCE_CATEGORY_LABELS: Record<string, string> = {
  health: "בריאות",
  life: "חיים",
  car: "רכב",
  home: "דירה",
};

type InsuranceDiscovery = {
  id: number;
  provider?: string | null;
  insuranceCategory?: string | null;
  artifactType?: string | null;
  confidence?: number | null;
  premiumAmount?: number | null;
  policyNumber?: string | null;
  documentDate?: string | Date | null;
  subject?: string | null;
  summary?: string | null;
  actionHint?: string | null;
  attachmentFilename?: string | null;
  attachmentUrl?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  requiresExternalAccess?: boolean | null;
  externalAccessMode?: "portal_login" | "external_link" | null;
};

type InsuranceMailDocument = {
  id: number;
  provider?: string | null;
  category?: string | null;
  customCategory?: string | null;
  amount?: string | number | null;
  subject?: string | null;
  sourceEmail?: string | null;
  invoiceDate?: string | Date | null;
  createdAt?: string | Date | null;
  extractedData?: unknown;
};

function buildDiscoverySearchText(item: InsuranceDiscovery) {
  return [
    item.provider,
    item.subject,
    item.summary,
    item.actionHint,
    item.actionLabel,
    item.policyNumber,
    item.attachmentFilename,
    item.insuranceCategory ? INSURANCE_CATEGORY_LABELS[item.insuranceCategory] ?? item.insuranceCategory : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function SmartInvoices() {
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [isScanning, setIsScanning] = useState(false);
  const [scanDays, setScanDays] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");

  const utils = trpc.useUtils();

  const { data: connectionStatus, isLoading: statusLoading } =
    trpc.gmail.connectionStatus.useQuery(undefined, { enabled: !!user });

  const { data: invoices, isLoading: invoicesLoading, error: invoicesError } =
    trpc.gmail.getInvoices.useQuery({ limit: 100 }, { enabled: !!user, retry: 2 });

  const { data: insuranceDiscoveries, isLoading: discoveriesLoading, error: discoveriesError } =
    trpc.gmail.getInsuranceDiscoveries.useQuery({ limit: 40 }, { enabled: !!user, retry: 2 });

  const { data: authUrlData } = trpc.gmail.getAuthUrl.useQuery({}, { enabled: !!user });

  const disconnectMutation = trpc.gmail.disconnect.useMutation({
    onSuccess: async () => {
      toast.success("Gmail נותק");
      await Promise.all([
        utils.gmail.connectionStatus.invalidate(),
        utils.gmail.getInvoices.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
      ]);
    },
  });

  const scanMutation = trpc.gmail.scan.useMutation({
    onSuccess: async (result) => {
      setIsScanning(false);
      toast.success(
        `הסריקה הושלמה: נסרקו ${result.scanned} מיילים, נשמרו ${result.saved} פריטים מהמייל וזוהו ${result.discoveriesSaved} ממצאים ביטוחיים.`
      );
      await Promise.all([
        utils.gmail.getInvoices.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
        utils.gmail.connectionStatus.invalidate(),
      ]);
    },
    onError: (err) => {
      setIsScanning(false);
      toast.error(`שגיאה בסריקה: ${err.message}`);
    },
  });

  const clearAndRescanMutation = trpc.gmail.clearAndRescan.useMutation({
    onSuccess: async (result) => {
      setIsScanning(false);
      toast.success(
        `הסריקה מחדש הושלמה: נשמרו ${result.saved} פריטים מהמייל וזוהו ${result.discoveriesSaved} ממצאים ביטוחיים.`
      );
      await Promise.all([
        utils.gmail.getInvoices.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
        utils.gmail.connectionStatus.invalidate(),
      ]);
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
      window.history.replaceState({}, "", "/money");
      toast.success("Gmail חובר בהצלחה");
      void Promise.all([
        utils.gmail.connectionStatus.invalidate(),
        utils.gmail.getInvoices.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
      ]);
      return;
    }

    if (error) {
      window.history.replaceState({}, "", "/money");
      toast.error(`שגיאה בחיבור Gmail: ${decodeURIComponent(error)}`);
    }
  }, [utils.gmail.connectionStatus, utils.gmail.getInsuranceDiscoveries, utils.gmail.getInvoices]);

  const discoveryItems = useMemo(
    () => ((insuranceDiscoveries ?? []) as InsuranceDiscovery[]),
    [insuranceDiscoveries]
  );

  const insuranceMailDocuments = useMemo(
    () =>
      ((invoices ?? []) as InsuranceMailDocument[])
        .filter((item) => isInsuranceRelatedInvoice(item) && hasInsuranceMailAttachment(item))
        .sort((a, b) => {
          const aTime = getInsuranceMailDate(a)?.getTime() ?? 0;
          const bTime = getInsuranceMailDate(b)?.getTime() ?? 0;
          return bTime - aTime;
        }),
    [invoices]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredDiscoveries = useMemo(() => {
    if (!normalizedQuery) return discoveryItems;
    return discoveryItems.filter((item) => buildDiscoverySearchText(item).includes(normalizedQuery));
  }, [discoveryItems, normalizedQuery]);

  const filteredMailDocuments = useMemo(() => {
    if (!normalizedQuery) return insuranceMailDocuments;
    return insuranceMailDocuments.filter((item) => getInsuranceMailSearchText(item).includes(normalizedQuery));
  }, [insuranceMailDocuments, normalizedQuery]);

  const providerCount = useMemo(() => {
    const providers = new Set(
      [...discoveryItems.map((item) => item.provider), ...insuranceMailDocuments.map((item) => item.provider)].filter(Boolean)
    );
    return providers.size;
  }, [discoveryItems, insuranceMailDocuments]);

  const summary = useMemo(() => ({
    accounts: connectionStatus?.connections.length ?? 0,
    discoveries: discoveryItems.length,
    documents: insuranceMailDocuments.length,
    attachments: discoveryItems.filter((item) => Boolean(item.attachmentUrl)).length + insuranceMailDocuments.length,
    renewals: discoveryItems.filter((item) => item.artifactType === "renewal_notice").length,
    premiums: discoveryItems.filter((item) => item.artifactType === "premium_notice").length,
  }), [connectionStatus?.connections.length, discoveryItems, insuranceMailDocuments.length]);

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
            <h2 className="text-lg font-bold mb-2">סריקת מיילי ביטוח</h2>
            <p className="text-sm text-muted-foreground mb-5">יש להתחבר כדי לגשת למסך הזה</p>
            <Button onClick={() => navigate("/")}>חזרה ללומי</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6" data-testid="mail-scan-page">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-bl from-primary via-primary/90 to-chart-1 text-primary-foreground shadow-sm animate-fade-in-up">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.18),transparent_45%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/20">
                <ShieldCheck className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">סריקת מיילי ביטוח</h1>
                <p className="text-sm text-primary-foreground/75 mt-0.5">
                  לומי מזהה פוליסות, חידושים, פרמיות ומסמכים ביטוחיים ישירות מ-Gmail.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/documents")}
                className="gap-1.5 bg-white/15 text-white border border-white/20 hover:bg-white/25"
              >
                <FileText className="size-4" />
                למסמכים
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate("/insurance")}
                className="gap-1.5 bg-white/15 text-white border border-white/20 hover:bg-white/25"
              >
                <ShieldCheck className="size-4" />
                למרכז הביטוחים
              </Button>
            </div>
          </div>

          {connectionStatus?.connected && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6">
              <SummaryCard label="חשבונות מחוברים" value={summary.accounts} />
              <SummaryCard label="ממצאים ביטוחיים" value={summary.discoveries} />
              <SummaryCard label="מסמכים עם קובץ" value={summary.documents} />
              <SummaryCard label="חברות שזוהו" value={providerCount} />
            </div>
          )}
        </div>
      </div>

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
              המסך הזה עובד רק על מיילים ביטוחיים: פוליסות, חידושים, פרמיות ומסמכים מצורפים מחברות הביטוח.
            </p>
            <p className="text-xs text-muted-foreground mb-6 max-w-md mx-auto">
              גישה לקריאה בלבד · לא נשמר תוכן אישי שאינו רלוונטי · אפשר לנתק בכל רגע
            </p>
            <Button onClick={handleConnect} disabled={!authUrlData?.url} size="lg" className="gap-2">
              <Mail className="size-4" />
              חבר Gmail
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="animate-fade-in-up overflow-hidden border-border/60">
            <CardContent className="p-0">
              <div className="flex items-center gap-2 flex-wrap p-4 pb-3.5">
                {connectionStatus.connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="group flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200/80 pe-2.5 ps-3 py-1.5 transition-all hover:shadow-sm"
                  >
                    <div className="size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20 shrink-0" />
                    <span className="text-xs font-medium text-emerald-900 truncate max-w-[180px]">{conn.email}</span>
                    <span className="text-[10px] text-emerald-600/70 border-s border-emerald-200 ps-2 ms-0.5 shrink-0">
                      {conn.lastSyncCount ?? 0} פריטים
                      {conn.lastSyncedAt && (<> · {new Date(conn.lastSyncedAt).toLocaleDateString("he-IL")}</>)}
                    </span>
                    <button
                      onClick={() => disconnectMutation.mutate({ connectionId: conn.id })}
                      disabled={disconnectMutation.isPending}
                      className="p-0.5 rounded-full text-emerald-400 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100 shrink-0"
                      title="נתק חשבון"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={handleConnect}
                  disabled={!authUrlData?.url}
                  className="flex items-center gap-1.5 rounded-full border-2 border-dashed border-muted-foreground/20 px-3.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="size-3.5" />
                  חבר חשבון נוסף
                </button>
              </div>
              <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-t flex-wrap">
                <select
                  value={scanDays}
                  onChange={(event) => setScanDays(Number(event.target.value))}
                  className="text-xs border rounded-lg px-2.5 py-1.5 bg-card font-medium"
                >
                  <option value={7}>7 ימים</option>
                  <option value={14}>14 ימים</option>
                  <option value={30}>30 ימים</option>
                  <option value={60}>60 ימים</option>
                  <option value={90}>90 ימים</option>
                  <option value={180}>180 ימים</option>
                </select>
                <Button onClick={handleScan} disabled={isScanning} size="sm" className="gap-1.5 h-8 text-xs">
                  {isScanning ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      סורק...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-3.5" />
                      סרוק מיילי ביטוח
                    </>
                  )}
                </Button>
                {(discoveryItems.length > 0 || insuranceMailDocuments.length > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("האם למחוק את ממצאי המייל הקיימים ולסרוק מחדש?")) {
                        setIsScanning(true);
                        clearAndRescanMutation.mutate({ daysBack: scanDays });
                      }
                    }}
                    disabled={isScanning}
                    className="text-orange-600 border-orange-200 hover:bg-orange-50 gap-1.5 h-8 text-xs"
                  >
                    <RefreshCw className="size-3.5" />
                    מחק וסרוק מחדש
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="animate-fade-in-up stagger-1 border-border/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="חיפוש לפי חברת ביטוח, נושא מייל, תיאור או מספר פוליסה"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pr-9"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <Badge variant="outline" className="bg-background">
                    {summary.renewals} חידושים
                  </Badge>
                  <Badge variant="outline" className="bg-background">
                    {summary.premiums} עדכוני פרמיה
                  </Badge>
                  <Badge variant="outline" className="bg-background">
                    {summary.attachments} פריטים עם מסמך
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="animate-fade-in-up stagger-2 space-y-3" data-testid="insurance-discovery-section">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-500" />
              <h2 className="text-sm font-semibold">ממצאי ביטוח מהמייל</h2>
            </div>

            {discoveriesLoading ? (
              <LoadingCard />
            ) : discoveriesError ? (
              <ErrorCard
                title="שגיאה בטעינת ממצאי המייל"
                description="לא הצלחנו לטעון את הממצאים הביטוחיים כרגע."
                onRetry={() => utils.gmail.getInsuranceDiscoveries.invalidate()}
              />
            ) : filteredDiscoveries.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <div className="size-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                    <ShieldCheck className="size-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium">
                    {normalizedQuery ? "לא נמצאו ממצאים שמתאימים לחיפוש" : "עדיין לא זוהו ממצאי ביטוח מהמייל"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    {normalizedQuery
                      ? "נסה לחפש לפי שם חברת ביטוח, מספר פוליסה או נושא המייל."
                      : "סרוק תקופה רחבה יותר או חבר חשבון נוסף כדי שלומי יזהה פוליסות, חידושים ופרמיות."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {filteredDiscoveries.map((item) => {
                  const discoveryDate = item.documentDate ? new Date(item.documentDate) : null;
                  const isValidDate = discoveryDate && !Number.isNaN(discoveryDate.getTime());

                  return (
                    <Card
                      key={item.id}
                      className="border-border/70"
                      data-testid={`insurance-discovery-card-${item.id}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{item.provider || "גוף ביטוחי"}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {item.summary || item.subject || "זוהה מסר ביטוחי מהמייל"}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={INSURANCE_DISCOVERY_BADGES[item.artifactType || "other"] ?? INSURANCE_DISCOVERY_BADGES.other}
                          >
                            {INSURANCE_DISCOVERY_LABELS[item.artifactType || "other"] ?? INSURANCE_DISCOVERY_LABELS.other}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {item.insuranceCategory && (
                            <Badge variant="secondary">
                              {INSURANCE_CATEGORY_LABELS[item.insuranceCategory] ?? item.insuranceCategory}
                            </Badge>
                          )}
                          {item.policyNumber && (
                            <Badge variant="outline">{item.policyNumber}</Badge>
                          )}
                          {item.premiumAmount != null && (
                            <Badge variant="outline">₪{Number(item.premiumAmount).toLocaleString("he-IL")}</Badge>
                          )}
                          {isValidDate && (
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="size-3" />
                              {discoveryDate.toLocaleDateString("he-IL")}
                            </Badge>
                          )}
                        </div>

                        {item.actionHint && (
                          <div className="rounded-xl bg-muted/30 border border-border/60 px-3 py-2">
                            <p className="text-xs text-muted-foreground">{item.actionHint}</p>
                          </div>
                        )}

                        {item.actionUrl && !item.attachmentUrl && (
                          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
                            <p className="text-xs font-medium text-foreground">
                              {item.requiresExternalAccess
                                ? item.externalAccessMode === "portal_login"
                                  ? "המסמך נמצא מאחורי אזור אישי או התחברות."
                                  : "המסמך זמין דרך קישור חיצוני מתוך המייל."
                                : "נמצא קישור רלוונטי למסמך בתוך המייל."}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.requiresExternalAccess
                                ? "פתחו את הקישור, הורידו את ה־PDF, ואז חזרו ללומי כדי לנתח אותו."
                                : "אפשר לפתוח את הקישור כדי להגיע למסמך המקורי."}
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-[11px] text-muted-foreground">
                            {item.attachmentFilename
                              ? `קובץ: ${item.attachmentFilename}`
                              : item.actionUrl
                                ? "ללא PDF מצורף, זוהה קישור במייל"
                                : "ללא מסמך מצורף"}
                          </p>
                          <div className="flex items-center gap-2">
                            {item.attachmentUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(item.attachmentUrl || "", "_blank", "noopener,noreferrer")}
                                className="gap-1.5"
                              >
                                <Download className="size-3.5" />
                                פתח מסמך
                              </Button>
                            )}
                            {item.actionUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(item.actionUrl || "", "_blank", "noopener,noreferrer")}
                                className="gap-1.5"
                              >
                                <ExternalLink className="size-3.5" />
                                {item.requiresExternalAccess
                                  ? item.externalAccessMode === "portal_login"
                                    ? "פתח קישור והתחבר"
                                    : "פתח קישור למסמך"
                                  : (item.actionLabel?.trim() || "פתח קישור")}
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => navigate("/assistant")} className="gap-1.5">
                              <Sparkles className="size-3.5" />
                              שאל את לומי
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="animate-fade-in-up stagger-3 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">מסמכים ביטוחיים שזוהו במייל</h2>
            </div>

            {invoicesLoading ? (
              <LoadingCard />
            ) : invoicesError ? (
              <ErrorCard
                title="שגיאה בטעינת מסמכי המייל"
                description="לא הצלחנו לטעון את המסמכים שזוהו ב-Gmail."
                onRetry={() => utils.gmail.getInvoices.invalidate()}
              />
            ) : filteredMailDocuments.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                    <Mail className="size-7 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-sm font-semibold mb-1">
                    {normalizedQuery ? "לא נמצאו מסמכים שמתאימים לחיפוש" : "עדיין לא נשמרו מסמכים ביטוחיים מהמייל"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {normalizedQuery
                      ? "נסה לחפש לפי שם חברה, תיאור או שם הקובץ."
                      : "לחץ על \"סרוק מיילי ביטוח\" כדי לאתר PDF-ים, מסמכי פוליסה והודעות פרמיה. אם המייל מפנה דרך כפתור או אזור אישי, פתחו אותו והורידו PDF כדי שנוכל לנתח."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredMailDocuments.map((item) => {
                  const extracted = getInsuranceMailExtractedData(item);
                  const documentDate = getInsuranceMailDate(item);
                  const amount = Number(item.amount ?? 0) > 0 ? Number(item.amount) : Number.parseFloat(String(extracted.amount ?? 0)) || 0;

                  return (
                    <Card key={item.id} className="border-border/70">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold truncate">{item.provider || "גוף ביטוחי"}</p>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                מסמך מהמייל
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {extracted.description || item.subject || "זוהה מסמך ביטוחי מתוך המייל"}
                            </p>
                          </div>
                          {amount > 0 && (
                            <div className="text-end">
                              <p className="text-xs text-muted-foreground">סכום שזוהה</p>
                              <p className="text-sm font-semibold text-foreground">{formatInsuranceMailAmount(item, amount)}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {documentDate && (
                            <Badge variant="outline" className="gap-1">
                              <Calendar className="size-3" />
                              {documentDate.toLocaleDateString("he-IL")}
                            </Badge>
                          )}
                          {item.sourceEmail && (
                            <Badge variant="secondary">{item.sourceEmail}</Badge>
                          )}
                          {extracted.invoiceNumber && (
                            <Badge variant="outline">{extracted.invoiceNumber}</Badge>
                          )}
                          {extracted.pdfFilename && (
                            <Badge variant="outline">{extracted.pdfFilename}</Badge>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-[11px] text-muted-foreground">
                            הקובץ יופיע גם במסך המסמכים לשיוך ביטוחי או משפחתי.
                          </p>
                          <div className="flex items-center gap-2">
                            {extracted.pdfUrl && (
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                className="gap-1.5"
                              >
                                <a href={extracted.pdfUrl} target="_blank" rel="noopener noreferrer">
                                  <Download className="size-3.5" />
                                  פתח קובץ
                                </a>
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => navigate("/documents")} className="gap-1.5">
                              <FileText className="size-3.5" />
                              למסמכים
                            </Button>
                          </div>
                        </div>
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
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.08] backdrop-blur-sm p-4 ring-1 ring-white/10">
      <p className="text-[11px] text-primary-foreground/60 font-medium">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-none mt-1">{value}</p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="relative size-10">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

function ErrorCard({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <Card className="border-destructive/40">
      <CardContent className="py-10 text-center">
        <div className="size-12 rounded-2xl bg-destructive/8 flex items-center justify-center mx-auto mb-3">
          <X className="size-5 text-destructive/60" />
        </div>
        <h3 className="text-sm font-semibold mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          נסה שוב
        </Button>
      </CardContent>
    </Card>
  );
}

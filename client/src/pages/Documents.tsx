import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  FolderOpen,
  FileText,
  Shield,
  Wallet,
  Search,
  Eye,
  Calendar,
  Filter,
  Plus,
  Database,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

type DocType = "all" | "insurance" | "invoice";
type ManualDocumentType = "insurance" | "money" | "health" | "education" | "family" | "other";
type DocumentSourceType = "analysis_file" | "invoice_pdf";

interface DocumentItem {
  id: string;
  sourceType: DocumentSourceType;
  sourceId: string;
  name: string;
  type: "insurance" | "invoice";
  date: Date;
  description: string;
  assignedType: ManualDocumentType;
  defaultType: ManualDocumentType;
  manuallyAssigned: boolean;
  routeLink?: string;
  fileLink?: string;
  fileKey?: string;
}

type PolicyDocumentFile = string | { name?: string; fileKey?: string; url?: string };

const TYPE_CONFIG: Record<Exclude<DocType, "all">, { label: string; icon: React.ReactNode; color: string }> = {
  insurance: {
    label: "ביטוח",
    icon: <Shield className="size-3.5" />,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  invoice: {
    label: "חשבונית",
    icon: <Wallet className="size-3.5" />,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const MANUAL_DOCUMENT_TYPES: Array<{ value: ManualDocumentType; label: string }> = [
  { value: "insurance", label: "ביטוח" },
  { value: "money", label: "כסף" },
  { value: "health", label: "בריאות" },
  { value: "education", label: "לימודים" },
  { value: "family", label: "משפחה" },
  { value: "other", label: "אחר" },
];

const manualTypeLabels = Object.fromEntries(
  MANUAL_DOCUMENT_TYPES.map((item) => [item.value, item.label])
) as Record<ManualDocumentType, string>;

const legacyManualTypeMap: Record<string, ManualDocumentType> = {
  ביטוח: "insurance",
  כסף: "money",
  בריאות: "health",
  לימודים: "education",
  משפחה: "family",
  אחר: "other",
};

function getDefaultDocumentType(type: DocumentItem["type"]): ManualDocumentType {
  return type === "insurance" ? "insurance" : "money";
}

function normalizeLegacyDocumentType(value: string | null | undefined) {
  if (!value) return null;
  return legacyManualTypeMap[value] ?? null;
}

function getPolicyDocumentFileKey(file: PolicyDocumentFile) {
  if (typeof file === "string") {
    return undefined;
  }
  if (file.fileKey) {
    return file.fileKey;
  }
  if (typeof file.url === "string") {
    return file.url.replace(/^\/api\/files\//, "");
  }
  return undefined;
}

export default function Documents() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<DocType>("all");
  const [manualTypeFilter, setManualTypeFilter] = useState<ManualDocumentType | "all">("all");
  const [legacyMigrationChecked, setLegacyMigrationChecked] = useState(false);

  const { data: analyses } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 100 }, {
    enabled: !!user,
  });
  const classificationsQuery = trpc.documents.getClassifications.useQuery(undefined, {
    enabled: !!user,
  });

  const upsertClassificationMutation = trpc.documents.upsertClassification.useMutation({
    onMutate: async (input) => {
      await utils.documents.getClassifications.cancel();
      const previous = utils.documents.getClassifications.getData();
      utils.documents.getClassifications.setData(undefined, (current) => {
        const next = current ? [...current] : [];
        const index = next.findIndex((item) => item.documentKey === input.documentKey);
        const optimisticRow = {
          id: next[index]?.id ?? -Date.now(),
          userId: user?.id ?? 0,
          documentKey: input.documentKey,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          manualType: input.manualType,
          createdAt: next[index]?.createdAt ?? new Date(),
          updatedAt: new Date(),
        };
        if (index >= 0) {
          next[index] = optimisticRow;
        } else {
          next.unshift(optimisticRow);
        }
        return next;
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      utils.documents.getClassifications.setData(undefined, context?.previous);
      toast.error("לא הצלחנו לשמור את הסיווג");
    },
    onSettled: async () => {
      await utils.documents.getClassifications.invalidate();
    },
  });

  const migrateLegacyMutation = trpc.documents.migrateLegacyClassifications.useMutation({
    onSuccess: async () => {
      await utils.documents.getClassifications.invalidate();
    },
  });

  const storageKey = user ? `lumi-document-types:${user.id}` : "";
  const classificationsMap = useMemo(
    () =>
      Object.fromEntries(
        (classificationsQuery.data ?? []).map((item) => [item.documentKey, item.manualType])
      ) as Record<string, ManualDocumentType>,
    [classificationsQuery.data]
  );

  const baseDocuments = useMemo(() => {
    const items: Array<Omit<DocumentItem, "assignedType" | "manuallyAssigned">> = [];

    analyses?.forEach((analysis) => {
      if (analysis.status !== "completed") {
        return;
      }
      const analysisFiles = (analysis.files ?? []) as PolicyDocumentFile[];
      analysisFiles.forEach((file, index) => {
        const documentKey = `policy-${analysis.sessionId}-${index}`;
        items.push({
          id: documentKey,
          sourceType: "analysis_file",
          sourceId: analysis.sessionId,
          name: typeof file === "string" ? file : file.name || "פוליסה",
          type: "insurance",
          date: new Date(analysis.createdAt),
          description: analysis.analysisResult?.generalInfo?.policyName || "סריקת פוליסה",
          defaultType: getDefaultDocumentType("insurance"),
          fileKey: getPolicyDocumentFileKey(file),
          routeLink: `/insurance/${analysis.sessionId}`,
        });
      });
    });

    invoices?.forEach((invoice) => {
      const extracted = invoice.extractedData as Record<string, unknown> | null;
      if (!extracted?.pdfUrl || typeof extracted.pdfUrl !== "string") {
        return;
      }
      const documentKey = `invoice-${invoice.id}`;
      items.push({
        id: documentKey,
        sourceType: "invoice_pdf",
        sourceId: String(invoice.id),
        name:
          typeof extracted.pdfFilename === "string"
            ? extracted.pdfFilename
            : `חשבונית ${invoice.provider || "ללא ספק"}`,
        type: "invoice",
        date: invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(invoice.createdAt),
        description: `${invoice.provider || "ללא ספק"} — ₪${Number(invoice.amount ?? 0).toLocaleString("he-IL")}`,
        defaultType: getDefaultDocumentType("invoice"),
        fileLink: extracted.pdfUrl,
      });
    });

    return items;
  }, [analyses, invoices]);

  useEffect(() => {
    if (!user || !storageKey || !classificationsQuery.isSuccess || legacyMigrationChecked || migrateLegacyMutation.isPending) {
      return;
    }
    setLegacyMigrationChecked(true);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, string>;
      const items = baseDocuments
        .filter((doc) => parsed[doc.id] && !classificationsMap[doc.id])
        .map((doc) => {
          const manualType = normalizeLegacyDocumentType(parsed[doc.id]) ?? doc.defaultType;
          return {
            documentKey: doc.id,
            sourceType: doc.sourceType,
            sourceId: doc.sourceId,
            manualType,
          };
        });
      if (items.length === 0) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      migrateLegacyMutation.mutate(
        { items },
        {
          onSuccess: () => {
            window.localStorage.removeItem(storageKey);
            toast.success("הסיווגים הישנים הועברו לשרת");
          },
          onError: () => {
            toast.error("לא הצלחנו להעביר את הסיווגים הישנים");
          },
        }
      );
    } catch {
      toast.error("לא הצלחנו לקרוא את הסיווגים הישנים מהדפדפן");
    }
  }, [
    user,
    storageKey,
    classificationsQuery.isSuccess,
    legacyMigrationChecked,
    migrateLegacyMutation,
    baseDocuments,
    classificationsMap,
  ]);

  const documents: DocumentItem[] = useMemo(
    () =>
      baseDocuments.map((doc) => ({
        ...doc,
        assignedType: classificationsMap[doc.id] ?? doc.defaultType,
        manuallyAssigned: Boolean(classificationsMap[doc.id]),
      })),
    [baseDocuments, classificationsMap]
  );

  const filteredDocs = documents.filter((doc) => {
    if (filterType !== "all" && doc.type !== filterType) return false;
    if (manualTypeFilter !== "all" && doc.assignedType !== manualTypeFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        doc.name.toLowerCase().includes(query) ||
        doc.description.toLowerCase().includes(query) ||
        manualTypeLabels[doc.assignedType].toLowerCase().includes(query)
      );
    }
    return true;
  });

  filteredDocs.sort((a, b) => b.date.getTime() - a.date.getTime());

  const insuranceCount = documents.filter((doc) => doc.type === "insurance").length;
  const invoiceCount = documents.filter((doc) => doc.type === "invoice").length;
  const manuallyClassifiedCount = documents.filter((doc) => doc.manuallyAssigned).length;

  const handleSaveDocumentType = (doc: DocumentItem, manualType: ManualDocumentType) => {
    upsertClassificationMutation.mutate({
      documentKey: doc.id,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      manualType,
    });
  };

  if (!user) return null;

  return (
    <div className="page-container" data-testid="documents-page">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <FolderOpen className="size-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">מסמכים</h2>
            <p className="text-xs text-muted-foreground">כל המסמכים שלך מאורגנים במקום אחד, עם סיווג ידני שנשמר בשרת</p>
          </div>
        </div>
        <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
          <Plus className="size-4" />
          העלה מסמך
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-fade-in-up stagger-1">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-foreground">{documents.length}</p>
            <p className="text-xs text-muted-foreground mt-1">סה"כ מסמכים</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-blue-600">{insuranceCount}</p>
            <p className="text-xs text-muted-foreground mt-1">פוליסות ביטוח</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-emerald-600">{invoiceCount}</p>
            <p className="text-xs text-muted-foreground mt-1">חשבוניות</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-violet-600">{manuallyClassifiedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">סווגו ידנית</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 animate-fade-in-up stagger-2 border-border/60">
        <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Database className="size-4 text-primary" />
          <p>
            סיווגי המסמכים נשמרים עכשיו בשרת. אם היו לך סיווגים ישנים בדפדפן, לומי יעביר אותם אוטומטית בפעם הראשונה.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 mb-4 animate-fade-in-up stagger-3 flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="חפש מסמך..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pr-10"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="size-4 text-muted-foreground" />
          {(["all", "insurance", "invoice"] as DocType[]).map((type) => (
            <Button
              key={type}
              variant={filterType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterType(type)}
              className="text-xs"
            >
              {type === "all" ? "הכל" : TYPE_CONFIG[type].label}
            </Button>
          ))}
        </div>
        <select
          value={manualTypeFilter}
          onChange={(event) => setManualTypeFilter(event.target.value as ManualDocumentType | "all")}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">כל סוגי המסמכים</option>
          {MANUAL_DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {filteredDocs.length > 0 ? (
        <div className="space-y-2 animate-fade-in-up stagger-4">
          {filteredDocs.map((doc) => {
            const config = TYPE_CONFIG[doc.type];
            return (
              <Card key={doc.id} className="hover:shadow-md hover:border-primary/20 transition-all duration-200">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <Badge variant="outline" className={`text-[10px] gap-1 shrink-0 ${config.color}`}>
                          {config.icon}
                          {config.label}
                        </Badge>
                        <Badge variant={doc.manuallyAssigned ? "default" : "secondary"} className="text-[10px] shrink-0">
                          {manualTypeLabels[doc.assignedType]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-left space-y-2">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3" />
                          {format(doc.date, "dd.MM.yy", { locale: he })}
                        </div>
                        <select
                          data-testid={`document-type-select-${doc.id}`}
                          value={doc.assignedType}
                          onChange={(event) => handleSaveDocumentType(doc, event.target.value as ManualDocumentType)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {MANUAL_DOCUMENT_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {(doc.fileKey || doc.routeLink || doc.fileLink) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (doc.sourceType === "analysis_file" && doc.fileKey) {
                              const previewWindow = window.open("", "_blank", "noopener,noreferrer");
                              try {
                                const { url } = await utils.policy.getSecureFileUrl.fetch({
                                  sessionId: doc.sourceId,
                                  fileKey: doc.fileKey,
                                });
                                if (previewWindow) {
                                  previewWindow.location.href = url;
                                } else {
                                  window.location.assign(url);
                                }
                                return;
                              } catch {
                                previewWindow?.close();
                                toast.error("לא הצלחנו לפתוח את קובץ ה-PDF");
                                return;
                              }
                            }
                            if (doc.fileLink) {
                              window.open(doc.fileLink, "_blank", "noopener,noreferrer");
                              return;
                            }
                            if (doc.routeLink) {
                              setLocation(doc.routeLink);
                            }
                          }}
                          className="gap-1"
                        >
                          <Eye className="size-3.5" />
                          צפה
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : documents.length > 0 ? (
        <Card className="border-dashed animate-fade-in-up stagger-4">
          <CardContent className="py-12 text-center">
            <Search className="size-8 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">לא נמצאו תוצאות</h3>
            <p className="text-xs text-muted-foreground mt-1">נסה לשנות את החיפוש או הפילטר</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed animate-fade-in-up stagger-4">
          <CardContent className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
              <FolderOpen className="size-8 text-muted-foreground/40" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">אין מסמכים עדיין</h3>
            <p className="text-sm text-muted-foreground mb-5">
              העלה פוליסות או חבר Gmail כדי שהמסמכים יופיעו כאן
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
                <Plus className="size-4" />
                העלה פוליסה
              </Button>
              <Button variant="outline" onClick={() => setLocation("/money")} className="gap-2">
                <Wallet className="size-4" />
                חבר Gmail
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

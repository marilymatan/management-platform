import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
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
  Database,
  Eye,
  FileText,
  Filter,
  FolderOpen,
  Mail,
  Plus,
  Search,
  Shield,
  Users,
} from "lucide-react";
import {
  getInsuranceMailDate,
  getInsuranceMailExtractedData,
  hasInsuranceMailAttachment,
  isInsuranceRelatedInvoice,
} from "@/lib/insuranceMail";

type DocType = "all" | "policy" | "mail";
type StoredManualDocumentType = "insurance" | "family" | "money" | "health" | "education" | "other";
type DocumentAssignmentValue = "insurance" | "family:unassigned" | `family:${number}`;
type DocumentAssignmentFilter = "all" | DocumentAssignmentValue;
type DocumentSourceType = "analysis_file" | "invoice_pdf";

interface FamilyMemberRecord {
  id: number;
  fullName: string;
}

interface DocumentItem {
  id: string;
  sourceType: DocumentSourceType;
  sourceId: string;
  name: string;
  type: Exclude<DocType, "all">;
  date: Date;
  description: string;
  assignedType: StoredManualDocumentType;
  assignedFamilyMemberId: number | null;
  defaultType: StoredManualDocumentType;
  manuallyAssigned: boolean;
  routeLink?: string;
  fileLink?: string;
  fileKey?: string;
}

type PolicyDocumentFile = string | { name?: string; fileKey?: string; url?: string };

const TYPE_CONFIG: Record<Exclude<DocType, "all">, { label: string; icon: React.ReactNode; color: string }> = {
  policy: {
    label: "פוליסה",
    icon: <Shield className="size-3.5" />,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  mail: {
    label: "מייל ביטוחי",
    icon: <Mail className="size-3.5" />,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const legacyManualTypeMap: Record<string, StoredManualDocumentType> = {
  ביטוח: "insurance",
  כסף: "insurance",
  בריאות: "insurance",
  לימודים: "insurance",
  משפחה: "family",
  אחר: "insurance",
};

function getDefaultDocumentType(): StoredManualDocumentType {
  return "insurance";
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

function openDocumentPreview(url: string, previewWindow?: Window | null) {
  const nextWindow = previewWindow ?? window.open("about:blank", "_blank");
  if (!nextWindow) {
    return false;
  }
  nextWindow.opener = null;
  nextWindow.location.replace(url);
  return true;
}

function getAssignmentLabel(
  manualType: StoredManualDocumentType,
  familyMemberId: number | null,
  familyMembersMap: Map<number, string>
) {
  if (manualType === "family") {
    return familyMemberId ? familyMembersMap.get(familyMemberId) ?? "בן משפחה" : "בן משפחה";
  }
  return "ביטוח";
}

function getAssignmentValue(document: DocumentItem): DocumentAssignmentValue {
  if (document.assignedType === "family") {
    return document.assignedFamilyMemberId ? `family:${document.assignedFamilyMemberId}` : "family:unassigned";
  }
  return "insurance";
}

function parseAssignmentValue(value: DocumentAssignmentValue) {
  if (value === "insurance") {
    return { manualType: "insurance" as const, familyMemberId: null };
  }
  if (value === "family:unassigned") {
    return { manualType: "family" as const, familyMemberId: null };
  }
  return {
    manualType: "family" as const,
    familyMemberId: Number.parseInt(value.replace("family:", ""), 10) || null,
  };
}

export default function Documents() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<DocType>("all");
  const [assignmentFilter, setAssignmentFilter] = useState<DocumentAssignmentFilter>("all");
  const [legacyMigrationChecked, setLegacyMigrationChecked] = useState(false);

  const { data: analyses } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 100 }, {
    enabled: !!user,
  });
  const { data: familyMembers } = trpc.family.list.useQuery(undefined, {
    enabled: !!user,
  });
  const classificationsQuery = trpc.documents.getClassifications.useQuery(undefined, {
    enabled: !!user,
  });

  const familyMembersMap = useMemo(
    () => new Map(((familyMembers ?? []) as FamilyMemberRecord[]).map((member) => [member.id, member.fullName])),
    [familyMembers]
  );

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
          familyMemberId: input.familyMemberId ?? null,
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
      toast.error("לא הצלחנו לשמור את השיוך");
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
        (classificationsQuery.data ?? []).map((item) => [
          item.documentKey,
          {
            manualType: item.manualType as StoredManualDocumentType,
            familyMemberId: item.familyMemberId ?? null,
          },
        ])
      ) as Record<string, { manualType: StoredManualDocumentType; familyMemberId: number | null }>,
    [classificationsQuery.data]
  );

  const baseDocuments = useMemo(() => {
    const items: Array<Omit<DocumentItem, "assignedType" | "assignedFamilyMemberId" | "manuallyAssigned">> = [];

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
          type: "policy",
          date: new Date(analysis.createdAt),
          description: analysis.analysisResult?.generalInfo?.policyName || "קובץ פוליסה",
          defaultType: getDefaultDocumentType(),
          fileKey: getPolicyDocumentFileKey(file),
          routeLink: `/insurance/${analysis.sessionId}`,
        });
      });
    });

    (invoices ?? [])
      .filter((invoice) => isInsuranceRelatedInvoice(invoice) && hasInsuranceMailAttachment(invoice))
      .forEach((invoice) => {
        const extracted = getInsuranceMailExtractedData(invoice);
        if (!extracted.pdfUrl || typeof extracted.pdfUrl !== "string") {
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
              : `מסמך מ-${invoice.provider || "גוף ביטוחי"}`,
          type: "mail",
          date: getInsuranceMailDate(invoice) ?? new Date(),
          description: extracted.description || invoice.subject || "מסמך ביטוחי שזוהה מתוך Gmail",
          defaultType: getDefaultDocumentType(),
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
            familyMemberId: null,
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
            toast.success("השיוכים הישנים הועברו לשרת");
          },
          onError: () => {
            toast.error("לא הצלחנו להעביר את השיוכים הישנים");
          },
        }
      );
    } catch {
      toast.error("לא הצלחנו לקרוא את השיוכים הישנים מהדפדפן");
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
        assignedType: classificationsMap[doc.id]?.manualType ?? doc.defaultType,
        assignedFamilyMemberId: classificationsMap[doc.id]?.familyMemberId ?? null,
        manuallyAssigned: Boolean(classificationsMap[doc.id]),
      })),
    [baseDocuments, classificationsMap]
  );

  const filteredDocs = documents.filter((doc) => {
    if (filterType !== "all" && doc.type !== filterType) return false;
    if (assignmentFilter !== "all" && getAssignmentValue(doc) !== assignmentFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const assignmentLabel = getAssignmentLabel(doc.assignedType, doc.assignedFamilyMemberId, familyMembersMap);
      return (
        doc.name.toLowerCase().includes(query) ||
        doc.description.toLowerCase().includes(query) ||
        assignmentLabel.toLowerCase().includes(query)
      );
    }
    return true;
  });

  filteredDocs.sort((a, b) => b.date.getTime() - a.date.getTime());

  const policyCount = documents.filter((doc) => doc.type === "policy").length;
  const mailCount = documents.filter((doc) => doc.type === "mail").length;
  const manuallyClassifiedCount = documents.filter((doc) => doc.manuallyAssigned).length;
  const hasUnassignedFamilyDocuments = documents.some(
    (doc) => doc.assignedType === "family" && !doc.assignedFamilyMemberId
  );

  const handleSaveDocumentType = (doc: DocumentItem, value: DocumentAssignmentValue) => {
    const nextAssignment = parseAssignmentValue(value);
    upsertClassificationMutation.mutate({
      documentKey: doc.id,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      manualType: nextAssignment.manualType,
      familyMemberId: nextAssignment.familyMemberId,
    });
  };

  const handleOpenDocument = async (doc: DocumentItem) => {
    if (doc.sourceType === "analysis_file" && doc.fileKey) {
      const previewWindow = window.open("about:blank", "_blank");
      try {
        const { url } = await utils.policy.getSecureFileUrl.fetch({
          sessionId: doc.sourceId,
          fileKey: doc.fileKey,
        });
        if (!openDocumentPreview(url, previewWindow)) {
          toast.error("הדפדפן חסם את פתיחת המסמך. אפשר חלונות קופצים ונסה שוב");
        }
        return;
      } catch {
        previewWindow?.close();
        toast.error("לא הצלחנו לפתוח את קובץ ה-PDF");
        return;
      }
    }
    if (doc.fileLink) {
      if (!openDocumentPreview(doc.fileLink)) {
        toast.error("הדפדפן חסם את פתיחת המסמך. אפשר חלונות קופצים ונסה שוב");
      }
      return;
    }
    if (doc.routeLink) {
      setLocation(doc.routeLink);
    }
  };

  if (!user) return null;

  return (
    <div className="page-container" data-testid="documents-page">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FolderOpen className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">מסמכי ביטוח</h2>
            <p className="text-xs text-muted-foreground">
              פוליסות ומסמכי מייל ביטוחיים במקום אחד, עם שיוך לתיק הכללי או לבני הבית
            </p>
          </div>
        </div>
        <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
          <Plus className="size-4" />
          העלה פוליסה
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
            <p className="text-3xl font-bold text-blue-600">{policyCount}</p>
            <p className="text-xs text-muted-foreground mt-1">פוליסות</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-emerald-600">{mailCount}</p>
            <p className="text-xs text-muted-foreground mt-1">מסמכי מייל</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-3xl font-bold text-primary">{manuallyClassifiedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">שיוכים ידניים</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4 animate-fade-in-up stagger-2 border-border/60">
        <CardContent className="p-4 flex items-center gap-3 text-sm text-muted-foreground">
          <Database className="size-4 text-primary" />
          <p>
            שיוכי המסמכים נשמרים בשרת. אפשר להשאיר מסמך תחת "ביטוח" או לשייך אותו לבן משפחה ספציפי.
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
          {(["all", "policy", "mail"] as DocType[]).map((type) => (
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
          value={assignmentFilter}
          onChange={(event) => setAssignmentFilter(event.target.value as DocumentAssignmentFilter)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">כל השיוכים</option>
          <option value="insurance">ביטוח</option>
          {((familyMembers ?? []) as FamilyMemberRecord[]).map((member) => (
            <option key={member.id} value={`family:${member.id}`}>
              {member.fullName}
            </option>
          ))}
          {hasUnassignedFamilyDocuments && <option value="family:unassigned">בן משפחה ללא שיוך</option>}
        </select>
      </div>

      {filteredDocs.length > 0 ? (
        <div className="space-y-2 animate-fade-in-up stagger-4">
          {filteredDocs.map((doc) => {
            const config = TYPE_CONFIG[doc.type];
            const assignmentLabel = getAssignmentLabel(doc.assignedType, doc.assignedFamilyMemberId, familyMembersMap);

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
                        <Badge variant={doc.manuallyAssigned ? "default" : "secondary"} className="text-[10px] shrink-0 gap-1">
                          {doc.assignedType === "family" ? <Users className="size-3" /> : <Shield className="size-3" />}
                          {assignmentLabel}
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
                          value={getAssignmentValue(doc)}
                          onChange={(event) => handleSaveDocumentType(doc, event.target.value as DocumentAssignmentValue)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <option value="insurance">ביטוח</option>
                          {((familyMembers ?? []) as FamilyMemberRecord[]).map((member) => (
                            <option key={member.id} value={`family:${member.id}`}>
                              {member.fullName}
                            </option>
                          ))}
                          {(doc.assignedType === "family" || hasUnassignedFamilyDocuments) && (
                            <option value="family:unassigned">בן משפחה ללא שיוך</option>
                          )}
                        </select>
                      </div>
                      {(doc.fileKey || doc.routeLink || doc.fileLink) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`document-view-${doc.id}`}
                          onClick={() => void handleOpenDocument(doc)}
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
            <p className="text-xs text-muted-foreground mt-1">נסה לשנות את החיפוש או את הסינון</p>
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
              העלה פוליסות או פתח את מסך סריקת המיילים כדי שמסמכי הביטוח יופיעו כאן
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
                <Plus className="size-4" />
                העלה פוליסה
              </Button>
              <Button variant="outline" onClick={() => setLocation("/money")} className="gap-2">
                <Mail className="size-4" />
                פתח סריקת מיילים
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

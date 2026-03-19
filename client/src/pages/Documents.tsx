import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

type DocType = "all" | "insurance" | "invoice";

interface DocumentItem {
  id: string;
  name: string;
  type: "insurance" | "invoice";
  date: Date;
  description: string;
  link?: string;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
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

export default function Documents() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<DocType>("all");

  const { data: analyses } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 100 }, {
    enabled: !!user,
  });

  if (!user) return null;

  const documents: DocumentItem[] = [];

  analyses?.forEach(analysis => {
    if (analysis.status === "completed") {
      analysis.files?.forEach((file, idx) => {
        documents.push({
          id: `policy-${analysis.sessionId}-${idx}`,
          name: typeof file === "string" ? file : (file as any).name || "פוליסה",
          type: "insurance",
          date: new Date(analysis.createdAt),
          description: analysis.analysisResult?.generalInfo?.policyName || "ניתוח פוליסה",
          link: `/insurance/${analysis.sessionId}`,
        });
      });
    }
  });

  invoices?.forEach(inv => {
    const extracted = inv.extractedData as any;
    if (extracted?.pdfUrl) {
      documents.push({
        id: `invoice-${inv.id}`,
        name: extracted.pdfFilename || `חשבונית ${inv.provider}`,
        type: "invoice",
        date: inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(),
        description: `${inv.provider} — ₪${Number(inv.amount).toLocaleString("he-IL")}`,
      });
    }
  });

  const filteredDocs = documents.filter(doc => {
    if (filterType !== "all" && doc.type !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        doc.name.toLowerCase().includes(query) ||
        doc.description.toLowerCase().includes(query)
      );
    }
    return true;
  });

  filteredDocs.sort((a, b) => b.date.getTime() - a.date.getTime());

  const insuranceCount = documents.filter(d => d.type === "insurance").length;
  const invoiceCount = documents.filter(d => d.type === "invoice").length;

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <FolderOpen className="size-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">מסמכים</h2>
            <p className="text-xs text-muted-foreground">כל המסמכים שלך מאורגנים במקום אחד</p>
          </div>
        </div>
        <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
          <Plus className="size-4" />
          העלה מסמך
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6 animate-fade-in-up stagger-1">
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
      </div>

      <div className="flex items-center gap-3 mb-4 animate-fade-in-up stagger-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="חפש מסמך..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="size-4 text-muted-foreground" />
          {(["all", "insurance", "invoice"] as DocType[]).map(type => (
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
      </div>

      {filteredDocs.length > 0 ? (
        <div className="space-y-2 animate-fade-in-up stagger-3">
          {filteredDocs.map(doc => {
            const config = TYPE_CONFIG[doc.type];
            return (
              <Card key={doc.id} className="hover:shadow-md hover:border-primary/20 transition-all duration-200">
                <CardContent className="py-3 px-5">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium truncate">{doc.name}</p>
                        <Badge variant="outline" className={`text-[10px] gap-1 shrink-0 ${config.color}`}>
                          {config.icon}
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{doc.description}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-left">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="size-3" />
                          {format(doc.date, "dd.MM.yy", { locale: he })}
                        </div>
                      </div>
                      {doc.link && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(doc.link!)}
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
        <Card className="border-dashed animate-fade-in-up stagger-3">
          <CardContent className="py-12 text-center">
            <Search className="size-8 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">לא נמצאו תוצאות</h3>
            <p className="text-xs text-muted-foreground mt-1">נסה לשנות את החיפוש או הפילטר</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed animate-fade-in-up stagger-3">
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
              <Button variant="outline" onClick={() => setLocation("/expenses")} className="gap-2">
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

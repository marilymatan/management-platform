import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  Plus,
  FileText,
  Trash2,
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  Heart,
  Car,
  Home,
  User,
  ScanLine,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useMemo } from "react";
import type { InsuranceCategory } from "@shared/insurance";
import { inferInsuranceCategory } from "@shared/insurance";

const CATEGORY_CONFIG: Record<
  InsuranceCategory,
  {
    label: string;
    icon: React.ReactNode;
    gradient: string;
    iconBg: string;
    textColor: string;
  }
> = {
  health: {
    label: "ביטוחי בריאות",
    icon: <Heart className="size-5" />,
    gradient: "from-rose-500/12 to-pink-500/6",
    iconBg: "bg-rose-100",
    textColor: "text-rose-600",
  },
  life: {
    label: "ביטוחי חיים",
    icon: <User className="size-5" />,
    gradient: "from-blue-500/12 to-indigo-500/6",
    iconBg: "bg-blue-100",
    textColor: "text-blue-600",
  },
  car: {
    label: "ביטוחי רכב",
    icon: <Car className="size-5" />,
    gradient: "from-amber-500/12 to-orange-500/6",
    iconBg: "bg-amber-100",
    textColor: "text-amber-600",
  },
  home: {
    label: "ביטוחי דירה",
    icon: <Home className="size-5" />,
    gradient: "from-emerald-500/12 to-teal-500/6",
    iconBg: "bg-emerald-100",
    textColor: "text-emerald-600",
  },
};

export default function InsuranceCategoryPage() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/insurance/category/:category");
  const category = params?.category as InsuranceCategory | undefined;

  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const utils = trpc.useUtils();
  const deleteAnalysisMutation = trpc.policy.delete.useMutation({
    onSuccess: () => {
      toast.success("הסריקה נמחקה בהצלחה");
      utils.policy.getUserAnalyses.invalidate();
    },
    onError: (error) => {
      toast.error("שגיאה במחיקת הסריקה: " + error.message);
    },
  });

  const filteredAnalyses = useMemo(() => {
    if (!analyses || !category) return [];
    return analyses.filter((analysis) => {
      const cat =
        (analysis as any).insuranceCategory ??
        analysis.analysisResult?.generalInfo?.insuranceCategory ??
        inferInsuranceCategory(
          analysis.analysisResult?.generalInfo?.policyType,
          analysis.analysisResult?.coverages
        );
      return cat === category;
    });
  }, [analyses, category]);

  if (!user || !category || !CATEGORY_CONFIG[category]) return null;

  const config = CATEGORY_CONFIG[category];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
            <CheckCircle className="size-3" />
            הושלם
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
            <Clock className="size-3" />
            בעיבוד
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
            <Clock className="size-3" />
            בהמתנה
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-red-50 text-red-700 border-red-200 gap-1">
            <AlertCircle className="size-3" />
            שגיאה
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/insurance")}
            className="size-10 shrink-0"
          >
            <ArrowRight className="size-5" />
          </Button>
          <div className={`size-10 rounded-xl ${config.iconBg} flex items-center justify-center ${config.textColor}`}>
            {config.icon}
          </div>
          <div>
            <h2 className="text-xl font-bold">{config.label}</h2>
            <p className="text-xs text-muted-foreground">
              {filteredAnalyses.length} {filteredAnalyses.length === 1 ? "סריקה" : "סריקות"} ·{" "}
              {filteredAnalyses.reduce((sum, a) => sum + (a.files?.length || 0), 0)} קבצי PDF
            </p>
          </div>
        </div>
        <Button
          onClick={() => setLocation("/insurance/new")}
          size="lg"
          className="gap-2 shadow-md"
        >
          <Plus className="size-5" />
          סריקה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 animate-fade-in-up stagger-1">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-xl ${config.iconBg} flex items-center justify-center ${config.textColor}`}>
                <ScanLine className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">סריקות</p>
                <p className="text-2xl font-bold">{filteredAnalyses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">קבצי PDF</p>
                <p className="text-2xl font-bold">
                  {filteredAnalyses.reduce((sum, a) => sum + (a.files?.length || 0), 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="py-5">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredAnalyses.length > 0 ? (
        <div className="space-y-3 animate-fade-in-up stagger-2">
          {filteredAnalyses.map((analysis) => (
            <Card
              key={analysis.sessionId}
              className="group hover:shadow-md hover:border-primary/20 transition-all duration-200"
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  <div className={`size-10 rounded-xl ${config.iconBg} flex items-center justify-center shrink-0 ${config.textColor}`}>
                    <FileText className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold truncate">
                        {analysis.analysisResult?.generalInfo?.policyName || "סריקת פוליסה"}
                      </p>
                      {getStatusBadge(analysis.status)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {analysis.analysisResult?.summary || "אין סיכום זמין"}
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center gap-6 shrink-0 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">תאריך</p>
                      <p className="text-xs font-medium">
                        {format(new Date(analysis.createdAt), "dd.MM.yy", { locale: he })}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">קבצים</p>
                      <p className="text-xs font-medium">{analysis.files.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">כיסויים</p>
                      <p className="text-xs font-medium">{analysis.analysisResult?.coverages?.length || 0}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {analysis.status === "completed" && (
                      <Button
                        onClick={() => setLocation(`/insurance/${analysis.sessionId}`)}
                        variant="default"
                        size="sm"
                        className="gap-1.5 h-8"
                      >
                        <Eye className="size-3.5" />
                        <span className="hidden sm:inline">צפה</span>
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent dir="rtl">
                        <AlertDialogTitle>מחק סריקה</AlertDialogTitle>
                        <AlertDialogDescription>
                          האם אתה בטוח שברצונך למחוק סריקה זו? לא ניתן לבטל פעולה זו.
                        </AlertDialogDescription>
                        <div className="flex gap-2 justify-end">
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteAnalysisMutation.mutate({ sessionId: analysis.sessionId })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            מחק
                          </AlertDialogAction>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed animate-fade-in-up stagger-2">
          <CardContent className="py-16 text-center">
            <div className={`size-16 rounded-2xl ${config.iconBg} flex items-center justify-center mx-auto mb-4 ${config.textColor} opacity-40`}>
              {config.icon}
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              אין סריקות ב{config.label}
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              העלה פוליסת {config.label.replace("ביטוחי ", "")} וקבל סריקה מפורטת
            </p>
            <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
              <Plus className="size-4" />
              סריקה חדשה
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

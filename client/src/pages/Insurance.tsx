import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
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
  BarChart3,
  Layers,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function Insurance() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const utils = trpc.useUtils();
  const deleteAnalysisMutation = trpc.policy.delete.useMutation({
    onSuccess: () => {
      toast.success("הניתוח נמחק בהצלחה");
      utils.policy.getUserAnalyses.invalidate();
    },
    onError: (error) => {
      toast.error("שגיאה במחיקת הניתוח: " + error.message);
    },
  });

  if (!user) return null;

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

  const completedAnalyses = analyses?.filter(a => a.status === "completed") || [];
  const totalCoverages = completedAnalyses.reduce(
    (sum, a) => sum + (a.analysisResult?.coverages?.length || 0), 0
  );

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center">
            <Shield className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">ביטוחים</h2>
            <p className="text-xs text-muted-foreground">ניהול פוליסות, כיסויים וניתוחים</p>
          </div>
        </div>
        <Button
          onClick={() => setLocation("/insurance/new")}
          size="lg"
          className="gap-2 shadow-md"
        >
          <Plus className="size-5" />
          ניתוח חדש
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "סה\"כ ניתוחים",
            value: analyses?.length || 0,
            icon: <BarChart3 className="size-5" />,
            color: "from-blue-500/10 to-blue-500/5 text-blue-600",
            iconBg: "bg-blue-100",
          },
          {
            label: "כיסויים פעילים",
            value: totalCoverages,
            icon: <Shield className="size-5" />,
            color: "from-emerald-500/10 to-emerald-500/5 text-emerald-600",
            iconBg: "bg-emerald-100",
          },
          {
            label: "קבצים שנותחו",
            value: analyses?.reduce((sum, a) => sum + (a.files?.length || 0), 0) || 0,
            icon: <FileText className="size-5" />,
            color: "from-violet-500/10 to-violet-500/5 text-violet-600",
            iconBg: "bg-violet-100",
          },
          {
            label: "הושלמו",
            value: completedAnalyses.length,
            icon: <CheckCircle className="size-5" />,
            color: "from-amber-500/10 to-amber-500/5 text-amber-600",
            iconBg: "bg-amber-100",
          },
        ].map((stat, i) => (
          <Card key={i} className={`overflow-hidden animate-fade-in-up stagger-${i + 1}`}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-xl ${stat.iconBg} flex items-center justify-center ${stat.color.split(" ").pop()}`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="animate-fade-in-up stagger-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            הפוליסות שלך
            {analyses && analyses.length > 0 && (
              <Badge variant="secondary" className="text-xs">{analyses.length}</Badge>
            )}
          </h3>
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
        ) : analyses && analyses.length > 0 ? (
          <div className="space-y-3">
            {analyses.map((analysis) => (
              <Card
                key={analysis.sessionId}
                className="group hover:shadow-md hover:border-primary/20 transition-all duration-200"
              >
                <CardContent className="py-4 px-5">
                  <div className="flex items-center gap-4">
                    <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                      <FileText className="size-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold truncate">
                          {analysis.analysisResult?.generalInfo?.policyName || "ניתוח פוליסה"}
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
                          <AlertDialogTitle>מחק ניתוח</AlertDialogTitle>
                          <AlertDialogDescription>
                            האם אתה בטוח שברצונך למחוק ניתוח זה? לא ניתן לבטל פעולה זו.
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
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                <FileText className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">אין ביטוחים עדיין</h3>
              <p className="text-sm text-muted-foreground mb-5">העלה את הפוליסה הראשונה שלך וקבל ניתוח מפורט</p>
              <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
                <Plus className="size-4" />
                ניתוח ראשון
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

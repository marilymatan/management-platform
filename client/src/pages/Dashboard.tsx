import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Mail,
  ArrowLeft,
  Layers,
  Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const deleteAnalysisMutation = trpc.policy.delete.useMutation({
    onSuccess: () => {
      toast.success("הסריקה נמחקה בהצלחה");
      trpc.useUtils().policy.getUserAnalyses.invalidate();
    },
    onError: (error) => {
      toast.error("שגיאה במחיקת הסריקה: " + error.message);
    },
  });

  if (!user) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <Card className="max-w-sm w-full text-center">
          <CardContent className="pt-8 pb-6">
            <Shield className="size-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">אנא התחבר כדי לצפות בדשבורד שלך</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            שלום, {user.name?.split(" ")[0]}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            כאן תוכל לנהל את כל הסריקות שלך
          </p>
        </div>
        <Button
          onClick={() => setLocation("/")}
          size="lg"
          className="gap-2 shadow-md"
        >
          <Plus className="size-5" />
          סריקה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "סה\"כ סריקות",
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
            label: "קבצים שנסרקו",
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-fade-in-up stagger-5">
        <button
          onClick={() => setLocation("/")}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#1a2744] to-[#2563eb] p-5 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
        >
          <div className="relative z-10">
            <div className="size-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
              <Plus className="size-5 text-white" />
            </div>
            <p className="text-base font-bold text-white">סריקה חדשה</p>
            <p className="text-xs text-white/60 mt-1">העלה פוליסה חדשה לסריקה</p>
          </div>
          <ArrowLeft className="absolute left-4 bottom-5 size-5 text-white/30 group-hover:text-white/60 transition-colors" />
        </button>
        <button
          onClick={() => setLocation("/smart-invoices")}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-bl from-[#4c1d95] to-[#7c3aed] p-5 text-right transition-all hover:shadow-lg hover:scale-[1.01]"
        >
          <div className="relative z-10">
            <div className="size-10 rounded-xl bg-white/15 flex items-center justify-center mb-3">
              <Mail className="size-5 text-white" />
            </div>
            <p className="text-base font-bold text-white">חשבוניות חכמות</p>
            <p className="text-xs text-white/60 mt-1">סרוק את Gmail ומצא חשבוניות</p>
          </div>
          <ArrowLeft className="absolute left-4 bottom-5 size-5 text-white/30 group-hover:text-white/60 transition-colors" />
        </button>
      </div>

      <div className="animate-fade-in-up stagger-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            הסריקות שלך
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
                          onClick={() => setLocation(`/analysis/${analysis.sessionId}`)}
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
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
                <FileText className="size-8 text-muted-foreground/40" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">אין סריקות עדיין</h3>
              <p className="text-sm text-muted-foreground mb-5">העלה את הפוליסה הראשונה שלך וקבל סריקה מפורטת</p>
              <Button onClick={() => setLocation("/")} className="gap-2">
                <Plus className="size-4" />
                הוסף סריקה ראשונה
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

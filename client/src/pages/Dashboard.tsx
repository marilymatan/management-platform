import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  LogOut,
  User,
  Settings,
  Zap,
  LayoutDashboard,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { data: analyses, isLoading } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const deleteAnalysisMutation = trpc.policy.delete.useMutation({
    onSuccess: () => {
      toast.success("הניתוח נמחק בהצלחה");
      // Refetch analyses
      trpc.useUtils().policy.getUserAnalyses.invalidate();
    },
    onError: (error) => {
      toast.error("שגיאה במחיקת הניתוח: " + error.message);
    },
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card>
          <CardContent className="pt-6">
            <p>אנא התחבר כדי לצפות בדשבורד שלך</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="size-3 mr-1" />
            הושלם
          </Badge>
        );
      case "processing":
        return (
          <Badge className="bg-blue-100 text-blue-800">
            <Clock className="size-3 mr-1" />
            בעיבוד
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="size-3 mr-1" />
            בהמתנה
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-red-100 text-red-800">
            <AlertCircle className="size-3 mr-1" />
            שגיאה
          </Badge>
        );
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Shield className="size-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">מנתח פוליסות ביטוח</h1>
                <p className="text-xs text-muted-foreground">הדשבורד שלך</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/smart-invoices")}
                className="gap-2"
              >
                <Mail className="size-4" />
                חשבוניות חכמות
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/usage")}
                className="gap-2"
              >
                <Zap className="size-4" />
                שימוש
              </Button>
              {user.role === "admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/admin")}
                  className="gap-2"
                >
                  <LayoutDashboard className="size-4" />
                  ניהול
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/profile")}
                className="gap-2"
              >
                <User className="size-4" />
                פרופיל
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout()}
                className="gap-2"
              >
                <LogOut className="size-4" />
                התנתקות
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">
            ברוכים הבאים, {user.name}!
          </h2>
          <p className="text-muted-foreground">
            כאן תוכלו לראות את כל הניתוחים שלכם ולהוסיף ניתוחים חדשים
          </p>
        </div>

        {/* Add New Analysis Button */}
        <div className="mb-6">
          <Button
            onClick={() => navigate("/")}
            className="gap-2 bg-primary hover:bg-primary/90"
            size="lg"
          >
            <Plus className="size-5" />
            הוסף ניתוח חדש
          </Button>
        </div>

        {/* Analyses List */}
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">טוען את הניתוחים שלך...</p>
              </CardContent>
            </Card>
          ) : analyses && analyses.length > 0 ? (
            <>
              <h3 className="text-lg font-semibold text-foreground mb-4">
                הניתוחים שלך ({analyses.length})
              </h3>
              <div className="grid gap-4">
                {analyses.map((analysis) => (
                  <Card key={analysis.sessionId} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-base">
                              {analysis.analysisResult?.generalInfo?.policyName || "ניתוח פוליסה"}
                            </CardTitle>
                            {getStatusBadge(analysis.status)}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {analysis.analysisResult?.summary || "אין סיכום זמין"}
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div>
                          <p className="text-xs text-muted-foreground">תאריך</p>
                          <p className="text-sm font-medium">
                            {format(new Date(analysis.createdAt), "dd.MM.yyyy", { locale: he })}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">קבצים</p>
                          <p className="text-sm font-medium">{analysis.files.length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">כיסויים</p>
                          <p className="text-sm font-medium">
                            {analysis.analysisResult?.coverages?.length || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">מצב</p>
                          <p className="text-sm font-medium capitalize">{analysis.status}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {analysis.status === "completed" && (
                          <Button
                            onClick={() => navigate(`/analysis/${analysis.sessionId}`)}
                            variant="default"
                            size="sm"
                            className="gap-1"
                          >
                            <Eye className="size-4" />
                            צפה בניתוח
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="gap-1"
                            >
                              <Trash2 className="size-4" />
                              מחק
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
                                onClick={() =>
                                  deleteAnalysisMutation.mutate({ sessionId: analysis.sessionId })
                                }
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                מחק
                              </AlertDialogAction>
                            </div>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="size-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground mb-4">אין לך ניתוחים עדיין</p>
                <Button onClick={() => navigate("/")} className="gap-2">
                  <Plus className="size-4" />
                  הוסף ניתוח ראשון
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

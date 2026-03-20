import { useMemo } from "react";
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
  Sparkles,
  MessageSquare,
  Wallet,
  CircleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import type { InsuranceCategory } from "@shared/insurance";
import {
  buildInsuranceOverview,
  formatInsuranceCurrency,
  insuranceCategoryLabels,
} from "@/lib/insuranceOverview";

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
    label: insuranceCategoryLabels.health,
    icon: <Heart className="size-5" />,
    gradient: "from-rose-500/12 to-pink-500/6",
    iconBg: "bg-rose-100",
    textColor: "text-rose-600",
  },
  life: {
    label: insuranceCategoryLabels.life,
    icon: <User className="size-5" />,
    gradient: "from-blue-500/12 to-indigo-500/6",
    iconBg: "bg-blue-100",
    textColor: "text-blue-600",
  },
  car: {
    label: insuranceCategoryLabels.car,
    icon: <Car className="size-5" />,
    gradient: "from-amber-500/12 to-orange-500/6",
    iconBg: "bg-amber-100",
    textColor: "text-amber-600",
  },
  home: {
    label: insuranceCategoryLabels.home,
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
  const profileQuery = trpc.profile.get.useQuery(undefined, {
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

  const overview = useMemo(
    () => buildInsuranceOverview(analyses as any[] | undefined, profileQuery.data),
    [analyses, profileQuery.data]
  );
  const categoryPolicies = useMemo(
    () => (category ? overview.completedPolicies.filter((policy) => policy.category === category) : []),
    [overview.completedPolicies, category]
  );

  if (!user || !category || !CATEGORY_CONFIG[category]) return null;

  const config = CATEGORY_CONFIG[category];
  const summary = overview.categorySummaries[category];
  const categoryInsights = [
    ...(summary.nextRenewalDays !== null
      ? [{
          id: "renewal",
          title: "יש חידוש שמתקרב",
          description: `בקטגוריה הזו יש פוליסה שמגיעה לחידוש בעוד ${summary.nextRenewalDays} ימים.`,
        }]
      : []),
    ...(categoryPolicies.some((policy) => policy.duplicateCount > 0)
      ? [{
          id: "duplicates",
          title: "יש כפילויות שכדאי לפתוח",
          description: "זוהו כפילויות בכיסוי לפחות באחת הפוליסות בקטגוריה הזאת.",
        }]
      : []),
    ...categoryPolicies
      .flatMap((policy) => policy.personalizedInsights.slice(0, 1))
      .slice(0, 2)
      .map((insight, index) => ({
        id: `insight-${index}`,
        title: insight.title,
        description: insight.description,
      })),
  ].slice(0, 3);

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
    <div className="page-container space-y-6">
      <div className="animate-fade-in-up relative overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className={`absolute inset-0 bg-gradient-to-bl ${config.gradient}`} />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLocation("/insurance")}
                className="size-10 shrink-0"
              >
                <ArrowRight className="size-5" />
              </Button>
              <div className={`size-11 rounded-xl ${config.iconBg} flex items-center justify-center ${config.textColor}`}>
                {config.icon}
              </div>
              <div>
                <h2 className="text-xl font-bold">{config.label}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {summary.scans} פוליסות · {summary.pdfs} קבצי PDF · {summary.monthlyPremium > 0 ? formatInsuranceCurrency(summary.monthlyPremium) : "ללא פרמיה מזוהה"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setLocation("/assistant")} className="gap-2">
                <MessageSquare className="size-4" />
                שאל את לומי
              </Button>
              <Button onClick={() => setLocation("/insurance/new")} size="lg" className="gap-2 shadow-md">
                <Plus className="size-5" />
                סריקה חדשה
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className={`size-10 rounded-xl ${config.iconBg} flex items-center justify-center ${config.textColor}`}>
                <ScanLine className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">פוליסות</p>
                <p className="text-2xl font-bold">{summary.scans}</p>
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
                <p className="text-2xl font-bold">{summary.pdfs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">פרמיה חודשית</p>
                <p className="text-2xl font-bold">{summary.monthlyPremium > 0 ? formatInsuranceCurrency(summary.monthlyPremium) : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                <Clock className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">חידושים קרובים</p>
                <p className="text-2xl font-bold">{summary.renewals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {categoryInsights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-in-up stagger-2">
          {categoryInsights.map((insight) => (
            <Card key={insight.id} className="border-border/60 bg-muted/15">
              <CardContent className="p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <CircleAlert className="size-4 text-primary" />
                  <p className="text-sm font-semibold">{insight.title}</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Card key={item} className="animate-pulse">
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
      ) : categoryPolicies.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-3 animate-fade-in-up stagger-3">
            {categoryPolicies.map((policy) => {
              const matchingAnalysis = analyses?.find((analysis) => analysis.sessionId === policy.sessionId);
              if (!matchingAnalysis) {
                return null;
              }
              return (
                <Card
                  key={policy.sessionId}
                  className="group hover:shadow-md hover:border-primary/20 transition-all duration-200"
                >
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-4">
                      <div className={`size-10 rounded-xl ${config.iconBg} flex items-center justify-center shrink-0 ${config.textColor}`}>
                        <FileText className="size-5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">{policy.policyName}</p>
                          {getStatusBadge(matchingAnalysis.status)}
                          <Badge variant="outline">{policy.premiumLabel}</Badge>
                          {policy.daysUntilRenewal !== null && policy.daysUntilRenewal >= 0 && (
                            <Badge variant={policy.daysUntilRenewal <= 45 ? "default" : "secondary"}>
                              {policy.daysUntilRenewal <= 45
                                ? `חידוש בעוד ${policy.daysUntilRenewal} ימים`
                                : `תוקף בעוד ${policy.daysUntilRenewal} ימים`}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{policy.summary}</p>
                        <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                          <span>{policy.insurerName}</span>
                          <span>{policy.coverageCount} כיסויים</span>
                          <span>{policy.filesCount} קבצים</span>
                          {policy.duplicateCount > 0 && <span>{policy.duplicateCount} כפילויות</span>}
                          <span>{format(new Date(matchingAnalysis.createdAt), "dd.MM.yy", { locale: he })}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          onClick={() => setLocation(`/insurance/${policy.sessionId}`)}
                          variant="default"
                          size="sm"
                          className="gap-1.5 h-8"
                        >
                          <Eye className="size-3.5" />
                          <span className="hidden sm:inline">צפה</span>
                        </Button>
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
                                onClick={() => deleteAnalysisMutation.mutate({ sessionId: policy.sessionId })}
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
              );
            })}
          </div>

          <div className="space-y-4 animate-fade-in-up stagger-4">
            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">שאלות טובות ללומי</h3>
                </div>
                <div className="space-y-2">
                  {[
                    `יש משהו חריג ב${config.label}?`,
                    `מה הכי חשוב לי לבדוק עכשיו ב${config.label}?`,
                    `האם יש חפיפות או חוסרים ב${config.label}?`,
                  ].map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outline"
                      className="w-full justify-between rounded-xl h-auto py-3 text-sm"
                      onClick={() => setLocation("/assistant")}
                    >
                      <span className="text-right whitespace-normal">{prompt}</span>
                      <ArrowRight className="size-4 shrink-0 opacity-50" />
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">פוקוס הקטגוריה</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {summary.highlight}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {summary.relevant && <Badge variant={summary.hasData ? "secondary" : "default"}>{summary.hasData ? "מכוסה כרגע" : "כדאי להשלים"}</Badge>}
                  {summary.renewals > 0 && <Badge variant="outline">{summary.renewals} חידושים</Badge>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-dashed animate-fade-in-up stagger-3">
          <CardContent className="py-16 text-center">
            <div className={`size-16 rounded-2xl ${config.iconBg} flex items-center justify-center mx-auto mb-4 ${config.textColor} opacity-40`}>
              {config.icon}
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">אין סריקות ב{config.label}</h3>
            <p className="text-sm text-muted-foreground mb-5">
              העלה פוליסה מהקטגוריה הזו כדי לקבל תמונת מצב, חידושים ותובנות מותאמות.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Button onClick={() => setLocation("/insurance/new")} className="gap-2">
                <Plus className="size-4" />
                סריקה חדשה
              </Button>
              <Button variant="outline" onClick={() => setLocation("/assistant")} className="gap-2">
                <MessageSquare className="size-4" />
                שאל את לומי מה חסר כאן
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

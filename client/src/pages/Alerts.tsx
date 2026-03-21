import { useMemo } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { AnalysisQueueProgressCard } from "@/components/AnalysisQueueProgressCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildAlertCenterSnapshot, type AlertCenterItem } from "@/lib/alertCenter";
import type { FamilyMemberLike } from "@/lib/familyCoverage";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  BellRing,
  CreditCard,
  ExternalLink,
  Mail,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

const prioritySectionMeta = {
  high: {
    title: "דורש טיפול עכשיו",
    description: "הדברים שהכי כדאי לפתוח או לבדוק כרגע.",
  },
  medium: {
    title: "כדאי לעבור בקרוב",
    description: "איתותים שיכולים להשפיע על הכיסוי, העלות או הדיוק של המידע.",
  },
  low: {
    title: "למעקב",
    description: "דברים טובים לשים אליהם לב בהמשך הדרך.",
  },
} as const;

function getPriorityBadgeClass(priority: AlertCenterItem["priority"]) {
  if (priority === "high") {
    return "border-destructive/20 bg-destructive/10 text-destructive";
  }
  if (priority === "medium") {
    return "border-warning/30 bg-warning/20 text-warning-foreground";
  }
  return "border-primary/20 bg-primary/10 text-primary";
}

function getAlertToneClass(priority: AlertCenterItem["priority"]) {
  if (priority === "high") {
    return "border-destructive/20";
  }
  if (priority === "medium") {
    return "border-warning/30";
  }
  return "border-border/70";
}

function getAlertIcon(alert: AlertCenterItem) {
  if (alert.source === "gmail_scan") {
    return {
      icon: <Mail className="size-4" />,
      className: "bg-primary/10 text-primary",
    };
  }
  if (alert.source === "family") {
    return {
      icon: <Users className="size-4" />,
      className: "bg-warning/20 text-warning-foreground",
    };
  }
  if (alert.source === "invoice") {
    return {
      icon: <CreditCard className="size-4" />,
      className: "bg-success/10 text-success",
    };
  }
  return {
    icon: <ShieldAlert className="size-4" />,
    className: "bg-destructive/10 text-destructive",
  };
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-5 pb-4">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">{helper}</p>
      </CardContent>
    </Card>
  );
}

export default function Alerts() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();

  const { data: analyses } = trpc.policy.getUserAnalyses.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: profileData } = trpc.profile.get.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: familyMembersData } = trpc.family.list.useQuery(undefined, {
    enabled: !!user,
  });
  const { data: insuranceDiscoveries } = trpc.gmail.getInsuranceDiscoveries.useQuery({ limit: 40 }, {
    enabled: !!user,
  });
  const { data: invoices } = trpc.gmail.getInvoices.useQuery({ limit: 100 }, {
    enabled: !!user,
  });

  const familyMembers = (familyMembersData ?? []) as FamilyMemberLike[];
  const alertSnapshot = useMemo(
    () =>
      buildAlertCenterSnapshot({
        analyses,
        profile: profileData,
        familyMembers,
        insuranceDiscoveries,
        invoices,
      }),
    [analyses, familyMembers, insuranceDiscoveries, invoices, profileData],
  );

  if (!user) {
    return null;
  }

  const alerts = alertSnapshot.alerts;
  const inFlightPolicies = (analyses ?? []).filter(
    (analysis) => analysis.status === "pending" || analysis.status === "processing",
  );
  const highAlerts = alerts.filter((alert) => alert.priority === "high");
  const mediumAlerts = alerts.filter((alert) => alert.priority === "medium");
  const lowAlerts = alerts.filter((alert) => alert.priority === "low");

  const sections: Array<{
    key: keyof typeof prioritySectionMeta;
    items: AlertCenterItem[];
  }> = [];

  if (highAlerts.length > 0) {
    sections.push({ key: "high", items: highAlerts });
  }
  if (mediumAlerts.length > 0) {
    sections.push({ key: "medium", items: mediumAlerts });
  }
  if (lowAlerts.length > 0) {
    sections.push({ key: "low", items: lowAlerts });
  }

  const openAlert = (alert: AlertCenterItem) => {
    if (alert.actionUrl) {
      window.open(alert.actionUrl, "_blank", "noopener,noreferrer");
      return;
    }
    if (alert.actionPath) {
      setLocation(alert.actionPath);
    }
  };

  return (
    <div className="page-container space-y-6" data-testid="alerts-page">
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-bl from-primary via-primary/90 to-chart-1 text-primary-foreground shadow-sm animate-fade-in-up">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.18),transparent_45%)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/10 to-transparent" />
        <div className="relative p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium backdrop-blur-sm">
                <BellRing className="size-4" />
                מסך אחד לכל מה שלומי מצא
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">התראות</h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-primary-foreground/80">
                  כאן מרוכזות חפיפות, חידושים, ממצאי סריקות, איתותים משפחתיים ועדכונים שמצאו במסמכים ובמיילים.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="border-white/15 bg-white/15 text-white">
                  {alerts.length} התראות פתוחות
                </Badge>
                <Badge variant="secondary" className="border-white/15 bg-white/15 text-white">
                  {alertSnapshot.scanFindingCount} ממצאי סריקות
                </Badge>
                <Badge variant="secondary" className="border-white/15 bg-white/15 text-white">
                  {alertSnapshot.coverageSnapshot.householdSize} נפשות בתמונה
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border border-white/20 bg-white/15 text-white hover:bg-white/25"
                onClick={() => setLocation("/assistant")}
              >
                <Sparkles className="size-4" />
                שאל את לומי
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="gap-1.5 border border-white/20 bg-white/15 text-white hover:bg-white/25"
                onClick={() => setLocation("/insurance")}
              >
                <ArrowLeft className="size-4" />
                למסך הביטוחים
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="דחופות" value={alertSnapshot.urgentCount} helper="איתותים שדורשים תשומת לב עכשיו" />
        <SummaryCard label="מסריקות" value={alertSnapshot.scanFindingCount} helper="מה שנמצא בפוליסות וב-Gmail" />
        <SummaryCard label="משפחה" value={alertSnapshot.familyCount} helper="שיוכים, חוסרים ופערים במשפחה" />
        <SummaryCard label="חיובים" value={alertSnapshot.paymentCount} helper="חיובים ומסמכי מייל למעקב" />
      </div>

      {inFlightPolicies.length > 0 && (
        <AnalysisQueueProgressCard
          analyses={inFlightPolicies}
          onOpenStatus={() => setLocation("/insurance")}
          actionLabel="לסטטוס הסריקות"
        />
      )}

      {alerts.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="space-y-6" data-testid="alerts-list">
            {sections.map((section) => (
              <section key={section.key} className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold">{prioritySectionMeta[section.key].title}</h2>
                  <p className="text-xs text-muted-foreground">{prioritySectionMeta[section.key].description}</p>
                </div>

                <div className="space-y-3">
                  {section.items.map((alert) => {
                    const icon = getAlertIcon(alert);
                    const timestamp = format(new Date(alert.createdAtMs), "dd.MM.yyyy", { locale: he });

                    return (
                      <Card
                        key={alert.id}
                        className={`${getAlertToneClass(alert.priority)} transition-shadow hover:shadow-sm`}
                        data-testid={`alert-card-${alert.id}`}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${icon.className}`}>
                                {icon.icon}
                              </div>

                              <div className="space-y-2 min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant="outline" className={getPriorityBadgeClass(alert.priority)}>
                                    {alert.badgeLabel}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">{alert.sourceLabel}</span>
                                  {alert.contextLabel ? <Badge variant="secondary">{alert.contextLabel}</Badge> : null}
                                </div>
                                <div>
                                  <h3 className="text-sm font-semibold text-foreground">{alert.title}</h3>
                                  <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                                    {alert.description}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 ms-auto">
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timestamp}</span>
                              <Button
                                size="sm"
                                variant={alert.priority === "high" ? "default" : "outline"}
                                className="gap-1.5"
                                onClick={() => openAlert(alert)}
                              >
                                {alert.actionUrl ? <ExternalLink className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
                                {alert.actionLabel}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Bell className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">מה עושים מכאן</h2>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  פתחו קודם את הדחופות, ואז אפשר לעבור לשאר ההמלצות או לשאול את לומי איך לתעדף הכול.
                </p>
                <div className="space-y-2">
                  <Button className="w-full gap-2" onClick={() => setLocation("/assistant")}>
                    <Sparkles className="size-4" />
                    שאל את לומי מה הכי חשוב
                  </Button>
                  <Button variant="outline" className="w-full gap-2" onClick={() => setLocation("/money")}>
                    <Mail className="size-4" />
                    למסך סריקת המיילים
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-warning-foreground" />
                  <h2 className="text-sm font-semibold">תמונת המשפחה</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">לבדיקה</p>
                    <p className="mt-1 text-xl font-bold">{alertSnapshot.coverageSnapshot.reviewCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">חסר מידע</p>
                    <p className="mt-1 text-xl font-bold">{alertSnapshot.coverageSnapshot.missingCount}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  ככל שהתמונה המשפחתית מלאה יותר, לומי יודע לענות טוב יותר גם בצ'אט וגם בהמלצות.
                </p>
                <Button variant="outline" className="w-full gap-2" onClick={() => setLocation("/family")}>
                  <Users className="size-4" />
                  למשפחה שלי
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-dashed animate-fade-in-up">
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-success/10 text-success">
              <AlertTriangle className="size-7" />
            </div>
            <h2 className="text-base font-semibold">אין כרגע התראות פתוחות</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              כשתהיה סריקה חדשה, חידוש, חפיפה או ממצא מהמייל, הכול ירוכז כאן.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setLocation("/insurance/new")} className="gap-2">
                <ShieldAlert className="size-4" />
                סריקת פוליסה חדשה
              </Button>
              <Button variant="outline" onClick={() => setLocation("/money")} className="gap-2">
                <Mail className="size-4" />
                סרוק מיילים
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

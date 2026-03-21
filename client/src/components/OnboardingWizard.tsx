import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GmailPolicyDiscovery } from "@/components/GmailPolicyDiscovery";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Mail, Shield, Sparkles } from "lucide-react";

type OnboardingWizardProps = {
  userName?: string | null;
  onCompleted?: () => void;
};

const TOTAL_STEPS = 5;

export function OnboardingWizard({ userName, onCompleted }: OnboardingWizardProps) {
  const utils = trpc.useUtils();
  const profileQuery = trpc.profile.get.useQuery();
  const connectionStatusQuery = trpc.gmail.connectionStatus.useQuery();
  const invoicesQuery = trpc.gmail.getInvoices.useQuery({ limit: 20 });
  const discoveriesQuery = trpc.gmail.getInsuranceDiscoveries.useQuery({ limit: 20 });
  const dashboardQuery = trpc.insuranceScore.getDashboard.useQuery();
  const savingsQuery = trpc.savings.getReport.useQuery();
  const scanMutation = trpc.gmail.scan.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.gmail.getInvoices.invalidate(),
        utils.gmail.getInsuranceDiscoveries.invalidate(),
        utils.gmail.discoverPolicies.invalidate(),
        utils.monitoring.getMonthlyReport.invalidate(),
        utils.savings.getReport.invalidate(),
        utils.insuranceScore.getDashboard.invalidate(),
      ]);
      toast.success("סריקת Gmail הושלמה");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateProfileMutation = trpc.profile.update.useMutation({
    onError: () => {
      toast.error("לא הצלחנו לשמור את הפרופיל");
    },
  });

  const storageKey = "lumi-onboarding-step";
  const [step, setStep] = useState(0);
  const [scanStarted, setScanStarted] = useState(false);
  const [maritalStatus, setMaritalStatus] = useState<"single" | "married" | "divorced" | "widowed">("married");
  const [numberOfChildren, setNumberOfChildren] = useState("0");
  const [numberOfVehicles, setNumberOfVehicles] = useState("0");
  const [ownsApartment, setOwnsApartment] = useState(false);
  const [hasActiveMortgage, setHasActiveMortgage] = useState(false);

  const discoveredInsurancePayments = useMemo(
    () => (invoicesQuery.data ?? []).filter((invoice) => (invoice.customCategory ?? invoice.category ?? "").includes("ביטוח")).length,
    [invoicesQuery.data]
  );
  const discoveredInsuranceDocuments = discoveriesQuery.data?.length ?? 0;
  const score = dashboardQuery.data?.score ?? 0;
  const potentialSavings = savingsQuery.data?.totalMonthlySaving ?? 0;
  const progress = ((step + 1) / TOTAL_STEPS) * 100;

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) {
      const parsed = Number(saved);
      if (!Number.isNaN(parsed)) {
        setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, parsed)));
      }
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, String(step));
  }, [step]);

  useEffect(() => {
    const profile = profileQuery.data;
    if (!profile) {
      return;
    }
    setMaritalStatus((profile.maritalStatus as "single" | "married" | "divorced" | "widowed") ?? "married");
    setNumberOfChildren(String(profile.numberOfChildren ?? 0));
    setNumberOfVehicles(String(profile.numberOfVehicles ?? 0));
    setOwnsApartment(profile.ownsApartment ?? false);
    setHasActiveMortgage(profile.hasActiveMortgage ?? false);
  }, [profileQuery.data]);

  useEffect(() => {
    if (!connectionStatusQuery.data?.connected || scanStarted || scanMutation.isPending) {
      return;
    }
    if ((invoicesQuery.data?.length ?? 0) > 0 || (discoveriesQuery.data?.length ?? 0) > 0) {
      return;
    }
    setScanStarted(true);
    scanMutation.mutate({ daysBack: 120 });
  }, [
    connectionStatusQuery.data?.connected,
    discoveriesQuery.data?.length,
    invoicesQuery.data?.length,
    scanMutation,
    scanStarted,
  ]);

  async function handleSaveQuickProfile() {
    const childrenCount = Number(numberOfChildren);
    const vehiclesCount = Number(numberOfVehicles);
    if (Number.isNaN(childrenCount) || childrenCount < 0 || Number.isNaN(vehiclesCount) || vehiclesCount < 0) {
      toast.error("יש להזין מספרים תקינים");
      return;
    }
    await updateProfileMutation.mutateAsync({
      maritalStatus,
      numberOfChildren: childrenCount,
      numberOfVehicles: vehiclesCount,
      ownsApartment,
      hasActiveMortgage,
    });
    await Promise.all([
      utils.profile.get.invalidate(),
      utils.insuranceScore.getDashboard.invalidate(),
      utils.savings.getReport.invalidate(),
    ]);
    toast.success("הפרופיל עודכן");
    setStep(3);
  }

  async function handleComplete() {
    await updateProfileMutation.mutateAsync({
      onboardingCompleted: true,
    });
    await utils.profile.get.invalidate();
    window.localStorage.removeItem(storageKey);
    toast.success("ה־onboarding הושלם");
    onCompleted?.();
  }

  function nextStep() {
    setStep((current) => Math.min(TOTAL_STEPS - 1, current + 1));
  }

  function previousStep() {
    setStep((current) => Math.max(0, current - 1));
  }

  return (
    <div className="page-container max-w-4xl mx-auto" data-testid="onboarding-wizard">
      <Card className="overflow-hidden">
        <CardContent className="pt-6 pb-6 space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
                  <Shield className="size-4" />
                  התחלה מהירה עם לומי
                </div>
                <h1 className="text-2xl font-bold mt-3">לומי מנהלת את הביטוח המשפחתי שלך</h1>
                <p className="text-sm text-muted-foreground mt-2">
                  בתוך כמה צעדים קצרים נקבל תמונה ראשונית של הכיסוי, המיילים הביטוחיים והזדמנויות החיסכון.
                </p>
              </div>
              <Badge variant="outline">שלב {step + 1} מתוך {TOTAL_STEPS}</Badge>
            </div>
            <Progress value={progress} />
          </div>

          {step === 0 && (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-primary/5 p-6 space-y-3">
                <h2 className="text-xl font-semibold">שלום {userName?.split(" ")[0] || "לך"}</h2>
                <p className="text-sm text-muted-foreground">
                  נתחיל מ־Gmail, נוסיף כמה נתוני בסיס על המשפחה, ונחזיר לך ציון ראשון ודוח חיסכון.
                </p>
              </div>
              <div className="flex items-center justify-end">
                <Button onClick={nextStep} className="gap-2">
                  מתחילים
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-2xl border p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <h2 className="text-lg font-semibold">חיבור Gmail וגילוי אוטומטי</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  החיבור מאפשר ללומי לזהות פרמיות, חידושים ומסמכי פוליסה בלי להתחיל באיסוף ידני.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">
                    {connectionStatusQuery.data?.connected ? "Gmail מחובר" : "Gmail עדיין לא מחובר"}
                  </Badge>
                  {scanMutation.isPending && (
                    <Badge variant="outline" className="gap-1.5">
                      <Loader2 className="size-3.5 animate-spin" />
                      סריקה ראשונית רצה
                    </Badge>
                  )}
                </div>
                {!connectionStatusQuery.data?.connected && (
                  <GmailPolicyDiscovery compact returnTo="/" title="חיבור Gmail" description="חבר/י Gmail כדי שלומי תזהה פוליסות ומסמכים אוטומטית." />
                )}
                {connectionStatusQuery.data?.connected && (
                  <div className="rounded-xl bg-success/10 border border-success/20 p-4 text-sm">
                    Gmail מחובר. לומי יכולה לסרוק את המייל ולאתר מסמכי ביטוח ופרמיות.
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={previousStep} className="gap-2">
                  <ChevronRight className="size-4" />
                  חזרה
                </Button>
                <Button onClick={nextStep} disabled={!connectionStatusQuery.data?.connected} className="gap-2">
                  המשך
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">פרופיל מהיר</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    כמה תשובות קצרות יעזרו ללומי לדעת אילו כיסויים רלוונטיים באמת למשפחה שלך.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-marital-status">מצב משפחתי</Label>
                    <Select value={maritalStatus} onValueChange={(value: "single" | "married" | "divorced" | "widowed") => setMaritalStatus(value)}>
                      <SelectTrigger id="onboarding-marital-status">
                        <SelectValue placeholder="בחר מצב משפחתי" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">רווק/ה</SelectItem>
                        <SelectItem value="married">נשוי/אה</SelectItem>
                        <SelectItem value="divorced">גרוש/ה</SelectItem>
                        <SelectItem value="widowed">אלמן/ה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="onboarding-children">מספר ילדים</Label>
                    <Input id="onboarding-children" type="number" min="0" value={numberOfChildren} onChange={(event) => setNumberOfChildren(event.target.value)} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="onboarding-vehicles">מספר רכבים</Label>
                    <Input id="onboarding-vehicles" type="number" min="0" value={numberOfVehicles} onChange={(event) => setNumberOfVehicles(event.target.value)} />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border p-3">
                      <Label htmlFor="onboarding-apartment">יש דירה בבעלותך</Label>
                      <Switch id="onboarding-apartment" checked={ownsApartment} onCheckedChange={setOwnsApartment} />
                    </div>
                    <div className="flex items-center justify-between rounded-xl border p-3">
                      <Label htmlFor="onboarding-mortgage">יש משכנתא פעילה</Label>
                      <Switch id="onboarding-mortgage" checked={hasActiveMortgage} onCheckedChange={setHasActiveMortgage} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={previousStep} className="gap-2">
                  <ChevronRight className="size-4" />
                  חזרה
                </Button>
                <Button onClick={handleSaveQuickProfile} disabled={updateProfileMutation.isPending} className="gap-2">
                  {updateProfileMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  שמור והמשך
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-[11px] text-muted-foreground">פרמיות שזוהו</p>
                    <p className="text-2xl font-bold mt-1">{discoveredInsurancePayments}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-[11px] text-muted-foreground">ממצאי ביטוח מהמייל</p>
                    <p className="text-2xl font-bold mt-1">{discoveredInsuranceDocuments}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-5 pb-4">
                    <p className="text-[11px] text-muted-foreground">סטטוס Gmail</p>
                    <p className="text-base font-semibold mt-2">
                      {connectionStatusQuery.data?.connected ? "מחובר ומוכן" : "עדיין לא מחובר"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <GmailPolicyDiscovery compact returnTo="/" />

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={previousStep} className="gap-2">
                  <ChevronRight className="size-4" />
                  חזרה
                </Button>
                <Button onClick={nextStep} className="gap-2">
                  לציון הראשון
                  <ChevronLeft className="size-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-2xl border bg-primary/5 p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-success" />
                  <h2 className="text-xl font-semibold">הציון הראשון שלך מוכן</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-background p-4 border">
                    <p className="text-[11px] text-muted-foreground">ציון תיק ביטוחי</p>
                    <p className="text-3xl font-bold mt-1">{score}</p>
                  </div>
                  <div className="rounded-xl bg-background p-4 border">
                    <p className="text-[11px] text-muted-foreground">פוטנציאל חיסכון חודשי</p>
                    <p className="text-3xl font-bold mt-1">₪{Math.round(potentialSavings).toLocaleString("he-IL")}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  מכאן אפשר להמשיך למרכז החיסכון, לבדוק פעולות מומלצות, ולהמשיך לייבא פוליסות נוספות.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={previousStep} className="gap-2">
                  <ChevronRight className="size-4" />
                  חזרה
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleComplete}>
                    סיימתי, נעבור לדשבורד
                  </Button>
                  <Button onClick={handleComplete} className="gap-2">
                    <Sparkles className="size-4" />
                    סיים והמשך
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

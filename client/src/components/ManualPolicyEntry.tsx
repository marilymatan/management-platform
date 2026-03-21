import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Loader2, Sparkles } from "lucide-react";

type ManualPolicyEntryProps = {
  onCreated?: (sessionId: string) => void;
};

const CATEGORY_OPTIONS = [
  { value: "health", label: "בריאות" },
  { value: "life", label: "חיים" },
  { value: "car", label: "רכב" },
  { value: "home", label: "דירה" },
] as const;

export function ManualPolicyEntry({ onCreated }: ManualPolicyEntryProps) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: familyMembers } = trpc.family.list.useQuery();
  const createMutation = trpc.policy.createManualEntry.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const [company, setCompany] = useState("");
  const [category, setCategory] = useState<"health" | "life" | "car" | "home">("health");
  const [monthlyPremium, setMonthlyPremium] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [coveredMembers, setCoveredMembers] = useState("");

  const suggestedMembers = useMemo(
    () => (familyMembers ?? []).map((member) => member.fullName).join(", "),
    [familyMembers]
  );

  async function handleSubmit() {
    if (!company.trim()) {
      toast.error("יש למלא שם חברת ביטוח");
      return;
    }

    const parsedPremium = monthlyPremium.trim() ? Number(monthlyPremium) : null;
    if (parsedPremium !== null && (Number.isNaN(parsedPremium) || parsedPremium < 0)) {
      toast.error("הפרמיה החודשית חייבת להיות מספר תקין");
      return;
    }

    const result = await createMutation.mutateAsync({
      company: company.trim(),
      category,
      monthlyPremium: parsedPremium,
      startDate: startDate || null,
      endDate: endDate || null,
      coveredMembers: coveredMembers
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });

    await Promise.all([
      utils.policy.getUserAnalyses.invalidate(),
      utils.insuranceScore.getDashboard.invalidate(),
      utils.savings.getReport.invalidate(),
    ]);
    toast.success("הפוליסה הידנית נוספה לתיק");
    onCreated?.(result.sessionId);
    setLocation(`/insurance/${result.sessionId}`);
  }

  return (
    <Card data-testid="manual-policy-entry">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h3 className="text-base font-semibold">הזנה ידנית מהירה</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            אם אין כרגע PDF זמין, אפשר להכניס את פרטי הפוליסה ולתת ללומי להתחיל לעבוד כבר עכשיו.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="manual-policy-company">חברת הביטוח</Label>
            <Input
              id="manual-policy-company"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="למשל הראל"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-policy-category">קטגוריה</Label>
            <Select value={category} onValueChange={(value: "health" | "life" | "car" | "home") => setCategory(value)}>
              <SelectTrigger id="manual-policy-category">
                <SelectValue placeholder="בחר קטגוריה" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-policy-premium">פרמיה חודשית</Label>
            <Input
              id="manual-policy-premium"
              type="number"
              min="0"
              value={monthlyPremium}
              onChange={(event) => setMonthlyPremium(event.target.value)}
              placeholder="למשל 185"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-policy-covered-members">למי הכיסוי שייך</Label>
            <Input
              id="manual-policy-covered-members"
              value={coveredMembers}
              onChange={(event) => setCoveredMembers(event.target.value)}
              placeholder={suggestedMembers || "למשל נועה, רן"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-policy-start-date">תאריך התחלה</Label>
            <Input
              id="manual-policy-start-date"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manual-policy-end-date">תאריך סיום</Label>
            <Input
              id="manual-policy-end-date"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full gap-2">
          {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          הוסף פוליסה ידנית
        </Button>
      </CardContent>
    </Card>
  );
}

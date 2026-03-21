import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { FamilyCoverageGrid } from "@/components/family/FamilyCoverageGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Loader2, Shield } from "lucide-react";

export default function FamilyInsuranceMap() {
  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const { data, error, isLoading, refetch } = trpc.insuranceMap.get.useQuery(undefined, {
    enabled: !!user,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (loading || isLoading) {
    return (
      <div className="page-container">
        <Card>
          <CardContent className="pt-8 pb-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            טוען מפת ביטוח משפחתית...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-container">
        <Card data-testid="family-insurance-map-error">
          <CardContent className="py-10 text-center space-y-3">
            <div className="size-12 rounded-2xl bg-destructive/10 text-destructive mx-auto flex items-center justify-center">
              <AlertCircle className="size-6" />
            </div>
            <p className="text-base font-semibold">לא הצלחנו לטעון את מפת הביטוחים</p>
            <p className="text-sm text-muted-foreground">
              אפשר לנסות שוב עכשיו, או לחזור למסך הביטוחים ולהמשיך משם.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => setLocation("/insurance")}>
                למסך הביטוחים
              </Button>
              <Button onClick={() => void refetch()}>
                נסה שוב
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-container">
        <Card data-testid="family-insurance-map-empty">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-base font-semibold">עדיין אין מפת ביטוחים להצגה</p>
            <p className="text-sm text-muted-foreground">
              ברגע שלומי יזהה פוליסות או בני בית, המפה המשפחתית תופיע כאן.
            </p>
            <Button onClick={() => setLocation("/insurance/new")}>סריקה חדשה</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container space-y-6" data-testid="family-insurance-map-page">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
          <Shield className="size-4" />
          מפת ביטוח משפחתית
        </div>
        <h1 className="text-2xl font-bold">תמונה אחת של כל הכיסויים בבית</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          כאן רואים מי במשפחה מכוסה, איפה חסר מידע, ואילו אזורים עדיין דורשים בדיקה או שיוך מדויק יותר.
        </p>
      </div>

      <FamilyCoverageGrid
        rows={data.rows}
        householdSize={data.householdSize}
        categoriesWithData={data.categoriesWithData}
        missingCount={data.missingCount}
        reviewCount={data.reviewCount}
        onOpenInsurance={() => setLocation("/insurance")}
        onOpenAssistant={() => setLocation("/chat")}
      />
    </div>
  );
}

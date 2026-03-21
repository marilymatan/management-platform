import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { FamilyCoverageGrid } from "@/components/family/FamilyCoverageGrid";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Shield } from "lucide-react";

export default function FamilyInsuranceMap() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const { data, isLoading } = trpc.insuranceMap.get.useQuery();

  if (isLoading) {
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

  if (!data) {
    return null;
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

import { Shield, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getFamilyCoverageStatusClasses,
  getFamilyCoverageStatusLabel,
  type FamilyCoverageRow,
} from "@/lib/familyCoverage";

type FamilyCoverageGridProps = {
  rows: FamilyCoverageRow[];
  householdSize: number;
  categoriesWithData: number;
  missingCount: number;
  reviewCount: number;
  onOpenInsurance: () => void;
  onOpenAssistant: () => void;
};

export function FamilyCoverageGrid({
  rows,
  householdSize,
  categoriesWithData,
  missingCount,
  reviewCount,
  onOpenInsurance,
  onOpenAssistant,
}: FamilyCoverageGridProps) {
  return (
    <div className="animate-fade-in-up stagger-5 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">מפת כיסוי משפחתית</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            תצוגה מרוכזת של הכיסויים הקיימים, הפערים, והאזורים שעדיין צריכים שיוך אישי לכל בני הבית.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={onOpenInsurance} className="gap-1.5">
            <Shield className="size-4" />
            למסך הביטוחים
          </Button>
          <Button size="sm" onClick={onOpenAssistant} className="gap-1.5">
            <Sparkles className="size-4" />
            שאל את לומי
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">בני בית בתמונה</p>
            <p className="text-2xl font-bold mt-1">{householdSize}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">קטגוריות עם מסמכים</p>
            <p className="text-2xl font-bold mt-1">{categoriesWithData}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">שיוכים לבדיקה</p>
            <p className="text-2xl font-bold mt-1">{reviewCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] text-muted-foreground">פערי מידע פתוחים</p>
            <p className="text-2xl font-bold mt-1">{missingCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="border-success/20 bg-success/10 text-success">
          {getFamilyCoverageStatusLabel("household_covered")}
        </Badge>
        <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning-foreground">
          {getFamilyCoverageStatusLabel("needs_review")}
        </Badge>
        <Badge variant="outline" className="border-destructive/20 bg-destructive/10 text-destructive">
          {getFamilyCoverageStatusLabel("missing")}
        </Badge>
        <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
          {getFamilyCoverageStatusLabel("not_relevant")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {rows.map((row) => (
          <Card key={row.id} className="overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold">{row.fullName}</p>
                    <Badge variant="outline">{row.relationLabel}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.hint}</p>
                </div>
                <div className="rounded-xl bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary">
                  {row.kind === "primary" ? "הקשר ראשי" : "בן בית"}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {row.cells.map((cell) => (
                  <div
                    key={`${row.id}-${cell.category}`}
                    className={`rounded-xl border p-3 space-y-2 ${getFamilyCoverageStatusClasses(cell.status)}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{cell.label}</p>
                      <Badge variant="secondary" className="bg-background/70 text-current">
                        {getFamilyCoverageStatusLabel(cell.status)}
                      </Badge>
                    </div>
                    <p className="text-xs leading-relaxed">{cell.summary}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

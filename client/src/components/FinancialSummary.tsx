import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Banknote,
  Calendar,
  Building2,
  FileText,
  AlertTriangle,
  Info,
  Shield,
} from "lucide-react";
import type { GeneralInfo, Coverage } from "@shared/insurance";

interface FinancialSummaryProps {
  generalInfo: GeneralInfo;
  coverages: Coverage[];
  summary: string;
}

export function FinancialSummary({ generalInfo, coverages, summary }: FinancialSummaryProps) {
  const uniqueCategories = Array.from(new Set(coverages.map(c => c.category)));

  return (
    <div className="space-y-4">
      {/* Policy Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            פרטי הפוליסה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {generalInfo.policyName && generalInfo.policyName !== "לא צוין בפוליסה" && (
              <div className="flex items-start gap-2">
                <FileText className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">שם הפוליסה</p>
                  <p className="text-sm font-medium">{generalInfo.policyName}</p>
                </div>
              </div>
            )}
            {generalInfo.insurerName && generalInfo.insurerName !== "לא צוין בפוליסה" && (
              <div className="flex items-start gap-2">
                <Building2 className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">חברת ביטוח</p>
                  <p className="text-sm font-medium">{generalInfo.insurerName}</p>
                </div>
              </div>
            )}
            {generalInfo.policyNumber && generalInfo.policyNumber !== "לא צוין בפוליסה" && (
              <div className="flex items-start gap-2">
                <FileText className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">מספר פוליסה</p>
                  <p className="text-sm font-medium">{generalInfo.policyNumber}</p>
                </div>
              </div>
            )}
            {generalInfo.policyType && generalInfo.policyType !== "לא צוין בפוליסה" && (
              <div className="flex items-start gap-2">
                <Shield className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">סוג הפוליסה</p>
                  <p className="text-sm font-medium">{generalInfo.policyType}</p>
                </div>
              </div>
            )}
          </div>

          {(generalInfo.startDate !== "לא צוין בפוליסה" || generalInfo.endDate !== "לא צוין בפוליסה") && (
            <>
              <Separator />
              <div className="flex items-start gap-2">
                <Calendar className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">תקופת ביטוח</p>
                  <p className="text-sm font-medium">
                    {generalInfo.startDate !== "לא צוין בפוליסה" ? generalInfo.startDate : "—"} עד {generalInfo.endDate !== "לא צוין בפוליסה" ? generalInfo.endDate : "—"}
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Financial Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="size-5 text-primary" />
              <span className="text-sm text-muted-foreground">פרמיה חודשית</span>
            </div>
            <p className="text-2xl font-bold text-primary">
              {generalInfo.monthlyPremium !== "לא צוין בפוליסה" ? generalInfo.monthlyPremium : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <Banknote className="size-5 text-primary" />
              <span className="text-sm text-muted-foreground">פרמיה שנתית</span>
            </div>
            <p className="text-2xl font-bold text-primary">
              {generalInfo.annualPremium !== "לא צוין בפוליסה" ? generalInfo.annualPremium : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            סיכום כיסויים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground mb-3">{summary}</p>
          <div className="flex flex-wrap gap-2">
            {uniqueCategories.map(cat => (
              <Badge key={cat} variant="secondary" className="text-xs">
                {cat} ({coverages.filter(c => c.category === cat).length})
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            סה״כ {coverages.length} כיסויים ב-{uniqueCategories.length} קטגוריות
          </p>
        </CardContent>
      </Card>

      {/* Important Notes */}
      {generalInfo.importantNotes.length > 0 && generalInfo.importantNotes[0] !== "" && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-warning-foreground">
              <AlertTriangle className="size-5 text-warning" />
              דברים שחשוב לדעת
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {generalInfo.importantNotes.map((note, i) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-warning mt-1 shrink-0">•</span>
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Fine Print */}
      {generalInfo.fineprint.length > 0 && generalInfo.fineprint[0] !== "" && (
        <Card className="border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
              <Info className="size-5" />
              אותיות קטנות
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {generalInfo.fineprint.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

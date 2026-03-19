import { Card, CardContent } from "@/components/ui/card";
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
  Hash,
} from "lucide-react";
import type { GeneralInfo, Coverage } from "@shared/insurance";

interface FinancialSummaryProps {
  generalInfo: GeneralInfo;
  coverages: Coverage[];
  summary: string;
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
      <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="size-4 text-primary" />
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
        <p className="text-sm font-medium mt-0.5">{value}</p>
      </div>
    </div>
  );
}

export function FinancialSummary({ generalInfo, coverages, summary }: FinancialSummaryProps) {
  const uniqueCategories = Array.from(new Set(coverages.map(c => c.category)));
  const hasPolicy = (v?: string) => v && v !== "לא צוין בפוליסה";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-bl from-blue-500/5 to-transparent" />
          <CardContent className="relative pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-9 rounded-xl bg-blue-100 flex items-center justify-center">
                <Banknote className="size-5 text-blue-600" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">פרמיה חודשית</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {hasPolicy(generalInfo.monthlyPremium) ? generalInfo.monthlyPremium : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-bl from-violet-500/5 to-transparent" />
          <CardContent className="relative pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-9 rounded-xl bg-violet-100 flex items-center justify-center">
                <Banknote className="size-5 text-violet-600" />
              </div>
              <span className="text-xs text-muted-foreground font-medium">פרמיה שנתית</span>
            </div>
            <p className="text-3xl font-bold text-foreground">
              {hasPolicy(generalInfo.annualPremium) ? generalInfo.annualPremium : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <FileText className="size-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">פרטי הפוליסה</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hasPolicy(generalInfo.policyName) && (
              <InfoItem icon={FileText} label="שם הפוליסה" value={generalInfo.policyName!} />
            )}
            {hasPolicy(generalInfo.insurerName) && (
              <InfoItem icon={Building2} label="חברת ביטוח" value={generalInfo.insurerName!} />
            )}
            {hasPolicy(generalInfo.policyNumber) && (
              <InfoItem icon={Hash} label="מספר פוליסה" value={generalInfo.policyNumber!} />
            )}
            {hasPolicy(generalInfo.policyType) && (
              <InfoItem icon={Shield} label="סוג הפוליסה" value={generalInfo.policyType!} />
            )}
          </div>

          {(hasPolicy(generalInfo.startDate) || hasPolicy(generalInfo.endDate)) && (
            <>
              <Separator className="my-4" />
              <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/40">
                <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
                  <Calendar className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium">תקופת ביטוח</p>
                  <p className="text-sm font-medium mt-0.5">
                    {hasPolicy(generalInfo.startDate) ? generalInfo.startDate : "—"} עד {hasPolicy(generalInfo.endDate) ? generalInfo.endDate : "—"}
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="size-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Shield className="size-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold">סיכום כיסויים</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{summary}</p>
          <div className="flex flex-wrap gap-2">
            {uniqueCategories.map(cat => (
              <Badge key={cat} variant="secondary" className="text-xs gap-1">
                {cat}
                <span className="opacity-60">({coverages.filter(c => c.category === cat).length})</span>
              </Badge>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t">
            <p className="text-[11px] text-muted-foreground">
              סה״כ {coverages.length} כיסויים ב-{uniqueCategories.length} קטגוריות
            </p>
          </div>
        </CardContent>
      </Card>

      {generalInfo.importantNotes.length > 0 && generalInfo.importantNotes[0] !== "" && (
        <Card className="border-amber-200/60 bg-amber-50/30">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="size-4 text-amber-600" />
              </div>
              <h3 className="text-sm font-semibold text-amber-900">דברים שחשוב לדעת</h3>
            </div>
            <ul className="space-y-2.5">
              {generalInfo.importantNotes.map((note, i) => (
                <li key={i} className="text-sm text-amber-900/80 flex items-start gap-2.5">
                  <span className="size-1.5 rounded-full bg-amber-400 shrink-0 mt-2" />
                  {note}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {generalInfo.fineprint.length > 0 && generalInfo.fineprint[0] !== "" && (
        <Card className="border-muted bg-muted/20">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-lg bg-muted flex items-center justify-center">
                <Info className="size-4 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-muted-foreground">אותיות קטנות</h3>
            </div>
            <ul className="space-y-2">
              {generalInfo.fineprint.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-2.5">
                  <span className="size-1 rounded-full bg-muted-foreground/30 shrink-0 mt-2" />
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

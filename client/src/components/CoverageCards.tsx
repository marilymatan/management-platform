import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Heart,
  Stethoscope,
  Pill,
  Eye,
  Scissors,
  Brain,
  Activity,
  Shield,
  ChevronLeft,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Coverage } from "@shared/insurance";

interface CoverageCardsProps {
  coverages: Coverage[];
  selectedFileFilter?: string | null;
}

function getCategoryIcon(category: string) {
  const lower = category.toLowerCase();
  if (lower.includes("רפואה משלימה") || lower.includes("משלים")) return <Heart className="size-5" />;
  if (lower.includes("אשפוז")) return <Activity className="size-5" />;
  if (lower.includes("שיניים")) return <Stethoscope className="size-5" />;
  if (lower.includes("עיניים")) return <Eye className="size-5" />;
  if (lower.includes("תרופות")) return <Pill className="size-5" />;
  if (lower.includes("ניתוח")) return <Scissors className="size-5" />;
  if (lower.includes("נפש") || lower.includes("פסיכ")) return <Brain className="size-5" />;
  return <Shield className="size-5" />;
}

function getCategoryColor(category: string): string {
  const lower = category.toLowerCase();
  if (lower.includes("רפואה משלימה") || lower.includes("משלים")) return "bg-pink-50 text-pink-700 border-pink-200";
  if (lower.includes("אשפוז")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (lower.includes("שיניים")) return "bg-cyan-50 text-cyan-700 border-cyan-200";
  if (lower.includes("עיניים")) return "bg-purple-50 text-purple-700 border-purple-200";
  if (lower.includes("תרופות")) return "bg-green-50 text-green-700 border-green-200";
  if (lower.includes("ניתוח")) return "bg-orange-50 text-orange-700 border-orange-200";
  if (lower.includes("נפש") || lower.includes("פסיכ")) return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="py-3 text-right" dir="rtl">
      <dt className="text-sm font-medium text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm text-foreground" style={{
        textAlign: 'right',
        direction: 'rtl'
      }}>
        {value}
      </dd>
      <style>{`
        [dir="rtl"] ul, [dir="rtl"] ol {
          text-align: right;
          padding-right: 1.5rem;
          padding-left: 0;
        }
        [dir="rtl"] li {
          text-align: right;
        }
      `}</style>
    </div>
  );
}

export function CoverageCards({ coverages, selectedFileFilter }: CoverageCardsProps) {
  const [selectedCoverage, setSelectedCoverage] = useState<Coverage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  if (coverages.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Shield className="size-12 mx-auto mb-3 opacity-30" />
        <p>לא נמצאו כיסויים בפוליסה</p>
      </div>
    );
  }

  // Filter coverages by search query and selected file
  const filteredCoverages = coverages.filter(cov => {
    const matchesSearch = cov.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cov.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFile = !selectedFileFilter || cov.sourceFile === selectedFileFilter;
    return matchesSearch && matchesFile;
  });

  // Group coverages by category
  const grouped = filteredCoverages.reduce<Record<string, Coverage[]>>((acc, cov) => {
    const cat = cov.category || "אחר";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cov);
    return acc;
  }, {});

  return (
    <>
      {/* Search Filter */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="חיפוש כיסויים..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 text-right"
            dir="rtl"
          />
        </div>
        {searchQuery && (
          <p className="text-xs text-muted-foreground mt-2">
            נמצאו {filteredCoverages.length} כיסויים
          </p>
        )}
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="size-12 mx-auto mb-3 opacity-30" />
            <p>לא נמצאו כיסויים התואמים לחיפוש</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`rounded-lg p-1.5 ${getCategoryColor(category)}`}>
                  {getCategoryIcon(category)}
                </div>
                <h3 className="text-base font-semibold">{category}</h3>
                <Badge variant="secondary" className="text-xs">
                  {items.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map(coverage => (
                  <Card
                    key={coverage.id}
                    className="cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/30 group"
                    onClick={() => setSelectedCoverage(coverage)}
                  >
                    <CardHeader className="pb-2 pt-4 px-4">
                      <CardTitle className="text-sm font-semibold leading-tight">
                        {coverage.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <p className="text-xs text-primary font-medium mb-2">
                        {coverage.limit}
                      </p>
                      {coverage.copay && coverage.copay !== "לא מצוין בפוליסה" && coverage.copay !== "לא צוין בפוליסה" && (
                        <p className="text-xs text-muted-foreground">
                          השתתפות עצמית: {coverage.copay}
                        </p>
                      )}
                      {coverage.sourceFile && (
                        <p className="text-xs text-muted-foreground mt-2 border-t pt-2">
                          📄 {coverage.sourceFile}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedCoverage} onOpenChange={(open) => !open && setSelectedCoverage(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-right" dir="rtl">
              {selectedCoverage?.title}
            </DialogTitle>
            <DialogDescription className="text-right" dir="rtl">
              {selectedCoverage?.category}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-full max-h-[60vh] pr-4">
            <div className="space-y-4" dir="rtl">
              {selectedCoverage?.sourceFile && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">
                      <span className="font-semibold">📄 מקור:</span> {selectedCoverage.sourceFile}
                    </p>
                  </div>
                  <Separator />
                </>
              )}

              <DetailRow label="כיסוי" value={selectedCoverage?.limit} />
              <Separator />

              {selectedCoverage?.details && selectedCoverage.details !== "לא מצוין בפוליסה" && selectedCoverage.details !== "לא צוין בפוליסה" && (
                <>
                  <DetailRow label="פרטים" value={selectedCoverage.details} />
                  <Separator />
                </>
              )}

              {selectedCoverage?.eligibility && selectedCoverage.eligibility !== "לא מצוין בפוליסה" && selectedCoverage.eligibility !== "לא צוין בפוליסה" && (
                <>
                  <DetailRow label="תנאי זכאות" value={selectedCoverage.eligibility} />
                  <Separator />
                </>
              )}

              {selectedCoverage?.copay && selectedCoverage.copay !== "לא מצוין בפוליסה" && selectedCoverage.copay !== "לא צוין בפוליסה" && (
                <>
                  <DetailRow label="השתתפות עצמית" value={selectedCoverage.copay} />
                  <Separator />
                </>
              )}

              {selectedCoverage?.maxReimbursement && selectedCoverage.maxReimbursement !== "לא מצוין בפוליסה" && selectedCoverage.maxReimbursement !== "לא צוין בפוליסה" && (
                <>
                  <DetailRow label="החזר מקסימלי" value={selectedCoverage.maxReimbursement} />
                  <Separator />
                </>
              )}

              {selectedCoverage?.waitingPeriod && selectedCoverage.waitingPeriod !== "לא מצוין בפוליסה" && selectedCoverage.waitingPeriod !== "לא צוין בפוליסה" && (
                <>
                  <DetailRow label="תקופת אכשרה" value={selectedCoverage.waitingPeriod} />
                  <Separator />
                </>
              )}

              {selectedCoverage?.exclusions && selectedCoverage.exclusions !== "לא מצוין בפוליסה" && selectedCoverage.exclusions !== "לא צוין בפוליסה" && (
                <>
                  <DetailRow label="חריגים" value={selectedCoverage.exclusions} />
                  <Separator />
                </>
              )}

              {selectedCoverage && !selectedCoverage.details && !selectedCoverage.eligibility && !selectedCoverage.copay && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  לא מצוינו פרטים נוספים בפוליסה
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

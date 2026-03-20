import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Search,
  ChevronLeft,
  Car,
  Home,
  Flame,
  Droplets,
  Lock,
  User,
  Briefcase,
  HeartPulse,
  Baby,
  Wallet,
  Building,
  Sofa,
  Users,
  CloudRain,
  Wrench,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Coverage } from "@shared/insurance";

interface CoverageCardsProps {
  coverages: Coverage[];
  selectedFileFilter?: string | null;
  initialCategoryFilter?: string | null;
}

const CATEGORY_CONFIG: Record<string, { icon: React.ReactNode; color: string; border: string; bg: string }> = {
  "רפואה משלימה": { icon: <Heart className="size-4" />, color: "text-pink-600", border: "border-r-pink-400", bg: "bg-pink-50" },
  "משלים": { icon: <Heart className="size-4" />, color: "text-pink-600", border: "border-r-pink-400", bg: "bg-pink-50" },
  "אשפוז": { icon: <Activity className="size-4" />, color: "text-blue-600", border: "border-r-blue-400", bg: "bg-blue-50" },
  "שיניים": { icon: <Stethoscope className="size-4" />, color: "text-cyan-600", border: "border-r-cyan-400", bg: "bg-cyan-50" },
  "עיניים": { icon: <Eye className="size-4" />, color: "text-purple-600", border: "border-r-purple-400", bg: "bg-purple-50" },
  "תרופות": { icon: <Pill className="size-4" />, color: "text-green-600", border: "border-r-green-400", bg: "bg-green-50" },
  "ניתוח": { icon: <Scissors className="size-4" />, color: "text-orange-600", border: "border-r-orange-400", bg: "bg-orange-50" },
  "נפש": { icon: <Brain className="size-4" />, color: "text-indigo-600", border: "border-r-indigo-400", bg: "bg-indigo-50" },
  "פסיכ": { icon: <Brain className="size-4" />, color: "text-indigo-600", border: "border-r-indigo-400", bg: "bg-indigo-50" },
  "הריון ולידה": { icon: <Baby className="size-4" />, color: "text-rose-600", border: "border-r-rose-400", bg: "bg-rose-50" },

  "חובה": { icon: <Shield className="size-4" />, color: "text-red-600", border: "border-r-red-400", bg: "bg-red-50" },
  "מקיף": { icon: <Car className="size-4" />, color: "text-amber-600", border: "border-r-amber-400", bg: "bg-amber-50" },
  "צד ג": { icon: <Users className="size-4" />, color: "text-sky-600", border: "border-r-sky-400", bg: "bg-sky-50" },
  "נזקי גוף": { icon: <HeartPulse className="size-4" />, color: "text-rose-600", border: "border-r-rose-400", bg: "bg-rose-50" },
  "רכוש": { icon: <Wallet className="size-4" />, color: "text-emerald-600", border: "border-r-emerald-400", bg: "bg-emerald-50" },
  "גניבה": { icon: <Lock className="size-4" />, color: "text-slate-600", border: "border-r-slate-400", bg: "bg-slate-50" },
  "רכב": { icon: <Car className="size-4" />, color: "text-amber-600", border: "border-r-amber-400", bg: "bg-amber-50" },

  "ביטוח חיים": { icon: <User className="size-4" />, color: "text-blue-600", border: "border-r-blue-400", bg: "bg-blue-50" },
  "אובדן כושר עבודה": { icon: <Briefcase className="size-4" />, color: "text-orange-600", border: "border-r-orange-400", bg: "bg-orange-50" },
  "סיעודי": { icon: <HeartPulse className="size-4" />, color: "text-teal-600", border: "border-r-teal-400", bg: "bg-teal-50" },
  "נכות": { icon: <Activity className="size-4" />, color: "text-violet-600", border: "border-r-violet-400", bg: "bg-violet-50" },
  "פנסיה": { icon: <Wallet className="size-4" />, color: "text-emerald-600", border: "border-r-emerald-400", bg: "bg-emerald-50" },
  "ריסק": { icon: <Flame className="size-4" />, color: "text-red-600", border: "border-r-red-400", bg: "bg-red-50" },

  "מבנה": { icon: <Building className="size-4" />, color: "text-stone-600", border: "border-r-stone-400", bg: "bg-stone-50" },
  "תכולה": { icon: <Sofa className="size-4" />, color: "text-amber-600", border: "border-r-amber-400", bg: "bg-amber-50" },
  "נזקי טבע": { icon: <CloudRain className="size-4" />, color: "text-sky-600", border: "border-r-sky-400", bg: "bg-sky-50" },
  "צנרת": { icon: <Droplets className="size-4" />, color: "text-blue-600", border: "border-r-blue-400", bg: "bg-blue-50" },
  "דירה": { icon: <Home className="size-4" />, color: "text-emerald-600", border: "border-r-emerald-400", bg: "bg-emerald-50" },
};

function getCategoryConfig(category: string) {
  const lower = category.toLowerCase();
  for (const [key, config] of Object.entries(CATEGORY_CONFIG)) {
    if (lower.includes(key)) return config;
  }
  return { icon: <Shield className="size-4" />, color: "text-slate-600", border: "border-r-slate-400", bg: "bg-slate-50" };
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="py-3 text-right" dir="rtl">
      <dt className="text-sm font-medium text-muted-foreground mb-1">{label}</dt>
      <dd className="text-sm text-foreground" style={{ textAlign: 'right', direction: 'rtl' }}>
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

export function CoverageCards({ coverages, selectedFileFilter, initialCategoryFilter }: CoverageCardsProps) {
  const [selectedCoverage, setSelectedCoverage] = useState<Coverage | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(initialCategoryFilter ?? null);

  useEffect(() => {
    const availableCategories = new Set(coverages.map((coverage) => coverage.category || "אחר"));
    setActiveCategory(
      initialCategoryFilter && availableCategories.has(initialCategoryFilter)
        ? initialCategoryFilter
        : null
    );
  }, [coverages, initialCategoryFilter]);

  if (coverages.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="size-16 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-4">
          <Shield className="size-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">לא נמצאו כיסויים</h3>
        <p className="text-sm text-muted-foreground">לא נמצאו כיסויים בפוליסה שהועלתה</p>
      </div>
    );
  }

  const filteredCoverages = coverages.filter(cov => {
    const matchesSearch = cov.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cov.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFile = !selectedFileFilter || cov.sourceFile === selectedFileFilter;
    const matchesCategory = !activeCategory || cov.category === activeCategory;
    return matchesSearch && matchesFile && matchesCategory;
  });

  const grouped = filteredCoverages.reduce<Record<string, Coverage[]>>((acc, cov) => {
    const cat = cov.category || "אחר";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cov);
    return acc;
  }, {});

  const allCategories = Array.from(new Set(coverages.map(c => c.category || "אחר")));

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="חיפוש כיסויים..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10 text-right bg-card"
            dir="rtl"
          />
        </div>
      </div>

      {allCategories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              !activeCategory
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
            }`}
          >
            הכל ({coverages.filter(c => !selectedFileFilter || c.sourceFile === selectedFileFilter).length})
          </button>
          {allCategories.map(cat => {
            const config = getCategoryConfig(cat);
            const count = coverages.filter(c =>
              c.category === cat && (!selectedFileFilter || c.sourceFile === selectedFileFilter)
            ).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <span className={config.color}>{config.icon}</span>
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {searchQuery && (
        <p className="text-xs text-muted-foreground mb-4">
          נמצאו {filteredCoverages.length} כיסויים
        </p>
      )}

      <div className="space-y-8">
        {Object.entries(grouped).length === 0 ? (
          <div className="text-center py-12">
            <div className="size-14 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
              <Search className="size-6 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">לא נמצאו כיסויים התואמים לחיפוש</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => {
            const config = getCategoryConfig(category);
            return (
              <div key={category}>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className={`size-8 rounded-lg ${config.bg} flex items-center justify-center ${config.color}`}>
                    {config.icon}
                  </div>
                  <h3 className="text-sm font-semibold">{category}</h3>
                  <Badge variant="secondary" className="text-[11px] h-5">
                    {items.length}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {items.map(coverage => {
                    const catConfig = getCategoryConfig(coverage.category);
                    return (
                      <Card
                        key={coverage.id}
                        className={`group cursor-pointer hover:shadow-md transition-all duration-200 hover:border-primary/20 border-r-[3px] ${catConfig.border}`}
                        onClick={() => setSelectedCoverage(coverage)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold leading-snug flex-1">
                              {coverage.title}
                            </h4>
                            <ChevronLeft className="size-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                          </div>
                          <p className="text-xs text-primary font-medium mt-2">
                            {coverage.limit}
                          </p>
                          {coverage.copay && coverage.copay !== "לא מצוין בפוליסה" && coverage.copay !== "לא צוין בפוליסה" && (
                            <p className="text-[11px] text-muted-foreground mt-1.5">
                              השתתפות עצמית: {coverage.copay}
                            </p>
                          )}
                          {coverage.sourceFile && (
                            <div className="flex items-center gap-1 mt-3 pt-2.5 border-t">
                              <span className="text-[11px] text-muted-foreground truncate">{coverage.sourceFile}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

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
                      <span className="font-semibold">מקור:</span> {selectedCoverage.sourceFile}
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

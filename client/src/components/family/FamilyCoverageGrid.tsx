import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Shield, Car, Home, Sparkles, ChevronDown } from "lucide-react";
import type { InsuranceCategory } from "@shared/insurance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getFamilyCoverageStatusClasses,
  getFamilyCoverageStatusLabel,
  type FamilyCoverageRow,
  type FamilyCoverageStatus,
} from "@/lib/familyCoverage";
import { CoverageOrbitMap } from "./CoverageOrbitMap";
import { CoverageDetailPanel } from "./CoverageDetailPanel";

type FamilyCoverageGridProps = {
  rows: FamilyCoverageRow[];
  householdSize: number;
  categoriesWithData: number;
  missingCount: number;
  reviewCount: number;
  onOpenInsurance: () => void;
  onOpenAssistant: () => void;
};

const CATEGORY_ICON: Record<InsuranceCategory, typeof Heart> = {
  health: Heart,
  life: Shield,
  car: Car,
  home: Home,
};

const STATUS_DOT_CLASS: Record<FamilyCoverageStatus, string> = {
  household_covered: "bg-success",
  needs_review: "bg-warning",
  missing: "bg-destructive",
  not_relevant: "bg-muted-foreground/40",
};

function MobileMemberCard({
  row,
  isExpanded,
  onToggle,
}: {
  row: FamilyCoverageRow;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-start"
        aria-expanded={isExpanded}
        aria-label={`${row.fullName} - ${row.relationLabel}`}
        data-testid={`mobile-member-card-${row.id}`}
      >
        <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">
            {row.fullName.charAt(0)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold truncate">{row.fullName}</p>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {row.relationLabel}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{row.hint}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 me-1">
          {row.cells.map((cell) => (
            <span
              key={cell.category}
              className={`size-2.5 rounded-full ${STATUS_DOT_CLASS[cell.status]}`}
              title={`${cell.label}: ${getFamilyCoverageStatusLabel(cell.status)}`}
            />
          ))}
        </div>

        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {row.cells.map((cell) => {
                const Icon = CATEGORY_ICON[cell.category];
                return (
                  <div
                    key={cell.category}
                    className={`rounded-xl border p-3 space-y-1.5 ${getFamilyCoverageStatusClasses(cell.status)}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className="size-3.5" />
                        <p className="text-xs font-semibold">{cell.label}</p>
                      </div>
                      <Badge variant="secondary" className="bg-background/70 text-current text-[10px]">
                        {getFamilyCoverageStatusLabel(cell.status)}
                      </Badge>
                    </div>
                    <p className="text-[11px] leading-relaxed">{cell.summary}</p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FamilyCoverageGrid({
  rows,
  householdSize,
  categoriesWithData,
  missingCount,
  reviewCount,
  onOpenInsurance,
  onOpenAssistant,
}: FamilyCoverageGridProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(null);

  const selectedRow = rows.find((r) => r.id === selectedMemberId) ?? null;

  const handleSelectMember = useCallback((id: string | null) => {
    setSelectedMemberId(id);
  }, []);

  const toggleMobileCard = useCallback((id: string) => {
    setExpandedMobileId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="space-y-6">
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

      <div className="hidden md:block">
        <CoverageOrbitMap
          rows={rows}
          selectedMemberId={selectedMemberId}
          onSelectMember={handleSelectMember}
        />

        <AnimatePresence mode="wait">
          {selectedRow && (
            <div className="mt-6">
              <CoverageDetailPanel
                key={selectedRow.id}
                row={selectedRow}
                onClose={() => setSelectedMemberId(null)}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      <div className="md:hidden space-y-3" data-testid="mobile-coverage-flow">
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              { status: "household_covered" as const, cls: "bg-success" },
              { status: "needs_review" as const, cls: "bg-warning" },
              { status: "missing" as const, cls: "bg-destructive" },
              { status: "not_relevant" as const, cls: "bg-muted-foreground/40" },
            ] as const
          ).map((item) => (
            <div key={item.status} className="flex items-center gap-1">
              <span className={`size-2 rounded-full ${item.cls}`} />
              <span className="text-[10px] text-muted-foreground">
                {getFamilyCoverageStatusLabel(item.status)}
              </span>
            </div>
          ))}
        </div>

        {rows.map((row, i) => (
          <motion.div
            key={row.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <MobileMemberCard
              row={row}
              isExpanded={expandedMobileId === row.id}
              onToggle={() => toggleMobileCard(row.id)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

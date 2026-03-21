import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Shield, Car, Home, X } from "lucide-react";
import type { InsuranceCategory } from "@shared/insurance";
import { Badge } from "@/components/ui/badge";
import {
  getFamilyCoverageStatusClasses,
  getFamilyCoverageStatusLabel,
  type FamilyCoverageRow,
} from "@/lib/familyCoverage";

type CoverageDetailPanelProps = {
  row: FamilyCoverageRow;
  onClose: () => void;
};

const CATEGORY_ICON: Record<InsuranceCategory, typeof Heart> = {
  health: Heart,
  life: Shield,
  car: Car,
  home: Home,
};

export function CoverageDetailPanel({ row, onClose }: CoverageDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, [row.id]);

  return (
    <motion.div
      ref={panelRef}
      tabIndex={-1}
      role="region"
      aria-label={`פרטי כיסוי עבור ${row.fullName}`}
      aria-live="polite"
      data-testid="coverage-detail-panel"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      className="rounded-2xl border border-border bg-card p-5 shadow-lg outline-none"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold">{row.fullName}</h3>
            <Badge variant="outline">{row.relationLabel}</Badge>
            <Badge
              variant="secondary"
              className="bg-primary/8 text-primary border-0 text-[11px]"
            >
              {row.kind === "primary" ? "הקשר ראשי" : "בן בית"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{row.hint}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-muted transition-colors"
          aria-label="סגור פרטי כיסוי"
          data-testid="coverage-detail-close"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {row.cells.map((cell, i) => {
          const Icon = CATEGORY_ICON[cell.category];
          return (
            <motion.div
              key={cell.category}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className={`rounded-xl border p-3.5 space-y-2 ${getFamilyCoverageStatusClasses(cell.status)}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="size-4" />
                  <p className="text-sm font-semibold">{cell.label}</p>
                </div>
                <Badge variant="secondary" className="bg-background/70 text-current text-[11px]">
                  {getFamilyCoverageStatusLabel(cell.status)}
                </Badge>
              </div>
              <p className="text-xs leading-relaxed">{cell.summary}</p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

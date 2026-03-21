import { useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import type { InsuranceCategory } from "@shared/insurance";
import {
  getFamilyCoverageStatusLabel,
  type FamilyCoverageRow,
  type FamilyCoverageStatus,
} from "@/lib/familyCoverage";

type CoverageOrbitMapProps = {
  rows: FamilyCoverageRow[];
  selectedMemberId: string | null;
  onSelectMember: (id: string | null) => void;
};

const CATEGORIES: InsuranceCategory[] = ["health", "life", "car", "home"];

const CATEGORY_LABELS: Record<InsuranceCategory, string> = {
  health: "בריאות",
  life: "חיים",
  car: "רכב",
  home: "דירה",
};

const STATUS_COLORS: Record<FamilyCoverageStatus, string> = {
  household_covered: "var(--success)",
  needs_review: "var(--warning)",
  missing: "var(--destructive)",
  not_relevant: "var(--muted-foreground)",
};

const STATUS_GLOW: Record<FamilyCoverageStatus, string> = {
  household_covered: "rgba(34,197,94,0.35)",
  needs_review: "rgba(234,179,8,0.35)",
  missing: "rgba(239,68,68,0.4)",
  not_relevant: "transparent",
};

const CX = 300;
const CY = 300;
const RING_RADII = [90, 140, 190, 240];
const MEMBER_RADIUS = 270;
const DOT_SIZE = 8;
const CENTER_R = 46;

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function getMemberAngles(count: number): number[] {
  if (count === 0) return [];
  if (count === 1) return [-90];
  const spread = Math.min(360 - 360 / (count + 1), 360);
  const step = spread / count;
  const start = -90 - spread / 2 + step / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}

const ringVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (i: number) => ({
    pathLength: 1,
    opacity: 1,
    transition: { duration: 0.8, delay: 0.1 + i * 0.12, ease: "easeOut" as const },
  }),
};

const nodeVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 260, damping: 20, delay: 0.5 + i * 0.1 },
  }),
};

const dotVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => ({
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 300, damping: 18, delay: 0.7 + i * 0.04 },
  }),
};

const lineVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: (i: number) => ({
    pathLength: 1,
    opacity: 0.2,
    transition: { duration: 0.6, delay: 0.4 + i * 0.08, ease: "easeOut" as const },
  }),
};

export function CoverageOrbitMap({
  rows,
  selectedMemberId,
  onSelectMember,
}: CoverageOrbitMapProps) {
  const members = useMemo(() => rows.filter((r) => r.kind === "member"), [rows]);
  const primary = useMemo(() => rows.find((r) => r.kind === "primary"), [rows]);
  const memberAngles = useMemo(() => getMemberAngles(members.length), [members.length]);

  const handleMemberClick = useCallback(
    (id: string) => {
      onSelectMember(selectedMemberId === id ? null : id);
    },
    [selectedMemberId, onSelectMember],
  );

  const handleKeyDown = useCallback(
    (id: string, e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleMemberClick(id);
      }
    },
    [handleMemberClick],
  );

  return (
    <div
      className="relative w-full max-w-[600px] mx-auto"
      data-testid="coverage-orbit-map"
    >
      <svg
        viewBox="0 0 600 600"
        className="w-full h-auto"
        role="img"
        aria-label="מפת כיסוי ביטוחי אורביטלית המציגה את מצב הכיסוי של כל בן משפחה"
      >
        <defs>
          {CATEGORIES.map((cat) => (
            <filter key={cat} id={`glow-${cat}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
          <filter id="glow-center" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {RING_RADII.map((r, i) => (
          <motion.circle
            key={`ring-${i}`}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1.2}
            strokeDasharray="6 4"
            custom={i}
            variants={ringVariants}
            initial="hidden"
            animate="visible"
          />
        ))}

        {RING_RADII.map((r, i) => {
          const labelPos = polarToXY(CX, CY, r, -4);
          return (
            <motion.text
              key={`ring-label-${i}`}
              x={labelPos.x}
              y={labelPos.y - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted-foreground)"
              custom={i}
              variants={ringVariants}
              initial="hidden"
              animate="visible"
            >
              {CATEGORY_LABELS[CATEGORIES[i]]}
            </motion.text>
          );
        })}

        {members.map((member, idx) => {
          const angle = memberAngles[idx];
          const memberPos = polarToXY(CX, CY, MEMBER_RADIUS, angle);
          return (
            <motion.line
              key={`line-${member.id}`}
              x1={CX}
              y1={CY}
              x2={memberPos.x}
              y2={memberPos.y}
              stroke="var(--border)"
              strokeWidth={1}
              custom={idx}
              variants={lineVariants}
              initial="hidden"
              animate="visible"
            />
          );
        })}

        {members.map((member, memberIdx) => {
          const angle = memberAngles[memberIdx];
          return member.cells.map((cell, cellIdx) => {
            const catIndex = CATEGORIES.indexOf(cell.category);
            if (catIndex < 0) return null;
            const r = RING_RADII[catIndex];
            const pos = polarToXY(CX, CY, r, angle);
            const isSelected = selectedMemberId === member.id;
            const dotIndex = memberIdx * 4 + cellIdx;

            return (
              <motion.g
                key={`dot-${member.id}-${cell.category}`}
                custom={dotIndex}
                variants={dotVariants}
                initial="hidden"
                animate="visible"
              >
                {(cell.status === "missing" || cell.status === "needs_review") && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={DOT_SIZE + 3}
                    fill={STATUS_GLOW[cell.status]}
                    className={cell.status === "missing" ? "animate-orbit-pulse-strong" : "animate-orbit-pulse"}
                    style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                  />
                )}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={DOT_SIZE}
                  fill={STATUS_COLORS[cell.status]}
                  stroke={isSelected ? "var(--foreground)" : "var(--background)"}
                  strokeWidth={isSelected ? 2.5 : 2}
                  data-testid={`orbit-status-dot-${member.id}-${cell.category}`}
                >
                  <title>{`${member.fullName} · ${cell.label}: ${getFamilyCoverageStatusLabel(cell.status)}`}</title>
                </circle>
              </motion.g>
            );
          });
        })}

        {primary && (
          <motion.g
            custom={0}
            variants={nodeVariants}
            initial="hidden"
            animate="visible"
          >
            <circle
              cx={CX}
              cy={CY}
              r={CENTER_R + 4}
              fill="var(--primary)"
              opacity={0.1}
              filter="url(#glow-center)"
            />
            <circle
              cx={CX}
              cy={CY}
              r={CENTER_R}
              fill="var(--card)"
              stroke="var(--primary)"
              strokeWidth={2.5}
              className="cursor-pointer"
              onClick={() => handleMemberClick(primary.id)}
              onKeyDown={(e) => handleKeyDown(primary.id, e)}
              tabIndex={0}
              role="button"
              aria-label={`${primary.fullName} - ${primary.relationLabel}`}
              data-testid="orbit-center-node"
            />

            {primary.cells.map((cell, i) => {
              const dotAngle = -90 + i * 90;
              const dotPos = polarToXY(CX, CY, CENTER_R + 14, dotAngle);
              return (
                <g key={`primary-dot-${cell.category}`}>
                  {(cell.status === "missing" || cell.status === "needs_review") && (
                    <circle
                      cx={dotPos.x}
                      cy={dotPos.y}
                      r={5}
                      fill={STATUS_GLOW[cell.status]}
                      className={cell.status === "missing" ? "animate-orbit-pulse-strong" : "animate-orbit-pulse"}
                      style={{ transformOrigin: `${dotPos.x}px ${dotPos.y}px` }}
                    />
                  )}
                  <circle
                    cx={dotPos.x}
                    cy={dotPos.y}
                    r={5}
                    fill={STATUS_COLORS[cell.status]}
                    stroke="var(--background)"
                    strokeWidth={1.5}
                    data-testid={`orbit-status-dot-${primary.id}-${cell.category}`}
                  >
                    <title>{`${primary.fullName} · ${cell.label}: ${getFamilyCoverageStatusLabel(cell.status)}`}</title>
                  </circle>
                </g>
              );
            })}

            <text
              x={CX}
              y={CY - 6}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="var(--foreground)"
              className="pointer-events-none select-none"
            >
              {primary.fullName}
            </text>
            <text
              x={CX}
              y={CY + 10}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted-foreground)"
              className="pointer-events-none select-none"
            >
              {primary.relationLabel}
            </text>
          </motion.g>
        )}

        {members.map((member, idx) => {
          const angle = memberAngles[idx];
          const pos = polarToXY(CX, CY, MEMBER_RADIUS, angle);
          const isSelected = selectedMemberId === member.id;

          return (
            <motion.g
              key={`node-${member.id}`}
              custom={idx + 1}
              variants={nodeVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.circle
                cx={pos.x}
                cy={pos.y}
                r={32}
                fill="var(--card)"
                stroke={isSelected ? "var(--primary)" : "var(--border)"}
                strokeWidth={isSelected ? 2.5 : 1.5}
                className="cursor-pointer"
                onClick={() => handleMemberClick(member.id)}
                onKeyDown={(e) => handleKeyDown(member.id, e)}
                tabIndex={0}
                role="button"
                aria-label={`${member.fullName} - ${member.relationLabel}. ${member.hint}`}
                aria-pressed={isSelected}
                data-testid={`orbit-member-node-${member.id}`}
                whileHover={{ scale: 1.12 }}
                animate={{
                  opacity: selectedMemberId && !isSelected ? 0.5 : 1,
                  scale: isSelected ? 1.08 : 1,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              />

              <text
                x={pos.x}
                y={pos.y - 4}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={isSelected ? "var(--primary)" : "var(--foreground)"}
                className="pointer-events-none select-none"
              >
                {member.fullName.length > 10 ? member.fullName.slice(0, 9) + "…" : member.fullName}
              </text>
              <text
                x={pos.x}
                y={pos.y + 9}
                textAnchor="middle"
                fontSize={8}
                fill="var(--muted-foreground)"
                className="pointer-events-none select-none"
              >
                {member.relationLabel}
              </text>
            </motion.g>
          );
        })}
      </svg>

      <div className="absolute top-3 end-3 flex flex-col gap-1.5">
        {(
          [
            { status: "household_covered" as const, color: "bg-success" },
            { status: "needs_review" as const, color: "bg-warning" },
            { status: "missing" as const, color: "bg-destructive" },
            { status: "not_relevant" as const, color: "bg-muted-foreground" },
          ] as const
        ).map((item) => (
          <div key={item.status} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${item.color}`} />
            <span className="text-[10px] text-muted-foreground">
              {getFamilyCoverageStatusLabel(item.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

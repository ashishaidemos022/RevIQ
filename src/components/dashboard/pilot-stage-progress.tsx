"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

// ─── Constants ──────────────────────────────────────────

export const IMPLEMENTATION_STAGES = [
  { key: "not_started", label: "Not Started", short: "Not Started" },
  { key: "discovery", label: "Discovery", short: "Discovery" },
  { key: "configuration", label: "Configuration", short: "Config" },
  { key: "uat", label: "UAT", short: "UAT" },
  { key: "production", label: "Production", short: "Prod" },
] as const;

export type ImplementationStage = (typeof IMPLEMENTATION_STAGES)[number]["key"];

const STAGE_INDEX = Object.fromEntries(
  IMPLEMENTATION_STAGES.map((s, i) => [s.key, i])
) as Record<string, number>;

function stageColor(stageKey: string, isCurrent: boolean, isCompleted: boolean) {
  if (isCompleted) return "bg-green-500";
  if (isCurrent) {
    switch (stageKey) {
      case "not_started": return "bg-slate-500";
      case "discovery": return "bg-blue-500";
      case "configuration": return "bg-violet-500";
      case "uat": return "bg-amber-500";
      case "production": return "bg-green-500";
      default: return "bg-blue-500";
    }
  }
  return "bg-muted";
}

function stageTextColor(stageKey: string) {
  switch (stageKey) {
    case "not_started": return "text-slate-600 dark:text-slate-400";
    case "discovery": return "text-blue-600 dark:text-blue-400";
    case "configuration": return "text-violet-600 dark:text-violet-400";
    case "uat": return "text-amber-600 dark:text-amber-400";
    case "production": return "text-green-600 dark:text-green-400";
    default: return "text-muted-foreground";
  }
}

// ─── Progress Bar Component ─────────────────────────────

interface PilotStageProgressProps {
  /** Current implementation stage key */
  stage: string | null;
  /** Compact mode for table cells */
  compact?: boolean;
  className?: string;
}

export function PilotStageProgress({
  stage,
  compact = false,
  className,
}: PilotStageProgressProps) {
  if (!stage) {
    return compact ? (
      <span className="text-[10px] text-muted-foreground">—</span>
    ) : null;
  }

  const currentIdx = STAGE_INDEX[stage] ?? -1;

  if (compact) {
    return <CompactProgress stage={stage} currentIdx={currentIdx} className={className} />;
  }

  return <FullProgress stage={stage} currentIdx={currentIdx} className={className} />;
}

// ─── Full Progress (for expanded rows / detail views) ───

function FullProgress({
  stage,
  currentIdx,
  className,
}: {
  stage: string;
  currentIdx: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {IMPLEMENTATION_STAGES.map((s, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={s.key} className="flex items-center gap-1 flex-1">
            {/* Node */}
            <div className="flex flex-col items-center gap-0.5 flex-1">
              <div
                className={cn(
                  "flex items-center justify-center rounded-full transition-all",
                  isCompleted || isCurrent ? "w-5 h-5" : "w-3 h-3",
                  stageColor(s.key, isCurrent, isCompleted),
                )}
              >
                {isCompleted && (
                  <CheckCircle2 className="h-3 w-3 text-white" />
                )}
                {isCurrent && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
              <span
                className={cn(
                  "text-center leading-tight",
                  isCurrent
                    ? cn("text-[10px] font-semibold", stageTextColor(s.key))
                    : isCompleted
                      ? "text-[9px] text-green-600 dark:text-green-400"
                      : "text-[9px] text-muted-foreground"
                )}
              >
                {s.short}
              </span>
            </div>

            {/* Connector line (not after last) */}
            {idx < IMPLEMENTATION_STAGES.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 min-w-[12px] rounded-full -mx-0.5",
                  idx < currentIdx ? "bg-green-500" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Compact Progress (for table cells) ─────────────────

function CompactProgress({
  stage,
  currentIdx,
  className,
}: {
  stage: string;
  currentIdx: number;
  className?: string;
}) {
  const stageInfo = IMPLEMENTATION_STAGES[currentIdx];
  const progress = IMPLEMENTATION_STAGES.length > 1
    ? (currentIdx / (IMPLEMENTATION_STAGES.length - 1)) * 100
    : 0;

  return (
    <div className={cn("flex items-center gap-2 min-w-[120px]", className)}>
      {/* Mini progress bar */}
      <div className="flex gap-0.5 flex-1">
        {IMPLEMENTATION_STAGES.map((s, idx) => (
          <div
            key={s.key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all",
              idx <= currentIdx
                ? stageColor(s.key, idx === currentIdx, idx < currentIdx)
                : "bg-muted"
            )}
          />
        ))}
      </div>
      {/* Label */}
      <Badge
        variant="outline"
        className={cn(
          "text-[9px] h-4 whitespace-nowrap",
          stageTextColor(stage),
          stage === "production"
            ? "bg-green-500/10 border-green-500/20"
            : stage === "uat"
              ? "bg-amber-500/10 border-amber-500/20"
              : stage === "configuration"
                ? "bg-violet-500/10 border-violet-500/20"
                : stage === "discovery"
                  ? "bg-blue-500/10 border-blue-500/20"
                  : "bg-muted border-border"
        )}
      >
        {stageInfo?.short || stage}
      </Badge>
    </div>
  );
}

// ─── Stage Badge (standalone) ───────────────────────────

interface PilotStageBadgeProps {
  stage: string | null;
}

export function PilotStageBadge({ stage }: PilotStageBadgeProps) {
  if (!stage) return <span className="text-[10px] text-muted-foreground">—</span>;

  const info = IMPLEMENTATION_STAGES.find((s) => s.key === stage);

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        stageTextColor(stage),
        stage === "production"
          ? "bg-green-500/10 border-green-500/20"
          : stage === "uat"
            ? "bg-amber-500/10 border-amber-500/20"
            : stage === "configuration"
              ? "bg-violet-500/10 border-violet-500/20"
              : stage === "discovery"
                ? "bg-blue-500/10 border-blue-500/20"
                : "bg-muted border-border"
      )}
    >
      {info?.label || stage}
    </Badge>
  );
}

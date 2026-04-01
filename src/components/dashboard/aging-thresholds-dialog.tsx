"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_STAGE_THRESHOLDS,
  ALL_THRESHOLD_STAGES,
  type AgingThresholdMap,
  type AgingThreshold,
} from "@/lib/deal-velocity";
import { SS0_SS2_STAGES } from "@/lib/stage-groups";

interface AgingThresholdsDialogProps {
  open: boolean;
  onClose: () => void;
  currentThresholds: AgingThresholdMap | undefined;
  onSave: (thresholds: AgingThresholdMap) => void;
  onReset: () => void;
  isCustomized: boolean;
}

function getGroupLabel(stage: string): string {
  if (SS0_SS2_STAGES.includes(stage)) return "Early Pipeline (SS0-SS2)";
  return "Qualified Pipeline (SS3+)";
}

export function AgingThresholdsDialog({
  open,
  onClose,
  currentThresholds,
  onSave,
  onReset,
  isCustomized,
}: AgingThresholdsDialogProps) {
  // Local draft state for editing
  const [draft, setDraft] = useState<AgingThresholdMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Sync draft from props when dialog opens
  useEffect(() => {
    if (open) {
      const base: AgingThresholdMap = {};
      for (const stage of ALL_THRESHOLD_STAGES) {
        base[stage] = currentThresholds?.[stage] || DEFAULT_STAGE_THRESHOLDS[stage];
      }
      setDraft(base);
      setErrors({});
    }
  }, [open, currentThresholds]);

  function updateStageValue(
    stage: string,
    field: keyof AgingThreshold,
    rawValue: string
  ) {
    const num = parseInt(rawValue, 10);
    setDraft((prev) => ({
      ...prev,
      [stage]: { ...prev[stage], [field]: isNaN(num) ? 0 : num },
    }));
    // Clear error for this stage
    setErrors((prev) => {
      const next = { ...prev };
      delete next[stage];
      return next;
    });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    for (const stage of ALL_THRESHOLD_STAGES) {
      const t = draft[stage];
      if (!t) continue;
      if (t.warning < 1) newErrors[stage] = "Warning must be at least 1 day";
      else if (t.critical < 1) newErrors[stage] = "Critical must be at least 1 day";
      else if (t.critical <= t.warning)
        newErrors[stage] = "Critical must be greater than warning";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    onSave(draft);
    onClose();
  }

  function handleReset() {
    const defaults: AgingThresholdMap = {};
    for (const stage of ALL_THRESHOLD_STAGES) {
      defaults[stage] = { ...DEFAULT_STAGE_THRESHOLDS[stage] };
    }
    setDraft(defaults);
    setErrors({});
    onReset();
    onClose();
  }

  // Group stages for display
  let lastGroup = "";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Configure Stage Aging Thresholds</DialogTitle>
          <DialogDescription>
            Set the number of days in a stage before deals are flagged as warning or critical.
            {isCustomized && (
              <Badge variant="secondary" className="ml-2 text-[10px]">
                Customized
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto -mx-4 px-4 flex-1 min-h-0">
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_90px_90px_80px] gap-2 text-[11px] font-medium text-muted-foreground px-1 pb-1 border-b sticky top-0 bg-background z-10">
              <span>Stage</span>
              <span className="text-center">Warning (days)</span>
              <span className="text-center">Critical (days)</span>
              <span className="text-center">Default</span>
            </div>

            {ALL_THRESHOLD_STAGES.map((stage) => {
              const group = getGroupLabel(stage);
              const showGroup = group !== lastGroup;
              lastGroup = group;

              const threshold = draft[stage] || DEFAULT_STAGE_THRESHOLDS[stage];
              const defaultT = DEFAULT_STAGE_THRESHOLDS[stage];
              const isModified =
                threshold.warning !== defaultT.warning ||
                threshold.critical !== defaultT.critical;
              const error = errors[stage];

              return (
                <div key={stage}>
                  {showGroup && (
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground pt-3 pb-1 px-1">
                      {group}
                    </div>
                  )}
                  <div
                    className={cn(
                      "grid grid-cols-[1fr_90px_90px_80px] gap-2 items-center py-1.5 px-1 rounded",
                      isModified && "bg-blue-500/5",
                      error && "bg-red-500/5"
                    )}
                  >
                    <span className="text-xs font-medium truncate" title={stage}>
                      {stage}
                    </span>
                    <Input
                      type="number"
                      min={1}
                      value={threshold.warning}
                      onChange={(e) =>
                        updateStageValue(stage, "warning", e.target.value)
                      }
                      className={cn(
                        "h-7 text-xs text-center tabular-nums",
                        error && "border-red-500"
                      )}
                    />
                    <Input
                      type="number"
                      min={1}
                      value={threshold.critical}
                      onChange={(e) =>
                        updateStageValue(stage, "critical", e.target.value)
                      }
                      className={cn(
                        "h-7 text-xs text-center tabular-nums",
                        error && "border-red-500"
                      )}
                    />
                    <span className="text-[10px] text-muted-foreground text-center tabular-nums">
                      {defaultT.warning}d / {defaultT.critical}d
                    </span>
                  </div>
                  {error && (
                    <p className="text-[10px] text-red-500 px-1 pb-1">{error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            className="mr-auto gap-1 text-xs"
            onClick={handleReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Defaults
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save Thresholds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

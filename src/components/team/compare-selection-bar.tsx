"use client";

import { Button } from "@/components/ui/button";
import { X, GitCompareArrows, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompareSelectionBarProps {
  count: number;
  minSelections?: number;
  maxSelections?: number;
  selectedNames?: string[];
  onCompare: () => void;
  onClear: () => void;
}

export function CompareSelectionBar({
  count,
  minSelections = 2,
  maxSelections = 4,
  selectedNames = [],
  onCompare,
  onClear,
}: CompareSelectionBarProps) {
  const canCompare = count >= minSelections;
  const atMax = count >= maxSelections;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "transition-transform duration-200 ease-out",
        count > 0 ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3 min-w-0">
          <GitCompareArrows className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium shrink-0">
              {count} selected
            </span>
            {selectedNames.length > 0 && (
              <span className="text-sm text-muted-foreground truncate hidden sm:inline">
                — {selectedNames.join(", ")}
              </span>
            )}
          </div>
          {!canCompare && (
            <span className="text-xs text-muted-foreground shrink-0">
              (select at least {minSelections})
            </span>
          )}
          {atMax && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 shrink-0">
              <AlertCircle className="h-3 w-3" />
              Max {maxSelections} reached
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
          <Button size="sm" disabled={!canCompare} onClick={onCompare}>
            <GitCompareArrows className="mr-1 h-3.5 w-3.5" />
            Compare
          </Button>
        </div>
      </div>
    </div>
  );
}

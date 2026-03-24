"use client";

import { Button } from "@/components/ui/button";
import { X, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompareSelectionBarProps {
  count: number;
  minSelections?: number;
  maxSelections?: number;
  onCompare: () => void;
  onClear: () => void;
}

export function CompareSelectionBar({
  count,
  minSelections = 2,
  maxSelections = 4,
  onCompare,
  onClear,
}: CompareSelectionBarProps) {
  const canCompare = count >= minSelections;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "transition-transform duration-200 ease-out",
        count > 0 ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-3">
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {count} selected
            {!canCompare && (
              <span className="ml-1 text-muted-foreground">
                (select at least {minSelections} to compare)
              </span>
            )}
            {count >= maxSelections && (
              <span className="ml-1 text-muted-foreground">
                (max {maxSelections})
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
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

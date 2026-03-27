"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) => {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v));
    } else {
      onChange([...value, v]);
    }
  };

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full h-8 px-3 text-xs border rounded-md bg-background hover:bg-accent/50 transition-colors"
      >
        <span className="truncate text-left">
          {selectedLabels.length === 0
            ? placeholder
            : selectedLabels.length <= 2
              ? selectedLabels.join(", ")
              : `${selectedLabels.length} selected`}
        </span>
        <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 opacity-50" />
      </button>
      {value.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange([]);
          }}
          className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-md border bg-popover shadow-md">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left"
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  value.includes(option.value)
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/30"
                )}
              >
                {value.includes(option.value) && <Check className="h-3 w-3" />}
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

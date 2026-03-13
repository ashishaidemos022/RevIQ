import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string | number;
  format?: "currency" | "number" | "percent";
  trend?: {
    direction: "up" | "down" | "flat";
    value: number;
    label: string;
  };
  className?: string;
}

function formatValue(value: string | number, format?: string): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "percent":
      return `${value.toFixed(1)}%`;
    case "number":
      return new Intl.NumberFormat("en-US").format(value);
    default:
      return typeof value === "number"
        ? new Intl.NumberFormat("en-US").format(value)
        : String(value);
  }
}

export function KpiCard({ label, value, format, trend, className }: KpiCardProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-4 pb-4 px-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className="text-2xl font-bold mt-1">{formatValue(value, format)}</p>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {trend.direction === "up" && (
              <TrendingUp className="h-3 w-3 text-green-600" />
            )}
            {trend.direction === "down" && (
              <TrendingDown className="h-3 w-3 text-red-600" />
            )}
            {trend.direction === "flat" && (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-xs",
                trend.direction === "up" && "text-green-600",
                trend.direction === "down" && "text-red-600",
                trend.direction === "flat" && "text-muted-foreground"
              )}
            >
              {trend.value > 0 ? "+" : ""}
              {trend.value}% {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

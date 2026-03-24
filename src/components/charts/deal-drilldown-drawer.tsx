"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface DrillDownDeal {
  id: string;
  name: string;
  owner: string;
  acv: number;
  stage?: string;
}

interface DealDrilldownDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  deals: DrillDownDeal[];
  showStage?: boolean;
  accentColor?: string;
}

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

export function DealDrilldownDrawer({
  open,
  onClose,
  title,
  subtitle,
  deals,
  showStage = false,
  accentColor,
}: DealDrilldownDrawerProps) {
  const totalAcv = deals.reduce((sum, d) => sum + d.acv, 0);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {accentColor && (
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: accentColor }}
              />
            )}
            {title}
          </SheetTitle>
          {subtitle && <SheetDescription>{subtitle}</SheetDescription>}
        </SheetHeader>

        <div className="px-4 pb-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{deals.length} deal{deals.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold text-foreground">{fmtCurrency(totalAcv)}</span>
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Deal</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Owner</th>
                  {showStage && (
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Stage</th>
                  )}
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">ACV</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal, i) => (
                  <tr
                    key={deal.id}
                    className={cn(
                      "border-b last:border-0",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <td className="py-2 px-3 text-muted-foreground tabular-nums w-8">
                      {i + 1}
                    </td>
                    <td className="py-2 px-3 font-medium" title={deal.name}>
                      {deal.name}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground" title={deal.owner}>
                      {deal.owner}
                    </td>
                    {showStage && (
                      <td className="py-2 px-3 text-muted-foreground text-xs" title={deal.stage}>
                        {deal.stage}
                      </td>
                    )}
                    <td className="py-2 px-3 text-right font-semibold tabular-nums whitespace-nowrap">
                      {fmtCurrency(deal.acv)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

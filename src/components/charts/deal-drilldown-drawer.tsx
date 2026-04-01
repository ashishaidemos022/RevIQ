"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  acvLabel?: string;
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
  acvLabel = "ACV",
}: DealDrilldownDrawerProps) {
  const totalAcv = deals.reduce((sum, d) => sum + d.acv, 0);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {accentColor && (
              <span
                className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: accentColor }}
              />
            )}
            {title}
          </DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
            <span>{deals.length} deal{deals.length !== 1 ? "s" : ""}</span>
            <span className="font-semibold text-foreground">{fmtCurrency(totalAcv)}</span>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto -mx-4 px-4 flex-1 min-h-0">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted/80 backdrop-blur border-b">
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground w-10">#</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Deal</th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Owner</th>
                  {showStage && (
                    <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Stage</th>
                  )}
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">{acvLabel}</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal, i) => (
                  <tr
                    key={deal.id ?? i}
                    className={cn(
                      "border-b last:border-0",
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <td className="py-2 px-3 text-muted-foreground tabular-nums w-10">
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
      </DialogContent>
    </Dialog>
  );
}

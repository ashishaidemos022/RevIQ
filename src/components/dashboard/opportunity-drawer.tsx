"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface OpportunityDrawerProps {
  opportunityId: string | null;
  open: boolean;
  onClose: () => void;
}

export function OpportunityDrawer({
  opportunityId,
  open,
  onClose,
}: OpportunityDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["opportunity", opportunityId],
    queryFn: () =>
      apiFetch<{ data: Record<string, unknown>[] }>(
        `/api/opportunities?limit=1&offset=0`
      ).then((res) =>
        res.data.find((o) => o.id === opportunityId)
      ),
    enabled: !!opportunityId && open,
  });

  const opp = data as Record<string, unknown> | undefined;

  const formatCurrency = (val: unknown) =>
    typeof val === "number"
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(val)
      : "—";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              (opp?.name as string) || "Opportunity Details"
            )}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 mt-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : opp ? (
          <div className="mt-6 space-y-4">
            <div className="flex gap-2">
              <Badge>{opp.stage as string}</Badge>
              {opp.is_paid_pilot ? <Badge variant="outline">Paid Pilot</Badge> : null}
              {opp.type ? (
                <Badge variant="secondary">
                  {(opp.type as string).replace("_", " ")}
                </Badge>
              ) : null}
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Account</p>
                <p className="font-medium">
                  {(opp.accounts as { name: string } | undefined)?.name || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Owner</p>
                <p className="font-medium">
                  {(opp.users as { full_name: string } | undefined)?.full_name ||
                    "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">ACV</p>
                <p className="font-medium">{formatCurrency(opp.acv)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Amount</p>
                <p className="font-medium">{formatCurrency(opp.amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Close Date</p>
                <p className="font-medium">{(opp.close_date as string) || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Probability</p>
                <p className="font-medium">
                  {opp.probability != null ? `${opp.probability}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Forecast Category</p>
                <p className="font-medium capitalize">
                  {(opp.forecast_category as string)?.replace("_", " ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium capitalize">
                  {(opp.type as string)?.replace("_", " ") || "—"}
                </p>
              </div>
            </div>

            {opp.is_paid_pilot ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Paid Pilot Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Start Date</p>
                      <p className="font-medium">
                        {(opp.paid_pilot_start_date as string) || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">End Date</p>
                      <p className="font-medium">
                        {(opp.paid_pilot_end_date as string) || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-muted-foreground mt-6">Opportunity not found.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

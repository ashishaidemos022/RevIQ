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
import { CreditPathBadge } from "@/components/pbm/credit-path-badge";
import { ExternalLink } from "lucide-react";

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
      apiFetch<{ data: Record<string, unknown> }>(
        `/api/opportunities/${opportunityId}`
      ).then((res) => res.data),
    enabled: !!opportunityId && open,
  });

  const opp = data as Record<string, unknown> | undefined;

  // URLs provided by the API (built server-side from the SF connection)
  const sfUrl = (opp?.salesforce_url as string) || null;
  const parentPilotSfId = opp?.parent_pilot_opportunity_sf_id as string | null;
  const parentPilotUrl = (opp?.parent_pilot_url as string) || null;

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
            <div className="flex gap-2 flex-wrap">
              <Badge>{opp.stage as string}</Badge>
              {opp.is_paid_pilot ? <Badge variant="outline">Paid Pilot</Badge> : null}
              {opp.type ? (
                <Badge variant="secondary">
                  {(opp.type as string).replace("_", " ")}
                </Badge>
              ) : null}
              {opp.credit_path ? (
                <CreditPathBadge
                  creditPath={opp.credit_path as string | null}
                  partnerName={opp.partner_name as string | null}
                />
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
                <p className="text-muted-foreground">Close Date</p>
                <p className="font-medium">{(opp.close_date as string) || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Forecast Category</p>
                <p className="font-medium capitalize">
                  {(opp.forecast_category as string)?.replace("_", " ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">MGMT Forecast</p>
                <p className="font-medium">
                  {(opp.mgmt_forecast_category as string) || "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium capitalize">
                  {(opp.type as string)?.replace("_", " ") || "—"}
                </p>
              </div>
            </div>

            {/* Salesforce Link */}
            {sfUrl && (
              <>
                <Separator />
                <div className="text-sm">
                  <a
                    href={sfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View in Salesforce
                  </a>
                </div>
              </>
            )}

            {/* Parent Pilot Opportunity Link */}
            {parentPilotSfId && (
              <div className="text-sm">
                <p className="text-muted-foreground mb-1">Parent Pilot Opportunity</p>
                {parentPilotUrl ? (
                  <a
                    href={parentPilotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {parentPilotSfId}
                  </a>
                ) : (
                  <p className="font-medium">{parentPilotSfId}</p>
                )}
              </div>
            )}

            {/* Partner / Credit Info */}
            {opp.partner_name || opp.credit_path ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Partner & Credit</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Credit Path</p>
                      <p className="font-medium">
                        {(opp.credit_path as string) || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Partner</p>
                      <p className="font-medium">
                        {(opp.partner_name as string) || "—"}
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

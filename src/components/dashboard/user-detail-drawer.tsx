"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

interface UserDetailDrawerProps {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  board?: string;
  period?: string;
  apiPrefix?: string;
}

interface UserDetail {
  user: {
    id: string;
    full_name: string;
    role: string;
    region: string | null;
    manager_name: string | null;
  };
  kpis: {
    acv_closed_qtd: number;
    acv_closed_ytd: number;
    deals_closed_qtd: number;
    deals_closed_ytd: number;
    pipeline_acv: number;
    open_deals: number;
    booked_pilots?: number;
    open_pilots?: number;
  };
  board: string;
  period: string;
  deals: Array<{
    id: string;
    name: string;
    account_name: string | null;
    acv: number | null;
    close_date: string | null;
    stage: string;
    is_closed_won: boolean;
    is_closed_lost: boolean;
    is_paid_pilot: boolean;
    record_type_name: string | null;
    opportunity_source: string | null;
  }>;
  activities: Array<{
    id: string;
    activity_type: string;
    activity_date: string;
    subject: string | null;
    account_name: string | null;
  }>;
  fiscal_year: number;
  fiscal_quarter: number;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatRole(role: string) {
  const map: Record<string, string> = {
    ae: "AE", commercial_ae: "Commercial AE", enterprise_ae: "Enterprise AE",
    pbm: "PBM", manager: "Manager", avp: "AVP", vp: "VP",
    cro: "CRO", c_level: "C-Level", revops_ro: "RevOps RO", revops_rw: "RevOps RW",
  };
  return map[role] || role;
}

function boardLabel(board: string) {
  const map: Record<string, string> = {
    revenue: "Closed-Won Deals",
    pipeline: "Deals Created",
    pilots: "Paid Pilots",
    activities: "Activities",
  };
  return map[board] || "Deals";
}

function periodLabel(period: string) {
  const map: Record<string, string> = {
    qtd: "QTD", ytd: "YTD", prev_qtd: "Previous Quarter", mtd: "MTD",
  };
  return map[period] || period.toUpperCase();
}

function KpiMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-base font-bold mt-0.5">{value}</div>
    </div>
  );
}

function DealsList({ data }: { data: UserDetail }) {
  const filteredDeals = data.deals
    .filter((d) => d.acv != null && d.acv > 0)
    .sort((a, b) => {
      const acvDiff = ((b.acv as number) || 0) - ((a.acv as number) || 0);
      if (acvDiff !== 0) return acvDiff;
      return (b.close_date || "").localeCompare(a.close_date || "");
    });

  return (
    <div>
      <h3 className="text-sm font-medium mb-3">
        {boardLabel(data.board)} — {periodLabel(data.period)} ({filteredDeals.length})
      </h3>
      {filteredDeals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No deals found</p>
      ) : (
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {filteredDeals.map((deal) => (
            <div key={deal.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{deal.account_name || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{deal.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-medium">{deal.acv ? formatCurrency(deal.acv) : "—"}</div>
                <Badge
                  variant={
                    deal.is_closed_won ? "default" :
                    deal.is_closed_lost ? "destructive" : "secondary"
                  }
                  className="text-[10px]"
                >
                  {deal.stage}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BOOKED_PILOT_STAGES = [
  "Stage 8-Closed Won: Finance", "Stage 7-Closed Won",
  "Stage 6-Closed-Won: Finance Approved", "Stage 5-Closed Won",
];

function PilotsList({ data }: { data: UserDetail }) {
  const booked = data.deals.filter(d => BOOKED_PILOT_STAGES.includes(d.stage));
  const open = data.deals.filter(d => !d.is_closed_won && !d.is_closed_lost);

  const renderSection = (title: string, deals: typeof data.deals) => (
    <div>
      <h3 className="text-sm font-medium mb-3">{title} ({deals.length})</h3>
      {deals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">None</p>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {deals
            .sort((a, b) => ((b.acv as number) || 0) - ((a.acv as number) || 0))
            .map((deal) => (
            <div key={deal.id} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{deal.account_name || "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{deal.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-medium">{deal.acv ? formatCurrency(deal.acv) : "—"}</div>
                <Badge variant="secondary" className="text-[10px]">{deal.stage}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      {renderSection("Booked Pilots", booked)}
      <Separator />
      {renderSection("Open Pilots", open)}
    </div>
  );
}

export function UserDetailDrawer({ userId, open, onClose, board, period, apiPrefix = "/api/leaderboard" }: UserDetailDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["user-leaderboard-detail", userId, board, period, apiPrefix],
    queryFn: () => {
      const params = new URLSearchParams();
      if (board) params.set("board", board);
      if (period) params.set("period", period);
      const qs = params.toString();
      return apiFetch<{ data: UserDetail }>(
        `${apiPrefix}/${userId}${qs ? `?${qs}` : ""}`
      ).then((res) => res.data);
    },
    enabled: !!userId && open,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="!w-[520px] !max-w-[90vw] overflow-y-auto">
        <SheetHeader className="border-b pb-4">
          {isLoading || !data ? (
            <>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32 mt-1" />
            </>
          ) : (
            <>
              <SheetTitle className="text-lg font-bold">
                {data.user.full_name}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{formatRole(data.user.role)}</Badge>
                {data.user.region && <Badge variant="secondary">{data.user.region}</Badge>}
                {data.user.manager_name && (
                  <span className="text-xs text-muted-foreground">
                    Manager: <span className="font-medium text-foreground">{data.user.manager_name}</span>
                  </span>
                )}
              </SheetDescription>
            </>
          )}
        </SheetHeader>

        {isLoading || !data ? (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="p-4 space-y-5">
            {/* KPIs */}
            <Card>
              <CardContent className="pt-3 pb-3">
                {data.board === "pilots" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <KpiMini label="Booked Pilots" value={data.kpis.booked_pilots ?? 0} />
                    <KpiMini label="Open Pilots" value={data.kpis.open_pilots ?? 0} />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <KpiMini label="ACV Closed QTD" value={formatCurrency(data.kpis.acv_closed_qtd)} />
                    <KpiMini label="ACV Closed YTD" value={formatCurrency(data.kpis.acv_closed_ytd)} />
                    <KpiMini label="Pipeline ACV" value={formatCurrency(data.kpis.pipeline_acv)} />
                    <KpiMini label="Deals Closed QTD" value={data.kpis.deals_closed_qtd} />
                    <KpiMini label="Deals Closed YTD" value={data.kpis.deals_closed_ytd} />
                    <KpiMini label="Open Deals" value={data.kpis.open_deals} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Context-filtered content */}
            {data.board === "pilots" ? (
              <PilotsList data={data} />
            ) : data.board === "activities" ? (
              <div>
                <h3 className="text-sm font-medium mb-3">
                  {boardLabel(data.board)} — {periodLabel(data.period)} ({data.activities.length})
                </h3>
                {data.activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No activities found</p>
                ) : (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {data.activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 py-1.5 px-2 rounded hover:bg-muted/30 text-sm">
                        <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">
                          {a.activity_type}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{a.subject || "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {a.account_name || "—"} · {a.activity_date}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <DealsList data={data} />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

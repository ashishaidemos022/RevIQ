"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartnerDetailDrawerProps {
  partnerId: string | null;
  open: boolean;
  onClose: () => void;
}

interface PartnerDetail {
  partner: {
    id: string;
    name: string;
    region: string | null;
    partner_subtype: string | null;
    pbm_name: string | null;
  };
  kpis: {
    acv_closed_qtd: number;
    acv_closed_ytd: number;
    deals_closed_qtd: number;
    deals_closed_ytd: number;
    pipeline_acv: number;
    open_deals: number;
    active_pilots: number;
  };
  quarterly_trend: Array<{ quarter: string; acv: number; deals: number }>;
  deals: Array<{
    id: string;
    name: string;
    account_name: string | null;
    ae_name: string | null;
    acv: number | null;
    close_date: string | null;
    stage: string;
    is_closed_won: boolean;
    is_closed_lost: boolean;
    is_paid_pilot: boolean;
    record_type_name: string | null;
    opportunity_source: string | null;
    rv_account_type: string | null;
    sf_created_date: string | null;
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

function KpiMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold mt-0.5">{value}</div>
    </div>
  );
}

type SortDir = "asc" | "desc";

function useDealSort(defaultKey = "close_date", defaultDir: SortDir = "desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggle = useCallback((key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const textCols = ["account_name", "name", "ae_name", "stage", "record_type_name", "opportunity_source"];
      setSortDir(textCols.includes(key) ? "asc" : "desc");
    }
  }, [sortKey]);

  return { sortKey, sortDir, toggle };
}

function DealSortHeader({
  label,
  colKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  colKey: string;
  currentKey: string;
  currentDir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right";
}) {
  const isActive = colKey === currentKey;
  return (
    <th
      className={cn(
        "py-2 px-2 cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
        align === "right" ? "text-right" : "text-left"
      )}
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {align === "right" && isActive && (
          currentDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        )}
        {align === "right" && !isActive && <ArrowUpDown className="h-3 w-3 opacity-30" />}
        {label}
        {align === "left" && isActive && (
          currentDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        )}
        {align === "left" && !isActive && <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  );
}

type Deal = PartnerDetail["deals"][number];

function getDealValue(deal: Deal, key: string): string | number {
  if (key === "account_name") return deal.account_name || "";
  if (key === "name") return deal.name;
  if (key === "ae_name") return deal.ae_name || "";
  if (key === "stage") return deal.stage;
  if (key === "acv") return deal.acv || 0;
  if (key === "close_date") return deal.close_date || "";
  if (key === "record_type_name") return deal.record_type_name || "";
  if (key === "opportunity_source") return deal.opportunity_source || "";
  return "";
}

function DealsTable({ deals }: { deals: Deal[] }) {
  const { sortKey, sortDir, toggle } = useDealSort("close_date", "desc");
  const hp = { currentKey: sortKey, currentDir: sortDir, onSort: toggle };

  const sorted = useMemo(() => {
    return [...deals].sort((a, b) => {
      const va = getDealValue(a, sortKey);
      const vb = getDealValue(b, sortKey);
      let cmp: number;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (va as number) - (vb as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [deals, sortKey, sortDir]);

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            Opportunities ({deals.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full min-w-[800px]">
            <thead className="sticky top-0 bg-background">
              <tr className="text-xs font-medium text-muted-foreground border-b">
                <DealSortHeader label="Account" colKey="account_name" {...hp} />
                <DealSortHeader label="Opportunity" colKey="name" {...hp} />
                <DealSortHeader label="AE" colKey="ae_name" {...hp} />
                <DealSortHeader label="Stage" colKey="stage" {...hp} />
                <DealSortHeader label="ACV" colKey="acv" {...hp} align="right" />
                <DealSortHeader label="Close Date" colKey="close_date" {...hp} />
                <DealSortHeader label="Type" colKey="record_type_name" {...hp} />
                <DealSortHeader label="Source" colKey="opportunity_source" {...hp} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((deal) => (
                <tr key={deal.id} className="text-sm border-b border-border/50 hover:bg-muted/30">
                  <td className="py-1.5 px-2 font-medium truncate max-w-[180px]">
                    {deal.account_name || "—"}
                  </td>
                  <td className="py-1.5 px-2 truncate max-w-[200px]">
                    {deal.name}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground truncate max-w-[140px]">
                    {deal.ae_name || "—"}
                  </td>
                  <td className="py-1.5 px-2">
                    <Badge
                      variant={
                        deal.is_closed_won
                          ? "default"
                          : deal.is_closed_lost
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {deal.stage}
                    </Badge>
                  </td>
                  <td className="py-1.5 px-2 text-right font-medium">
                    {deal.acv ? formatCurrency(deal.acv) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground">
                    {deal.close_date || "—"}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground text-xs">
                    {deal.record_type_name || "—"}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground text-xs truncate max-w-[120px]">
                    {deal.opportunity_source || "—"}
                  </td>
                </tr>
              ))}
              {deals.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No opportunities found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PartnerDetailDrawer({ partnerId, open, onClose }: PartnerDetailDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["partner-detail", partnerId],
    queryFn: () =>
      apiFetch<{ data: PartnerDetail }>(
        `/api/partner-leaderboard/${partnerId}`
      ).then((res) => res.data),
    enabled: !!partnerId && open,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        className="!w-[85vw] !max-w-none overflow-y-auto"
      >
        <SheetHeader className="border-b pb-4">
          {isLoading || !data ? (
            <>
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-40 mt-1" />
            </>
          ) : (
            <>
              <SheetTitle className="text-xl font-bold">
                {data.partner.name}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                {data.partner.region && (
                  <Badge variant="outline">{data.partner.region}</Badge>
                )}
                {data.partner.partner_subtype && (
                  <Badge variant="secondary">{data.partner.partner_subtype}</Badge>
                )}
                {data.partner.pbm_name && (
                  <span className="text-sm text-muted-foreground">
                    PBM: <span className="font-medium text-foreground">{data.partner.pbm_name}</span>
                  </span>
                )}
              </SheetDescription>
            </>
          )}
        </SheetHeader>

        {isLoading || !data ? (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {/* KPI Row */}
            <Card>
              <CardContent className="pt-4">
                <div className="grid grid-cols-3 sm:grid-cols-7 gap-4">
                  <KpiMini label="ACV Closed QTD" value={formatCurrency(data.kpis.acv_closed_qtd)} />
                  <KpiMini label="ACV Closed YTD" value={formatCurrency(data.kpis.acv_closed_ytd)} />
                  <KpiMini label="Deals Closed QTD" value={data.kpis.deals_closed_qtd} />
                  <KpiMini label="Deals Closed YTD" value={data.kpis.deals_closed_ytd} />
                  <KpiMini label="Pipeline ACV" value={formatCurrency(data.kpis.pipeline_acv)} />
                  <KpiMini label="Open Deals" value={data.kpis.open_deals} />
                  <KpiMini label="Active Pilots" value={data.kpis.active_pilots} />
                </div>
              </CardContent>
            </Card>

            {/* Trend Chart + Deals Table side by side on wide screens */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Quarterly Trend Chart */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    ACV Closed by Quarter — FY{data.fiscal_year}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.quarterly_trend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="quarter" className="text-xs" />
                      <YAxis
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        className="text-xs"
                      />
                      <Tooltip
                        formatter={(value) => [formatCurrency(value as number), "ACV"]}
                        contentStyle={{ fontSize: "12px" }}
                      />
                      <Bar dataKey="acv" fill="#7B3FA0" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Deals Table */}
              <DealsTable deals={data.deals} />
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

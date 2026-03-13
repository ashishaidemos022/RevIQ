"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getCurrentFiscalPeriod } from "@/lib/fiscal";
import { COMMISSION_RATE_WRITE_ROLES } from "@/lib/constants";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface CommissionRateRow {
  id: string;
  user_id: string | null;
  user_name: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  deal_type: string | null;
  rate: number;
  entered_by: string;
  updated_at: string;
}

export function CommissionRatesTab() {
  const user = useAuthStore((s) => s.user);
  const { fiscalYear } = getCurrentFiscalPeriod();
  const canWrite = user && COMMISSION_RATE_WRITE_ROLES.includes(user.role as typeof COMMISSION_RATE_WRITE_ROLES[number]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["commission-rates", fiscalYear],
    queryFn: () =>
      apiFetch<{ data: CommissionRateRow[] }>(
        `/api/commission-rates?fiscal_year=${fiscalYear}`
      ),
  });

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "user_name",
      header: "AE",
      render: (row) =>
        row.user_id ? (row.user_name as string) : <Badge variant="outline">All AEs (Default)</Badge>,
    },
    {
      key: "fiscal_quarter",
      header: "Quarter",
      render: (row) =>
        row.fiscal_quarter != null ? `Q${row.fiscal_quarter}` : "Full Year",
    },
    {
      key: "deal_type",
      header: "Deal Type",
      render: (row) =>
        row.deal_type
          ? (row.deal_type as string).replace("_", " ")
          : "All Types",
      className: "capitalize",
    },
    {
      key: "rate",
      header: "Rate",
      render: (row) => `${((row.rate as number) * 100).toFixed(1)}%`,
    },
    {
      key: "updated_at",
      header: "Last Updated",
      render: (row) => {
        const d = row.updated_at as string;
        return d ? new Date(d).toLocaleDateString() : "—";
      },
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load commission rates" onRetry={refetch} />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Commission Rates — FY{fiscalYear}</CardTitle>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                <p className="text-xs">
                  Rate precedence (most specific wins): AE + Quarter + Deal Type → AE + Quarter → AE + Year → Global default
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          {!canWrite && <Badge variant="secondary">Read Only</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          data={(data?.data || []) as unknown as Record<string, unknown>[]}
          columns={columns}
          pageSize={25}
          emptyMessage="No commission rates configured"
        />
      </CardContent>
    </Card>
  );
}

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getCurrentFiscalPeriod } from "@/lib/fiscal";
import { QUOTA_WRITE_ROLES } from "@/lib/constants";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface QuotaRow {
  user_id: string;
  full_name: string;
  region: string | null;
  revenue_annual: number | null;
  revenue_q1: number | null;
  revenue_q2: number | null;
  revenue_q3: number | null;
  revenue_q4: number | null;
}

export function QuotasTab() {
  const user = useAuthStore((s) => s.user);
  const { fiscalYear } = getCurrentFiscalPeriod();
  const canWrite = user && QUOTA_WRITE_ROLES.includes(user.role as typeof QUOTA_WRITE_ROLES[number]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["quotas-all", fiscalYear],
    queryFn: async () => {
      const [quotasRes, usersRes] = await Promise.all([
        apiFetch<{ data: Array<{ user_id: string; fiscal_quarter: number | null; quota_amount: number; quota_type: string }> }>(
          `/api/quotas?fiscal_year=${fiscalYear}&quota_type=revenue`
        ),
        apiFetch<{ data: Array<{ id: string; full_name: string; region: string | null; role: string }> }>(
          `/api/team`
        ).catch(() => ({ data: { data: { aes: [] } } })),
      ]);

      const quotas = quotasRes.data || [];
      const aes = (usersRes as { data: { data: { aes: Array<{ id: string; full_name: string; region: string | null }> } } }).data?.data?.aes || [];

      const rows: QuotaRow[] = aes.map((ae: { id: string; full_name: string; region: string | null }) => {
        const aeQuotas = quotas.filter(q => q.user_id === ae.id);
        return {
          user_id: ae.id,
          full_name: ae.full_name,
          region: ae.region,
          revenue_annual: aeQuotas.find(q => q.fiscal_quarter === null)?.quota_amount ?? null,
          revenue_q1: aeQuotas.find(q => q.fiscal_quarter === 1)?.quota_amount ?? null,
          revenue_q2: aeQuotas.find(q => q.fiscal_quarter === 2)?.quota_amount ?? null,
          revenue_q3: aeQuotas.find(q => q.fiscal_quarter === 3)?.quota_amount ?? null,
          revenue_q4: aeQuotas.find(q => q.fiscal_quarter === 4)?.quota_amount ?? null,
        };
      });

      return rows;
    },
  });

  const formatCurrency = (val: number | null) =>
    val != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(val)
      : "—";

  const columns: Column<Record<string, unknown>>[] = [
    { key: "full_name", header: "AE Name" },
    { key: "region", header: "Region", render: (row) => (row.region as string) || "—" },
    {
      key: "revenue_annual",
      header: `Annual FY${fiscalYear}`,
      render: (row) => formatCurrency(row.revenue_annual as number | null),
    },
    {
      key: "revenue_q1",
      header: "Q1",
      render: (row) => formatCurrency(row.revenue_q1 as number | null),
    },
    {
      key: "revenue_q2",
      header: "Q2",
      render: (row) => formatCurrency(row.revenue_q2 as number | null),
    },
    {
      key: "revenue_q3",
      header: "Q3",
      render: (row) => formatCurrency(row.revenue_q3 as number | null),
    },
    {
      key: "revenue_q4",
      header: "Q4",
      render: (row) => formatCurrency(row.revenue_q4 as number | null),
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load quotas" onRetry={refetch} />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Quotas — FY{fiscalYear}</CardTitle>
          {!canWrite && <Badge variant="secondary">Read Only</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          data={(data || []) as unknown as Record<string, unknown>[]}
          columns={columns}
          pageSize={25}
          emptyMessage="No quota data available"
        />
      </CardContent>
    </Card>
  );
}

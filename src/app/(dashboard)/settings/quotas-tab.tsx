"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getCurrentFiscalPeriod } from "@/lib/fiscal";
import { QUOTA_WRITE_ROLES } from "@/lib/constants";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useState, useRef } from "react";

interface QuotaRow {
  user_id: string;
  full_name: string;
  role: string;
  region: string | null;
  revenue_annual: number | null;
  revenue_q1: number | null;
  revenue_q2: number | null;
  revenue_q3: number | null;
  revenue_q4: number | null;
  commission_rate: number | null;
}

interface QuotaRecord {
  user_id: string;
  fiscal_quarter: number | null;
  quota_amount: number | string;
  quota_type: string;
  users: { id: string; full_name: string; email: string; role: string; region: string | null } | null;
}

interface CommissionRateRecord {
  user_id: string;
  rate: number | string;
}

interface UploadResult {
  success: boolean;
  fiscal_year: number;
  processed: number;
  quotas_upserted: number;
  commission_rates_upserted: number;
  skipped: string[];
  errors: string[];
}

export function QuotasTab() {
  const user = useAuthStore((s) => s.user);
  const { fiscalYear } = getCurrentFiscalPeriod();
  const canWrite = user && QUOTA_WRITE_ROLES.includes(user.role as typeof QUOTA_WRITE_ROLES[number]);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["quotas-all", fiscalYear],
    queryFn: async () => {
      const [quotasRes, ratesRes] = await Promise.all([
        apiFetch<{ data: QuotaRecord[] }>(
          `/api/quotas?fiscal_year=${fiscalYear}&quota_type=revenue`
        ),
        apiFetch<{ data: CommissionRateRecord[] }>(
          `/api/commission-rates?fiscal_year=${fiscalYear}`
        ).catch(() => ({ data: [] as CommissionRateRecord[] })),
      ]);

      const quotas = quotasRes.data || [];
      const rates = (ratesRes as { data: CommissionRateRecord[] }).data || [];

      // Build rows from quota data (includes all roles that have quotas)
      const userMap = new Map<string, QuotaRow>();

      for (const q of quotas) {
        const amount = typeof q.quota_amount === 'string' ? parseFloat(q.quota_amount) : q.quota_amount;
        if (!userMap.has(q.user_id)) {
          userMap.set(q.user_id, {
            user_id: q.user_id,
            full_name: q.users?.full_name || 'Unknown',
            role: q.users?.role || '',
            region: q.users?.region || null,
            revenue_annual: null,
            revenue_q1: null,
            revenue_q2: null,
            revenue_q3: null,
            revenue_q4: null,
            commission_rate: null,
          });
        }
        const row = userMap.get(q.user_id)!;
        if (q.fiscal_quarter === null) row.revenue_annual = amount;
        else if (q.fiscal_quarter === 1) row.revenue_q1 = amount;
        else if (q.fiscal_quarter === 2) row.revenue_q2 = amount;
        else if (q.fiscal_quarter === 3) row.revenue_q3 = amount;
        else if (q.fiscal_quarter === 4) row.revenue_q4 = amount;
      }

      // Attach commission rates
      for (const r of rates) {
        const row = userMap.get(r.user_id);
        if (row) {
          row.commission_rate = typeof r.rate === 'string' ? parseFloat(r.rate) : r.rate;
        }
      }

      return Array.from(userMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/quotas/upload', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setUploadResult({ success: false, fiscal_year: fiscalYear, processed: 0, quotas_upserted: 0, commission_rates_upserted: 0, skipped: [], errors: [json.error || 'Upload failed'] });
      } else {
        setUploadResult(json);
        queryClient.invalidateQueries({ queryKey: ["quotas-all"] });
      }
    } catch {
      setUploadResult({ success: false, fiscal_year: fiscalYear, processed: 0, quotas_upserted: 0, commission_rates_upserted: 0, skipped: [], errors: ['Network error'] });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatCurrency = (val: number | null) =>
    val != null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(val)
      : "—";

  const formatRate = (val: number | null) =>
    val != null ? `${(val * 100).toFixed(1)}%` : "—";

  const columns: Column<Record<string, unknown>>[] = [
    { key: "full_name", header: "Name" },
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
    {
      key: "commission_rate",
      header: "ICR",
      render: (row) => formatRate(row.commission_rate as number | null),
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load quotas" onRetry={refetch} />;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Quotas & Commission Rates — FY{fiscalYear}</CardTitle>
          <div className="flex items-center gap-2">
            {canWrite && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Uploading..." : "Upload File"}
                </Button>
              </>
            )}
            {!canWrite && <Badge variant="secondary">Read Only</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {uploadResult && (
          <div className={`mb-4 rounded-md border p-3 text-sm ${uploadResult.success ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'}`}>
            {uploadResult.success ? (
              <div className="space-y-1">
                <p className="font-medium text-green-800 dark:text-green-300">
                  Upload complete — {uploadResult.processed} users processed
                </p>
                <p className="text-green-700 dark:text-green-400">
                  {uploadResult.quotas_upserted} quota records, {uploadResult.commission_rates_upserted} commission rates
                </p>
                {uploadResult.skipped.length > 0 && (
                  <details className="text-amber-700 dark:text-amber-400">
                    <summary className="cursor-pointer">
                      {uploadResult.skipped.length} skipped
                    </summary>
                    <ul className="mt-1 ml-4 list-disc text-xs">
                      {uploadResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </details>
                )}
                {uploadResult.errors.length > 0 && (
                  <details className="text-red-700 dark:text-red-400">
                    <summary className="cursor-pointer">
                      {uploadResult.errors.length} errors
                    </summary>
                    <ul className="mt-1 ml-4 list-disc text-xs">
                      {uploadResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <p className="text-red-800 dark:text-red-300">
                Upload failed: {uploadResult.errors.join(', ')}
              </p>
            )}
            <button
              onClick={() => setUploadResult(null)}
              className="mt-2 text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}
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

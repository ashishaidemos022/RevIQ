"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

interface SyncLogEntry {
  id: string;
  sync_type: string;
  triggered_by: string | null;
  started_at: string;
  completed_at: string | null;
  status: string;
  records_synced: number | null;
  error_message: string | null;
}

export function SyncTab() {
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sync-log"],
    queryFn: () =>
      apiFetch<{ data: SyncLogEntry[] }>("/api/sync/log?limit=30"),
  });

  const syncMutation = useMutation({
    mutationFn: (type: string) => {
      setSyncing(type);
      return apiFetch(`/api/sync/${type}`, { method: "POST" });
    },
    onSuccess: () => {
      setSyncing(null);
      queryClient.invalidateQueries({ queryKey: ["sync-log"] });
    },
    onError: () => {
      setSyncing(null);
    },
  });

  const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    success: "default",
    running: "secondary",
    partial: "outline",
    failed: "destructive",
    warning: "outline",
  };

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "started_at",
      header: "Date/Time",
      render: (row) =>
        row.started_at ? new Date(row.started_at as string).toLocaleString() : "—",
    },
    {
      key: "sync_type",
      header: "Type",
      render: (row) => (
        <Badge variant="outline" className="uppercase text-xs">
          {row.sync_type as string}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <Badge variant={statusVariant[(row.status as string)] || "secondary"}>
          {row.status as string}
        </Badge>
      ),
    },
    {
      key: "records_synced",
      header: "Records",
      render: (row) =>
        row.records_synced != null ? (row.records_synced as number).toLocaleString() : "—",
    },
    {
      key: "error_message",
      header: "Error",
      render: (row) => {
        const msg = row.error_message as string | null;
        return msg ? (
          <span className="text-destructive text-xs truncate max-w-[200px] block">
            {msg}
          </span>
        ) : (
          "—"
        );
      },
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load sync history" onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Sync Controls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant="outline"
              disabled={!!syncing}
              onClick={() => syncMutation.mutate("salesforce")}
            >
              {syncing === "salesforce" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Salesforce
            </Button>
            <Button
              variant="outline"
              disabled={!!syncing}
              onClick={() => syncMutation.mutate("snowflake")}
            >
              {syncing === "snowflake" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Activities (Snowflake)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Sync History</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={(data?.data || []) as unknown as Record<string, unknown>[]}
            columns={columns}
            pageSize={15}
            emptyMessage="No sync events recorded"
          />
        </CardContent>
      </Card>
    </div>
  );
}

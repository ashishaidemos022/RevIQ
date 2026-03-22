"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";

interface AuditEntry {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface AuditResponse {
  data: AuditEntry[];
  total: number;
}

const EVENT_CATEGORIES = [
  { value: "all", label: "All Events" },
  { value: "quota", label: "Quota Changes" },
  { value: "commission_rate", label: "Commission Rate Changes" },
  { value: "override", label: "Permission Overrides" },
  { value: "sync", label: "Sync Events" },
  { value: "scim", label: "SCIM Provisioning" },
  { value: "view_as", label: "View-As Sessions" },
] as const;

const EVENT_TYPE_LABELS: Record<string, string> = {
  "quota.create": "Quota Created",
  "quota.update": "Quota Updated",
  "quota.upload": "Quotas Uploaded",
  "commission_rate.create": "Commission Rate Created",
  "commission_rate.update": "Commission Rate Updated",
  "commission_rate.upload": "Commission Rates Uploaded",
  "override.grant": "Override Granted",
  "override.revoke": "Override Revoked",
  "override.update": "Override Updated",
  "sync.trigger": "Sync Triggered",
  "sync.complete": "Sync Completed",
  "sync.failed": "Sync Failed",
  "scim.create": "User Provisioned",
  "scim.update": "User Updated",
  "scim.deactivate": "User Deactivated",
  "view_as.start": "View-As Started",
  "view_as.end": "View-As Ended",
};

const EVENT_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  quota: "default",
  commission_rate: "default",
  override: "secondary",
  sync: "outline",
  scim: "outline",
  view_as: "secondary",
};

function getEventCategory(eventType: string): string {
  return eventType.split(".")[0];
}

function formatEventType(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType] || eventType;
}

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const PAGE_SIZE = 50;

export function AuditLogTab() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  const { data, isLoading, error, refetch } = useQuery<AuditResponse>({
    queryKey: ["audit-log", filter, page],
    queryFn: () =>
      apiFetch(
        `/api/audit-log?event_type=${filter}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      ),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error)
    return (
      <ErrorState message="Failed to load audit log" onRetry={refetch} />
    );

  const entries = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Audit Log
            <span className="text-muted-foreground font-normal">
              (last 90 days)
            </span>
          </CardTitle>
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v || "all");
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState
            title="No audit events"
            description="No events found for the selected filter"
            icon={ClipboardList}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Event</th>
                    <th className="pb-2 pr-4 font-medium">Actor</th>
                    <th className="pb-2 pr-4 font-medium">Target</th>
                    <th className="pb-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const category = getEventCategory(entry.event_type);
                    return (
                      <tr
                        key={entry.id}
                        className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setDetailEntry(entry)}
                      >
                        <td className="py-2 pr-4 whitespace-nowrap text-xs text-muted-foreground">
                          {formatTimestamp(entry.created_at)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge
                            variant={
                              EVENT_BADGE_VARIANT[category] || "outline"
                            }
                            className="text-[10px]"
                          >
                            {formatEventType(entry.event_type)}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {entry.actor_email || "System"}
                        </td>
                        <td className="py-2 pr-4 text-xs">
                          {entry.target_label || entry.target_id || "—"}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground truncate max-w-[200px]">
                          {summarizeEntry(entry)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>
                  {page * PAGE_SIZE + 1}–
                  {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      <Dialog
        open={!!detailEntry}
        onOpenChange={(open) => !open && setDetailEntry(null)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {detailEntry && formatEventType(detailEntry.event_type)}
            </DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-3 text-sm">
              <Row label="Time" value={new Date(detailEntry.created_at).toLocaleString()} />
              <Row label="Actor" value={detailEntry.actor_email || "System"} />
              <Row
                label="Target"
                value={
                  detailEntry.target_label
                    ? `${detailEntry.target_label} (${detailEntry.target_type})`
                    : detailEntry.target_type || "—"
                }
              />
              {detailEntry.before_state && (
                <JsonBlock label="Before" data={detailEntry.before_state} />
              )}
              {detailEntry.after_state && (
                <JsonBlock label="After" data={detailEntry.after_state} />
              )}
              {detailEntry.metadata && (
                <JsonBlock label="Metadata" data={detailEntry.metadata} />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function JsonBlock({
  label,
  data,
}: {
  label: string;
  data: Record<string, unknown>;
}) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

function summarizeEntry(entry: AuditEntry): string {
  const { event_type, after_state, metadata } = entry;

  if (event_type === "quota.upload" && metadata) {
    return `${metadata.quotas_upserted || 0} quotas, ${metadata.commission_rates_upserted || 0} rates`;
  }
  if (event_type.startsWith("quota.") && after_state) {
    const q = after_state.quota_amount;
    const fq = after_state.fiscal_quarter;
    return fq ? `Q${fq}: $${Number(q).toLocaleString()}` : `Annual: $${Number(q).toLocaleString()}`;
  }
  if (event_type.startsWith("override.") && after_state) {
    return `Effective role: ${after_state.effective_role || "—"}`;
  }
  if (event_type.startsWith("sync.") && metadata) {
    return `${metadata.sync_type || ""} — ${metadata.records_synced || 0} records`;
  }
  if (event_type.startsWith("view_as.") && metadata) {
    return `Viewed as: ${metadata.viewed_as_name || metadata.viewed_as_email || "—"}`;
  }
  return "";
}

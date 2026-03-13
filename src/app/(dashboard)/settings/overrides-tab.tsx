"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, Plus } from "lucide-react";

interface OverrideRow {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  effective_role: string;
  allow_writes: boolean;
  granted_by_name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
}

export function OverridesTab() {
  const queryClient = useQueryClient();
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [formUserId, setFormUserId] = useState("");
  const [formEffectiveRole, setFormEffectiveRole] = useState("manager");
  const [formAllowWrites, setFormAllowWrites] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["permission-overrides"],
    queryFn: () => apiFetch<{ data: OverrideRow[] }>("/api/overrides"),
  });

  const grantMutation = useMutation({
    mutationFn: (payload: {
      user_id: string;
      effective_role: string;
      allow_writes: boolean;
      notes: string;
    }) =>
      apiFetch("/api/overrides", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-overrides"] });
      setShowGrantForm(false);
      resetForm();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (overrideId: string) =>
      apiFetch(`/api/overrides/${overrideId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permission-overrides"] });
    },
  });

  function resetForm() {
    setFormUserId("");
    setFormEffectiveRole("manager");
    setFormAllowWrites(false);
    setFormNotes("");
  }

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "user_name",
      header: "User",
      render: (row) => (
        <div>
          <span className="font-medium">{row.user_name as string}</span>
          <span className="text-xs text-muted-foreground ml-2">({row.user_role as string})</span>
        </div>
      ),
    },
    {
      key: "effective_role",
      header: "Effective Role",
      render: (row) => (
        <Badge variant="outline" className="capitalize">
          {row.effective_role as string}
        </Badge>
      ),
    },
    {
      key: "allow_writes",
      header: "Write Access",
      render: (row) =>
        row.allow_writes ? (
          <Badge variant="default">Yes</Badge>
        ) : (
          <Badge variant="secondary">Read Only</Badge>
        ),
    },
    {
      key: "granted_by_name",
      header: "Granted By",
      render: (row) => (row.granted_by_name as string) || "—",
    },
    {
      key: "created_at",
      header: "Granted On",
      render: (row) =>
        row.created_at ? new Date(row.created_at as string).toLocaleDateString() : "—",
    },
    {
      key: "notes",
      header: "Notes",
      render: (row) => (
        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
          {(row.notes as string) || "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      sortable: false,
      render: (row) =>
        row.is_active ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              revokeMutation.mutate(row.id as string);
            }}
          >
            Revoke
          </Button>
        ) : (
          <Badge variant="destructive" className="text-xs">Revoked</Badge>
        ),
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load permission overrides" onRetry={refetch} />;

  const activeOverrides = (data?.data || []).filter((o) => o.is_active);
  const revokedOverrides = (data?.data || []).filter((o) => !o.is_active);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Active Permission Overrides</CardTitle>
            <Dialog open={showGrantForm} onOpenChange={setShowGrantForm}>
              <DialogTrigger render={<Button size="sm" className="h-8" />}>
                  <Plus className="h-4 w-4 mr-1" />
                  Grant Override
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Grant Permission Override</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <label className="text-sm font-medium">User ID</label>
                    <Input
                      placeholder="Enter user ID"
                      value={formUserId}
                      onChange={(e) => setFormUserId(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Effective Role</label>
                    <Select value={formEffectiveRole} onValueChange={(v) => v && setFormEffectiveRole(v)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="avp">AVP</SelectItem>
                        <SelectItem value="vp">VP</SelectItem>
                        <SelectItem value="cro">CRO</SelectItem>
                        <SelectItem value="c_level">C-Level</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allow-writes"
                      checked={formAllowWrites}
                      onChange={(e) => setFormAllowWrites(e.target.checked)}
                    />
                    <label htmlFor="allow-writes" className="text-sm">
                      Allow Write Access
                    </label>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Notes (required)</label>
                    <Input
                      placeholder="Reason for grant..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!formUserId || !formNotes}
                    onClick={() =>
                      grantMutation.mutate({
                        user_id: formUserId,
                        effective_role: formEffectiveRole,
                        allow_writes: formAllowWrites,
                        notes: formNotes,
                      })
                    }
                  >
                    Grant Override
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {activeOverrides.length === 0 ? (
            <EmptyState
              title="No active overrides"
              description="No permission overrides are currently active"
              icon={Shield}
            />
          ) : (
            <DataTable
              data={activeOverrides as unknown as Record<string, unknown>[]}
              columns={columns}
              pageSize={25}
            />
          )}
        </CardContent>
      </Card>

      {revokedOverrides.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Audit Log — Revoked Overrides (Last 90 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={revokedOverrides as unknown as Record<string, unknown>[]}
              columns={columns}
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

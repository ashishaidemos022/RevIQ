"use client";

import { useState, useCallback } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, Plus, X, Search } from "lucide-react";

interface OverrideRow {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  effective_role: string | null;
  reference_user_ids: string[] | null;
  reference_user_names: string[];
  allow_writes: boolean;
  granted_by_name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
}

interface UserSearchResult {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  region: string | null;
}

function UserSearchInput({
  label,
  placeholder,
  selected,
  onSelect,
  onClear,
  excludeIds,
}: {
  label: string;
  placeholder: string;
  selected: UserSearchResult | null;
  onSelect: (user: UserSearchResult) => void;
  onClear: () => void;
  excludeIds?: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data: results } = useQuery({
    queryKey: ["user-search", query],
    queryFn: () =>
      apiFetch<{ data: UserSearchResult[] }>(
        `/api/users/search?q=${encodeURIComponent(query)}`
      ),
    enabled: query.length >= 2,
  });

  const filtered = (results?.data || []).filter(
    (u) => !(excludeIds || []).includes(u.user_id)
  );

  if (selected) {
    return (
      <div>
        <label className="text-sm font-medium">{label}</label>
        <div className="flex items-center gap-2 mt-1 px-3 py-2 border rounded-md bg-muted/30">
          <span className="text-sm font-medium flex-1">{selected.full_name}</span>
          <span className="text-xs text-muted-foreground">{selected.role}</span>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onClear}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative mt-1">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          className="pl-8"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {filtered.map((u) => (
            <button
              key={u.user_id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(u);
                setQuery("");
                setOpen(false);
              }}
            >
              <span className="font-medium">{u.full_name}</span>
              <span className="text-xs text-muted-foreground">{u.role}{u.region ? ` · ${u.region}` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferenceUserPicker({
  selected,
  onAdd,
  onRemove,
  excludeIds,
}: {
  selected: UserSearchResult[];
  onAdd: (user: UserSearchResult) => void;
  onRemove: (userId: string) => void;
  excludeIds?: string[];
}) {
  const allExcluded = [
    ...(excludeIds || []),
    ...selected.map((u) => u.user_id),
  ];

  return (
    <div>
      <label className="text-sm font-medium">
        Give same access as (1-3 people)
      </label>
      <div className="space-y-2 mt-1">
        {selected.map((u) => (
          <div
            key={u.user_id}
            className="flex items-center gap-2 px-3 py-1.5 border rounded-md bg-muted/30"
          >
            <span className="text-sm font-medium flex-1">{u.full_name}</span>
            <span className="text-xs text-muted-foreground">{u.role}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => onRemove(u.user_id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {selected.length < 3 && (
          <UserSearchInput
            label=""
            placeholder="Search by name..."
            selected={null}
            onSelect={onAdd}
            onClear={() => {}}
            excludeIds={allExcluded}
          />
        )}
      </div>
    </div>
  );
}

export function OverridesTab() {
  const queryClient = useQueryClient();
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [grantee, setGrantee] = useState<UserSearchResult | null>(null);
  const [referenceUsers, setReferenceUsers] = useState<UserSearchResult[]>([]);
  const [formAllowWrites, setFormAllowWrites] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["permission-overrides"],
    queryFn: () => apiFetch<{ data: OverrideRow[] }>("/api/overrides"),
  });

  const grantMutation = useMutation({
    mutationFn: (payload: {
      user_id: string;
      reference_user_ids: string[];
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
    setGrantee(null);
    setReferenceUsers([]);
    setFormAllowWrites(false);
    setFormNotes("");
  }

  const handleAddRef = useCallback((user: UserSearchResult) => {
    setReferenceUsers((prev) => {
      if (prev.length >= 3) return prev;
      if (prev.some((u) => u.user_id === user.user_id)) return prev;
      return [...prev, user];
    });
  }, []);

  const handleRemoveRef = useCallback((userId: string) => {
    setReferenceUsers((prev) => prev.filter((u) => u.user_id !== userId));
  }, []);

  const columns: Column<Record<string, unknown>>[] = [
    {
      key: "user_name",
      header: "User",
      render: (row) => (
        <div>
          <span className="font-medium">{row.user_name as string}</span>
          <span className="text-xs text-muted-foreground ml-2">
            ({row.user_role as string})
          </span>
        </div>
      ),
    },
    {
      key: "access_scope",
      header: "Same Access As",
      render: (row) => {
        const names = row.reference_user_names as string[] | undefined;
        if (names && names.length > 0) {
          return (
            <div className="flex flex-wrap gap-1">
              {names.map((name, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          );
        }
        // Legacy: show effective_role
        const role = row.effective_role as string | null;
        return role ? (
          <Badge variant="outline" className="capitalize text-xs">
            {role}
          </Badge>
        ) : (
          "—"
        );
      },
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
        row.created_at
          ? new Date(row.created_at as string).toLocaleDateString()
          : "—",
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
          <Badge variant="destructive" className="text-xs">
            Revoked
          </Badge>
        ),
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error)
    return (
      <ErrorState
        message="Failed to load permission overrides"
        onRetry={refetch}
      />
    );

  const activeOverrides = (data?.data || []).filter((o) => o.is_active);
  const revokedOverrides = (data?.data || []).filter((o) => !o.is_active);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Active Permission Overrides
            </CardTitle>
            <Dialog
              open={showGrantForm}
              onOpenChange={(open) => {
                setShowGrantForm(open);
                if (!open) resetForm();
              }}
            >
              <DialogTrigger render={<Button size="sm" className="h-8" />}>
                <Plus className="h-4 w-4 mr-1" />
                Grant Override
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Grant Permission Override</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <UserSearchInput
                    label="Grant access to"
                    placeholder="Search user by name..."
                    selected={grantee}
                    onSelect={setGrantee}
                    onClear={() => setGrantee(null)}
                  />

                  <ReferenceUserPicker
                    selected={referenceUsers}
                    onAdd={handleAddRef}
                    onRemove={handleRemoveRef}
                    excludeIds={grantee ? [grantee.user_id] : []}
                  />

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
                    <label className="text-sm font-medium">
                      Notes (required)
                    </label>
                    <Input
                      placeholder="Reason for grant..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <Button
                    className="w-full"
                    disabled={
                      !grantee ||
                      referenceUsers.length === 0 ||
                      !formNotes ||
                      grantMutation.isPending
                    }
                    onClick={() =>
                      grantMutation.mutate({
                        user_id: grantee!.user_id,
                        reference_user_ids: referenceUsers.map(
                          (u) => u.user_id
                        ),
                        allow_writes: formAllowWrites,
                        notes: formNotes,
                      })
                    }
                  >
                    {grantMutation.isPending ? "Granting..." : "Grant Override"}
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

"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, Column } from "@/components/dashboard/data-table";
import { DashboardSkeleton } from "@/components/dashboard/loading-skeleton";
import { ErrorState } from "@/components/dashboard/error-state";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Users, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HierarchyUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  region: string | null;
  is_active: boolean;
  manager_name: string | null;
  manager_id: string | null;
  direct_report_count: number;
  has_override: boolean;
  effective_role: string | null;
}

interface HierarchyDebugRow {
  id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  manager_name: string | null;
  manager_email: string | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
}

// Tree node component
function TreeNode({
  user,
  children,
  level,
  expanded,
  onToggle,
  searchTerm,
}: {
  user: HierarchyUser;
  children: HierarchyUser[];
  level: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  searchTerm: string;
}) {
  const isExpanded = expanded.has(user.id);
  const hasChildren = children.length > 0;
  const isHighlighted =
    searchTerm &&
    (user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()));

  const roleBadgeColor: Record<string, string> = {
    cro: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    c_level: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    leader: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 text-sm cursor-pointer",
          isHighlighted && "bg-yellow-100 dark:bg-yellow-900/30"
        )}
        style={{ paddingLeft: `${level * 24 + 8}px` }}
        onClick={() => hasChildren && onToggle(user.id)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0" />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="font-medium">{user.full_name}</span>
        <Badge variant="outline" className={cn("text-xs", roleBadgeColor[user.role])}>
          {user.role}
        </Badge>
        {user.region && (
          <span className="text-xs text-muted-foreground">{user.region}</span>
        )}
        {hasChildren && (
          <span className="text-xs text-muted-foreground">
            ({children.length} report{children.length !== 1 ? "s" : ""})
          </span>
        )}
        {user.has_override && (
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            Override: {user.effective_role}
          </Badge>
        )}
        {!user.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
      </div>
    </div>
  );
}

export function HierarchyTab() {
  const user = useAuthStore((s) => s.user);
  const canDebug = ["revops_rw", "c_level"].includes(user?.role || "");
  const [searchTerm, setSearchTerm] = useState("");
  const [debugFilter, setDebugFilter] = useState("all");

  const { data: hierarchyData, isLoading, error, refetch } = useQuery({
    queryKey: ["hierarchy"],
    queryFn: () => apiFetch<{ data: HierarchyUser[] }>("/api/hierarchy"),
  });

  const { data: debugData, isLoading: debugLoading } = useQuery({
    queryKey: ["hierarchy-debug", debugFilter],
    queryFn: () =>
      apiFetch<{ data: HierarchyDebugRow[] }>(
        `/api/hierarchy/debug?filter=${debugFilter}`
      ),
    enabled: canDebug,
  });

  const users = hierarchyData?.data || [];

  // Build tree from flat list
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Get children for a user
  const getChildren = (parentId: string) =>
    users.filter((u) => u.manager_id === parentId);

  // Get root nodes (no manager)
  const rootNodes = users.filter((u) => !u.manager_id);

  // Render tree recursively
  function renderTree(node: HierarchyUser, level: number): React.ReactNode {
    const children = getChildren(node.id);
    const isExpanded = expanded.has(node.id);
    return (
      <div key={node.id}>
        <TreeNode
          user={node}
          children={children}
          level={level}
          expanded={expanded}
          onToggle={toggleExpand}
          searchTerm={searchTerm}
        />
        {isExpanded &&
          children.map((child) => renderTree(child, level + 1))}
      </div>
    );
  }

  // Tabular view columns
  const tabularColumns: Column<Record<string, unknown>>[] = [
    { key: "full_name", header: "Name" },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Role",
      render: (row) => <Badge variant="outline" className="capitalize">{row.role as string}</Badge>,
    },
    {
      key: "manager_name",
      header: "Manager",
      render: (row) => (row.manager_name as string) || "—",
    },
    {
      key: "region",
      header: "Region",
      render: (row) => (row.region as string) || "—",
    },
    {
      key: "direct_report_count",
      header: "Reports",
      render: (row) => row.direct_report_count as number,
    },
    {
      key: "has_override",
      header: "Override",
      render: (row) =>
        row.has_override ? (
          <Badge variant="outline" className="text-xs">
            {row.effective_role as string}
          </Badge>
        ) : null,
    },
    {
      key: "is_active",
      header: "Status",
      render: (row) =>
        row.is_active ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="destructive">Inactive</Badge>
        ),
    },
  ];

  // Debug view columns
  const debugColumns: Column<Record<string, unknown>>[] = [
    { key: "user_name", header: "User" },
    {
      key: "user_role",
      header: "Role",
      render: (row) => <Badge variant="outline" className="capitalize">{row.user_role as string}</Badge>,
    },
    { key: "manager_name", header: "Manager", render: (row) => (row.manager_name as string) || "—" },
    { key: "effective_from", header: "From" },
    { key: "effective_to", header: "To", render: (row) => (row.effective_to as string) || "Active" },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const status = row.status as string;
        if (status === "Orphan") return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Orphan</Badge>;
        if (status === "Active") return <Badge variant="secondary">Active</Badge>;
        return <Badge variant="outline">{status}</Badge>;
      },
    },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Failed to load hierarchy" onRetry={refetch} />;

  return (
    <Tabs defaultValue="tree">
      <TabsList>
        <TabsTrigger value="tree">Org Tree</TabsTrigger>
        <TabsTrigger value="tabular">Tabular</TabsTrigger>
        {canDebug && <TabsTrigger value="debug">Debug</TabsTrigger>}
      </TabsList>

      <TabsContent value="tree" className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-4">
              <CardTitle className="text-sm font-medium">Organization Tree</CardTitle>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {rootNodes.length === 0 ? (
              <EmptyState
                title="No hierarchy data"
                description="No users found in the organization hierarchy"
                icon={Users}
              />
            ) : (
              <div className="space-y-0.5">
                {rootNodes.map((node) => renderTree(node, 0))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="tabular" className="mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">User Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              data={users as unknown as Record<string, unknown>[]}
              columns={tabularColumns}
              pageSize={25}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {canDebug && (
        <TabsContent value="debug" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Debug View — Raw Hierarchy Records</CardTitle>
                <Select value={debugFilter} onValueChange={(v) => v && setDebugFilter(v)}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="historical">Historical Only</SelectItem>
                    <SelectItem value="orphans">Orphans Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {debugLoading ? (
                <DashboardSkeleton />
              ) : (
                <DataTable
                  data={(debugData?.data || []) as unknown as Record<string, unknown>[]}
                  columns={debugColumns}
                  pageSize={25}
                  emptyMessage="No records found"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}

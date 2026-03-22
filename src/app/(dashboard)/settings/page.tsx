"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuotasTab } from "./quotas-tab";
import { HierarchyTab } from "./hierarchy-tab";
import { OverridesTab } from "./overrides-tab";
import { AuditLogTab } from "./audit-log-tab";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const viewAsUser = useAuthStore((s) => s.viewAsUser);
  const role = viewAsUser?.role ?? user?.role ?? "ae";

  const isRevopsRW = role === "revops_rw";
  const isEnterpriseRO = role === "enterprise_ro";

  // Only revops_rw sees Quotas, Commission Rates, Hierarchy, and Permission Overrides
  // enterprise_ro sees Hierarchy only
  const canViewQuotas = isRevopsRW;
  const canViewHierarchy = isRevopsRW || isEnterpriseRO;
  const canViewOverrides = isRevopsRW;
  const canViewAuditLog = isRevopsRW || isEnterpriseRO;

  const defaultTab = canViewQuotas ? "quotas" : "hierarchy";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canViewQuotas && <TabsTrigger value="quotas">Quotas</TabsTrigger>}
          {canViewHierarchy && <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>}
          {canViewOverrides && <TabsTrigger value="overrides">Permission Overrides</TabsTrigger>}
          {canViewAuditLog && <TabsTrigger value="audit-log">Audit Log</TabsTrigger>}
        </TabsList>

        {canViewQuotas && (
          <TabsContent value="quotas" className="mt-4">
            <QuotasTab />
          </TabsContent>
        )}
        {canViewHierarchy && (
          <TabsContent value="hierarchy" className="mt-4">
            <HierarchyTab />
          </TabsContent>
        )}
        {canViewOverrides && (
          <TabsContent value="overrides" className="mt-4">
            <OverridesTab />
          </TabsContent>
        )}
        {canViewAuditLog && (
          <TabsContent value="audit-log" className="mt-4">
            <AuditLogTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

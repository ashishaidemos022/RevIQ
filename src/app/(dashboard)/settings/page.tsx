"use client";

import { useAuthStore } from "@/stores/auth-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QUOTA_WRITE_ROLES, COMMISSION_RATE_WRITE_ROLES, SYNC_ROLES, MANAGER_PLUS_ROLES, FULL_ACCESS_ROLES } from "@/lib/constants";
import { QuotasTab } from "./quotas-tab";
import { CommissionRatesTab } from "./commission-rates-tab";
import { SyncTab } from "./sync-tab";
import { HierarchyTab } from "./hierarchy-tab";
import { OverridesTab } from "./overrides-tab";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const role = user?.role || "ae";

  const canViewQuotas = [...QUOTA_WRITE_ROLES, "revops_ro", "enterprise_ro"].includes(role);
  const canViewCommissionRates = [...COMMISSION_RATE_WRITE_ROLES, "revops_ro", "enterprise_ro", "vp"].includes(role);
  const canViewSync = SYNC_ROLES.includes(role as typeof SYNC_ROLES[number]);
  const canViewHierarchy = [...MANAGER_PLUS_ROLES, "revops_ro", "enterprise_ro"].includes(role);
  const canViewOverrides = ["cro", "c_level", "revops_rw"].includes(role);

  const defaultTab = canViewQuotas ? "quotas" : canViewSync ? "sync" : "hierarchy";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {canViewQuotas && <TabsTrigger value="quotas">Quotas</TabsTrigger>}
          {canViewCommissionRates && <TabsTrigger value="commission-rates">Commission Rates</TabsTrigger>}
          {canViewSync && <TabsTrigger value="sync">Sync</TabsTrigger>}
          {canViewHierarchy && <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>}
          {canViewOverrides && <TabsTrigger value="overrides">Permission Overrides</TabsTrigger>}
        </TabsList>

        {canViewQuotas && (
          <TabsContent value="quotas" className="mt-4">
            <QuotasTab />
          </TabsContent>
        )}
        {canViewCommissionRates && (
          <TabsContent value="commission-rates" className="mt-4">
            <CommissionRatesTab />
          </TabsContent>
        )}
        {canViewSync && (
          <TabsContent value="sync" className="mt-4">
            <SyncTab />
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
      </Tabs>
    </div>
  );
}

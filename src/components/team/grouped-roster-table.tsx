"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface AeData {
  id: string;
  full_name: string;
  email: string;
  role: string;
  region: string | null;
  acv_closed_qtd: number;
  acv_closed_ytd: number;
  annual_quota: number;
  quarterly_quota: number;
  attainment: number;
  attainment_qtd: number;
  active_pilots: number;
  activities_qtd: number;
  commission_qtd: number;
}

interface ManagerGroup {
  managerId: string | null;
  managerName: string;
  managerRole: string;
  memberIds: string[];
  memberCount: number;
  summary: {
    acvClosedQTD: number;
    acvClosedYTD: number;
    avgAttainmentQTD: number;
    avgAttainmentYTD: number;
    activePilots: number;
    activitiesQTD: number;
    commissionQTD: number;
  };
}

type SelectionMode = "none" | "individual" | "team";

interface GroupedRosterTableProps {
  aes: AeData[];
  managerGroups: ManagerGroup[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
  maxSelections?: number;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const formatRole = (role: string) => {
  const map: Record<string, string> = {
    other: "Other",
    commercial_ae: "Commercial AE",
    enterprise_ae: "Enterprise AE",
    pbm: "PBM",
    leader: "Leader",
  };
  return map[role] || role;
};

const renderAttainment = (val: number) => (
  <span
    className={cn(
      "font-medium",
      val >= 75
        ? "text-green-600"
        : val >= 50
          ? "text-amber-600"
          : val > 0
            ? "text-red-600"
            : "text-muted-foreground"
    )}
  >
    {val > 0 ? `${val.toFixed(1)}%` : "—"}
  </span>
);

export function GroupedRosterTable({
  aes,
  managerGroups,
  selectedIds,
  onSelectionChange,
  selectionMode,
  onSelectionModeChange,
  maxSelections = 4,
}: GroupedRosterTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const aeMap = new Map(aes.map((ae) => [ae.id, ae]));
  const atMax = selectedIds.size >= maxSelections;

  const toggleGroup = (managerId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(managerId)) next.delete(managerId);
    else next.add(managerId);
    setExpandedGroups(next);
  };

  const handleTeamSelect = (managerId: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(managerId);
      onSelectionModeChange("team");
    } else {
      next.delete(managerId);
      if (next.size === 0) onSelectionModeChange("none");
    }
    onSelectionChange(next);
  };

  const handleIndividualSelect = (aeId: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(aeId);
      onSelectionModeChange("individual");
    } else {
      next.delete(aeId);
      if (next.size === 0) onSelectionModeChange("none");
    }
    onSelectionChange(next);
  };

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead className="w-10" />
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Region</TableHead>
            <TableHead className="text-right">ACV Closed QTD</TableHead>
            <TableHead className="text-right">ACV Closed YTD</TableHead>
            <TableHead className="text-right">Attainment QTD</TableHead>
            <TableHead className="text-right">Attainment YTD</TableHead>
            <TableHead className="text-right">Pilots</TableHead>
            <TableHead className="text-right">Activities</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {managerGroups.map((group) => {
            const groupKey = group.managerId ?? "__unassigned__";
            const isExpanded = expandedGroups.has(groupKey);
            const isTeamSelected = selectedIds.has(groupKey);
            const teamDisabled =
              (selectionMode === "individual") ||
              (atMax && !isTeamSelected);
            const individualDisabled = selectionMode === "team";

            const members = group.memberIds
              .map((id) => aeMap.get(id))
              .filter(Boolean) as AeData[];

            return (
              <GroupSection
                key={groupKey}
                group={group}
                groupKey={groupKey}
                members={members}
                isExpanded={isExpanded}
                isTeamSelected={isTeamSelected}
                teamDisabled={teamDisabled}
                individualDisabled={individualDisabled}
                selectedIds={selectedIds}
                atMax={atMax}
                onToggle={() => toggleGroup(groupKey)}
                onTeamSelect={(checked) => handleTeamSelect(groupKey, checked)}
                onIndividualSelect={handleIndividualSelect}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface GroupSectionProps {
  group: ManagerGroup;
  groupKey: string;
  members: AeData[];
  isExpanded: boolean;
  isTeamSelected: boolean;
  teamDisabled: boolean;
  individualDisabled: boolean;
  selectedIds: Set<string>;
  atMax: boolean;
  onToggle: () => void;
  onTeamSelect: (checked: boolean) => void;
  onIndividualSelect: (aeId: string, checked: boolean) => void;
}

function GroupSection({
  group,
  groupKey,
  members,
  isExpanded,
  isTeamSelected,
  teamDisabled,
  individualDisabled,
  selectedIds,
  atMax,
  onToggle,
  onTeamSelect,
  onIndividualSelect,
}: GroupSectionProps) {
  const s = group.summary;

  return (
    <>
      {/* Manager group header row */}
      <TableRow
        className={cn(
          "bg-muted/50 hover:bg-muted/70 cursor-pointer font-medium",
          isTeamSelected && "bg-primary/10 hover:bg-primary/15"
        )}
        onClick={onToggle}
      >
        <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isTeamSelected}
            disabled={teamDisabled}
            onCheckedChange={onTeamSelect}
          />
        </TableCell>
        <TableCell className="w-10">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{group.managerName}</span>
            <Badge variant="secondary" className="text-[10px]">
              {group.memberCount} {group.memberCount === 1 ? "rep" : "reps"}
            </Badge>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-[10px]">
            {formatRole(group.managerRole)}
          </Badge>
        </TableCell>
        <TableCell />
        <TableCell className="text-right font-semibold">{formatCurrency(s.acvClosedQTD)}</TableCell>
        <TableCell className="text-right font-semibold">{formatCurrency(s.acvClosedYTD)}</TableCell>
        <TableCell className="text-right">{renderAttainment(s.avgAttainmentQTD)}</TableCell>
        <TableCell className="text-right">{renderAttainment(s.avgAttainmentYTD)}</TableCell>
        <TableCell className="text-right font-semibold">{s.activePilots}</TableCell>
        <TableCell className="text-right font-semibold">{s.activitiesQTD.toLocaleString()}</TableCell>
      </TableRow>

      {/* Individual AE rows (when expanded) */}
      {isExpanded &&
        members.map((ae) => {
          const isSelected = selectedIds.has(ae.id);
          const disabled = individualDisabled || (atMax && !isSelected);
          return (
            <TableRow
              key={ae.id}
              className={cn(
                "bg-background",
                isSelected && "bg-primary/5"
              )}
            >
              <TableCell className="w-10">
                <Checkbox
                  checked={isSelected}
                  disabled={disabled}
                  onCheckedChange={(checked) => onIndividualSelect(ae.id, checked)}
                />
              </TableCell>
              <TableCell />
              <TableCell className="pl-10">{ae.full_name}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">
                  {formatRole(ae.role)}
                </Badge>
              </TableCell>
              <TableCell>{ae.region || "—"}</TableCell>
              <TableCell className="text-right">{formatCurrency(ae.acv_closed_qtd)}</TableCell>
              <TableCell className="text-right">{formatCurrency(ae.acv_closed_ytd)}</TableCell>
              <TableCell className="text-right">{renderAttainment(ae.attainment_qtd)}</TableCell>
              <TableCell className="text-right">{renderAttainment(ae.attainment)}</TableCell>
              <TableCell className="text-right">{ae.active_pilots}</TableCell>
              <TableCell className="text-right">{ae.activities_qtd.toLocaleString()}</TableCell>
            </TableRow>
          );
        })}
    </>
  );
}

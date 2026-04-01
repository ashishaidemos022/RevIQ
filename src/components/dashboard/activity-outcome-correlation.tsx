"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import { MANAGER_PLUS_ROLES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";
import { Activity, Target } from "lucide-react";

// ─── Types ──────────────────────────────────────────────

interface TeamAE {
  id: string;
  full_name: string;
  region: string | null;
  acv_closed_qtd: number;
  acv_closed_ytd: number;
  activities_qtd: number;
  attainment_qtd: number;
}

interface TeamResponse {
  data: {
    aes: TeamAE[];
  };
}

interface PlotPoint {
  name: string;
  activities: number;
  acv: number;
  attainment: number;
  region: string;
  isMock: boolean;
}

// ─── Mock data for when real data is sparse ─────────────

const MOCK_AES: PlotPoint[] = [
  { name: "Alex Rivera", activities: 142, acv: 385000, attainment: 78, region: "AMER", isMock: true },
  { name: "Jordan Lee", activities: 89, acv: 520000, attainment: 105, region: "AMER", isMock: true },
  { name: "Casey Patel", activities: 203, acv: 195000, attainment: 39, region: "EMEA", isMock: true },
  { name: "Morgan Chen", activities: 167, acv: 680000, attainment: 138, region: "APAC", isMock: true },
  { name: "Sam Okafor", activities: 56, acv: 290000, attainment: 59, region: "AMER", isMock: true },
  { name: "Dana Kim", activities: 178, acv: 445000, attainment: 90, region: "EMEA", isMock: true },
  { name: "Taylor Brooks", activities: 31, acv: 125000, attainment: 25, region: "AMER", isMock: true },
  { name: "Jamie Walsh", activities: 115, acv: 610000, attainment: 124, region: "APAC", isMock: true },
  { name: "Reese Martinez", activities: 221, acv: 310000, attainment: 63, region: "EMEA", isMock: true },
  { name: "Quinn Foster", activities: 98, acv: 475000, attainment: 96, region: "AMER", isMock: true },
  { name: "Drew Nguyen", activities: 145, acv: 550000, attainment: 112, region: "APAC", isMock: true },
  { name: "Avery Singh", activities: 72, acv: 88000, attainment: 18, region: "EMEA", isMock: true },
  { name: "Riley Thompson", activities: 188, acv: 720000, attainment: 146, region: "AMER", isMock: true },
  { name: "Kai Yamamoto", activities: 44, acv: 410000, attainment: 83, region: "APAC", isMock: true },
  { name: "Harper Williams", activities: 160, acv: 265000, attainment: 54, region: "AMER", isMock: true },
];

// ─── Helpers ────────────────────────────────────────────

const fmtCurrency = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(val);

const shortCurrency = (val: number) =>
  val >= 1_000_000
    ? `$${(val / 1_000_000).toFixed(1)}M`
    : val >= 1_000
      ? `$${(val / 1_000).toFixed(0)}K`
      : `$${val.toFixed(0)}`;

const REGION_COLORS: Record<string, string> = {
  AMER: "#7c3aed",
  EMEA: "#14b8a6",
  APAC: "#f59e0b",
  Unknown: "#94a3b8",
};

function getQuadrant(
  activities: number,
  acv: number,
  medianActivities: number,
  medianAcv: number
): { label: string; color: string } {
  const highActivity = activities >= medianActivities;
  const highAcv = acv >= medianAcv;

  if (highActivity && highAcv) return { label: "Stars", color: "text-green-600 dark:text-green-400" };
  if (!highActivity && highAcv) return { label: "Efficient Closers", color: "text-blue-600 dark:text-blue-400" };
  if (highActivity && !highAcv) return { label: "High Effort, Low Return", color: "text-amber-600 dark:text-amber-400" };
  return { label: "Needs Attention", color: "text-red-600 dark:text-red-400" };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Simple correlation coefficient
function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0, denomX = 0, denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

// ─── Custom Tooltip ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as PlotPoint;
  if (!d) return null;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md text-sm">
      <p className="font-semibold">
        {d.name}
        {d.isMock && <span className="text-muted-foreground text-[10px] ml-1">(sample)</span>}
      </p>
      <div className="mt-1.5 space-y-0.5 text-xs">
        <p><span className="text-muted-foreground">Activities:</span> <span className="font-medium">{d.activities}</span></p>
        <p><span className="text-muted-foreground">ACV Closed:</span> <span className="font-medium">{fmtCurrency(d.acv)}</span></p>
        <p><span className="text-muted-foreground">Attainment:</span> <span className="font-medium">{d.attainment.toFixed(0)}%</span></p>
        <p><span className="text-muted-foreground">Region:</span> <span className="font-medium">{d.region}</span></p>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────

export function ActivityOutcomeCorrelation() {
  const user = useAuthStore((s) => s.user);
  const isManager = user && MANAGER_PLUS_ROLES.includes(user.role as typeof MANAGER_PLUS_ROLES[number]);

  const { data: teamData, isLoading } = useQuery<TeamResponse>({
    queryKey: ["activity-correlation-team"],
    queryFn: () => apiFetch("/api/team"),
    enabled: !!isManager,
  });

  const { points, usedMock } = useMemo(() => {
    const realPoints: PlotPoint[] = (teamData?.data?.aes || [])
      .filter((ae) => ae.activities_qtd > 0 || ae.acv_closed_qtd > 0)
      .map((ae) => ({
        name: ae.full_name,
        activities: ae.activities_qtd,
        acv: ae.acv_closed_qtd,
        attainment: ae.attainment_qtd || 0,
        region: ae.region || "Unknown",
        isMock: false,
      }));

    // Use mock data if no real data or not a manager
    if (realPoints.length < 5) {
      return { points: [...realPoints, ...MOCK_AES], usedMock: true };
    }
    return { points: realPoints, usedMock: false };
  }, [teamData]);

  const medianActivities = useMemo(() => median(points.map((p) => p.activities)), [points]);
  const medianAcv = useMemo(() => median(points.map((p) => p.acv)), [points]);

  const correlation = useMemo(
    () => pearsonR(points.map((p) => p.activities), points.map((p) => p.acv)),
    [points]
  );

  // Quadrant summary counts
  const quadrantCounts = useMemo(() => {
    const counts = { stars: 0, efficient: 0, highEffort: 0, needsAttention: 0 };
    for (const p of points) {
      const q = getQuadrant(p.activities, p.acv, medianActivities, medianAcv);
      if (q.label === "Stars") counts.stars++;
      else if (q.label === "Efficient Closers") counts.efficient++;
      else if (q.label === "High Effort, Low Return") counts.highEffort++;
      else counts.needsAttention++;
    }
    return counts;
  }, [points, medianActivities, medianAcv]);

  // Color points by region
  const regionGroups = useMemo(() => {
    const groups: Record<string, PlotPoint[]> = {};
    for (const p of points) {
      const region = p.region || "Unknown";
      if (!groups[region]) groups[region] = [];
      groups[region].push(p);
    }
    return groups;
  }, [points]);

  const correlationLabel = useMemo(() => {
    const r = Math.abs(correlation);
    if (r >= 0.7) return { text: "Strong", color: "text-green-600" };
    if (r >= 0.4) return { text: "Moderate", color: "text-amber-600" };
    return { text: "Weak", color: "text-red-600" };
  }, [correlation]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Activity-to-Outcome Correlation</h2>
        </div>
        <Card><CardContent className="h-[400px] animate-pulse bg-muted/30" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Activity-to-Outcome Correlation</h2>
          {usedMock && (
            <Badge variant="secondary" className="text-[10px]">
              Includes sample data
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">
            Correlation:{" "}
            <span className={cn("font-semibold", correlationLabel.color)}>
              {correlationLabel.text} (r={correlation.toFixed(2)})
            </span>
          </span>
          <span className="text-muted-foreground">{points.length} reps</span>
        </div>
      </div>

      {/* Quadrant Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Stars</p>
            <p className="text-xl font-bold text-green-600 dark:text-green-400">{quadrantCounts.stars}</p>
            <p className="text-[10px] text-muted-foreground">High activity + High ACV</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Efficient Closers</p>
            <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{quadrantCounts.efficient}</p>
            <p className="text-[10px] text-muted-foreground">Low activity + High ACV</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">High Effort, Low Return</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{quadrantCounts.highEffort}</p>
            <p className="text-[10px] text-muted-foreground">High activity + Low ACV</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="pt-3 pb-3 px-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Needs Attention</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{quadrantCounts.needsAttention}</p>
            <p className="text-[10px] text-muted-foreground">Low activity + Low ACV</p>
          </CardContent>
        </Card>
      </div>

      {/* Scatter Plot */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Activities vs ACV Closed (QTD)</CardTitle>
            <div className="flex items-center gap-3">
              {Object.entries(REGION_COLORS).map(([region, color]) => {
                if (!regionGroups[region]) return null;
                return (
                  <span key={region} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                    {region}
                  </span>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <XAxis
                type="number"
                dataKey="activities"
                name="Activities"
                tick={{ fontSize: 11 }}
                tickLine={false}
              >
                <Label value="Activities (QTD)" position="bottom" offset={0} style={{ fontSize: 12, fill: "#7A8099" }} />
              </XAxis>
              <YAxis
                type="number"
                dataKey="acv"
                name="ACV Closed"
                tick={{ fontSize: 11 }}
                tickFormatter={shortCurrency}
                tickLine={false}
                width={60}
              >
                <Label value="ACV Closed (QTD)" position="left" angle={-90} offset={0} style={{ fontSize: 12, fill: "#7A8099", textAnchor: "middle" }} />
              </YAxis>
              <ZAxis dataKey="attainment" range={[60, 300]} name="Attainment" />
              <Tooltip content={<CustomTooltip />} />

              {/* Quadrant reference lines */}
              <ReferenceLine
                x={medianActivities}
                stroke="#3A3F52"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <ReferenceLine
                y={medianAcv}
                stroke="#3A3F52"
                strokeDasharray="4 4"
                strokeWidth={1}
              />

              {/* One Scatter per region for color coding */}
              {Object.entries(regionGroups).map(([region, data]) => (
                <Scatter
                  key={region}
                  name={region}
                  data={data}
                  fill={REGION_COLORS[region] || REGION_COLORS.Unknown}
                  fillOpacity={0.7}
                  strokeWidth={1}
                  stroke={REGION_COLORS[region] || REGION_COLORS.Unknown}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>

          {/* Quadrant labels */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mt-2 px-4 text-[10px] text-muted-foreground">
            <span className="text-right">Efficient Closers (bottom-right is ideal zone)</span>
            <span>Stars (top-right is top performers)</span>
            <span className="text-right">Needs Attention (bottom-left = disengaged)</span>
            <span>High Effort, Low Return (top-left = coach on quality)</span>
          </div>
        </CardContent>
      </Card>

      {/* AE Detail Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Rep Performance Detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Rep</th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground">Region</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Activities</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">ACV Closed</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">$ per Activity</th>
                  <th className="text-right py-2 px-4 font-medium text-muted-foreground">Attainment</th>
                  <th className="text-left py-2 px-4 font-medium text-muted-foreground">Quadrant</th>
                </tr>
              </thead>
              <tbody>
                {[...points]
                  .sort((a, b) => {
                    // Sort by efficiency ($/activity) descending
                    const effA = a.activities > 0 ? a.acv / a.activities : 0;
                    const effB = b.activities > 0 ? b.acv / b.activities : 0;
                    return effB - effA;
                  })
                  .map((p, idx) => {
                    const efficiency = p.activities > 0 ? p.acv / p.activities : 0;
                    const q = getQuadrant(p.activities, p.acv, medianActivities, medianAcv);
                    return (
                      <tr key={`${p.name}-${idx}`} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">
                          {p.name}
                          {p.isMock && <span className="text-[10px] text-muted-foreground ml-1">(sample)</span>}
                        </td>
                        <td className="py-2 px-4">
                          <span
                            className="inline-flex items-center gap-1 text-xs"
                          >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: REGION_COLORS[p.region] || REGION_COLORS.Unknown }} />
                            {p.region}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-right tabular-nums">{p.activities}</td>
                        <td className="py-2 px-4 text-right tabular-nums font-semibold">{fmtCurrency(p.acv)}</td>
                        <td className="py-2 px-4 text-right tabular-nums">
                          {fmtCurrency(efficiency)}
                        </td>
                        <td className={cn("py-2 px-4 text-right tabular-nums font-semibold",
                          p.attainment >= 100 ? "text-green-600 dark:text-green-400" :
                          p.attainment >= 70 ? "text-amber-600 dark:text-amber-400" :
                          "text-red-600 dark:text-red-400"
                        )}>
                          {p.attainment.toFixed(0)}%
                        </td>
                        <td className="py-2 px-4">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", q.color)}
                          >
                            {q.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

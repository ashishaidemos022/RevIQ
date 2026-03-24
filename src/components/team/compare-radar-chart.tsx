"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPARE_COLORS, COMPARE_FILLS } from "@/lib/chart-colors";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface EntityMetrics {
  id: string;
  name: string;
  acvClosedQTD: number;
  attainment: number;
  activePilots: number;
  activitiesQTD: number;
  commissionQTD: number;
}

interface CompareRadarChartProps {
  entities: EntityMetrics[];
}

const RADAR_METRICS = [
  { key: "acvClosedQTD", label: "ACV Closed" },
  { key: "attainment", label: "Attainment" },
  { key: "activePilots", label: "Pilots" },
  { key: "activitiesQTD", label: "Activities" },
  { key: "commissionQTD", label: "Commission" },
] as const;

type MetricKey = (typeof RADAR_METRICS)[number]["key"];

/** Normalize each metric to 0-100 relative to the max across all entities */
function normalizeMetrics(entities: EntityMetrics[]) {
  const maxValues: Record<string, number> = {};
  RADAR_METRICS.forEach(({ key }) => {
    maxValues[key] = Math.max(...entities.map((e) => e[key]), 1); // min 1 to avoid division by zero
  });

  return RADAR_METRICS.map(({ key, label }) => {
    const point: Record<string, string | number> = { metric: label };
    entities.forEach((entity) => {
      point[entity.name] = Math.round((entity[key] / maxValues[key]) * 100);
    });
    return point;
  });
}

export function CompareRadarChart({ entities }: CompareRadarChartProps) {
  const data = normalizeMetrics(entities);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Performance Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
            <PolarRadiusAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
            {entities.map((entity, i) => (
              <Radar
                key={entity.id}
                name={entity.name}
                dataKey={entity.name}
                stroke={COMPARE_COLORS[i]}
                fill={COMPARE_FILLS[i]}
                fillOpacity={0.5}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

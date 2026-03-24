"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPARE_COLORS } from "@/lib/chart-colors";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface QuarterEntry {
  label: string;
  activities: number;
}

interface CompareActivityChartProps {
  entities: Array<{
    id: string;
    name: string;
    quarters: QuarterEntry[];
  }>;
}

export function CompareActivityChart({ entities }: CompareActivityChartProps) {
  const labels = entities[0]?.quarters.map((q) => q.label) ?? [];

  const chartData = labels.map((label, qIdx) => {
    const point: Record<string, string | number> = { label };
    entities.forEach((entity) => {
      point[entity.name] = entity.quarters[qIdx]?.activities ?? 0;
    });
    return point;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Activity Trend (Quarterly)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {entities.map((entity, i) => (
              <Line
                key={entity.id}
                type="monotone"
                dataKey={entity.name}
                stroke={COMPARE_COLORS[i]}
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

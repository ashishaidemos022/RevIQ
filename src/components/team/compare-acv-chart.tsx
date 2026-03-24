"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPARE_COLORS } from "@/lib/chart-colors";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface QuarterEntry {
  label: string;
  acvClosed: number;
}

interface CompareAcvChartProps {
  entities: Array<{
    id: string;
    name: string;
    quarters: QuarterEntry[];
  }>;
}

export function CompareAcvChart({ entities }: CompareAcvChartProps) {
  // Merge quarter data into chart-friendly format:
  // [{ label: "Q1 FY2027", "Alice": 100000, "Bob": 80000 }, ...]
  const labels = entities[0]?.quarters.map((q) => q.label) ?? [];

  const chartData = labels.map((label, qIdx) => {
    const point: Record<string, string | number> = { label };
    entities.forEach((entity) => {
      point[entity.name] = entity.quarters[qIdx]?.acvClosed ?? 0;
    });
    return point;
  });

  const formatCurrency = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(0)}K` : `$${val}`;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">ACV Closed (Quarterly)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={formatCurrency} />
            <Tooltip
              formatter={(val) =>
                new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(Number(val))
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {entities.map((entity, i) => (
              <Bar
                key={entity.id}
                dataKey={entity.name}
                fill={COMPARE_COLORS[i]}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

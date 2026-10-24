"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "@/lib/formatters";
import type { MissingValueSummary } from "@/types";

interface MissingValuesChartProps {
  values: MissingValueSummary[];
}

function MissingValuesChart({ values }: MissingValuesChartProps) {
  const chartData = values.map((value) => ({
    feature: value.featureName,
    missing: value.missingCount,
    percentage: value.missingPercentage,
  }));

  return (
    <div className="min-w-0 border-t border-charcoal bg-surface p-5 sm:p-7">
      <div className="flex items-start justify-between gap-5 border-b border-line pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Missing-value distribution</p>
          <p className="mt-2 text-sm text-ink">Highest missingness / selected features</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Count</span>
      </div>
      <div className="mt-6 h-72 w-full" role="img" aria-label="Bar chart showing missing values across selected features">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid horizontal={false} stroke="#d9d6ce" strokeDasharray="1 4" />
            <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "#787873", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
            <YAxis dataKey="feature" type="category" width={52} tickLine={false} axisLine={false} tick={{ fill: "#2A2A2A", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} />
            <Tooltip
              cursor={{ fill: "#ebe8e0" }}
              contentStyle={{ border: "1px solid #b8b5ac", borderRadius: 0, background: "#fbfaf7", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }}
              formatter={(value) => [formatNumber(Number(value ?? 0)), "Missing"]}
            />
            <Bar dataKey="missing" fill="#E10600" barSize={14} radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="border-t border-line pt-4 text-xs leading-5 text-muted">The chart intentionally surfaces only the most affected features. The full inventory remains searchable below.</p>
    </div>
  );
}

export { MissingValuesChart };

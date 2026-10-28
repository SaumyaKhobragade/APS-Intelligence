"use client";

import * as React from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { ExperimentHistoryRecord } from "@/types";

interface ExperimentTrendsProps {
  experiments: ExperimentHistoryRecord[];
}
type TrendMetric = "prAuc" | "precision" | "f1Score" | "recall" | "businessCost";

function ExperimentTrends({ experiments }: ExperimentTrendsProps) {
  const [metric, setMetric] = React.useState<TrendMetric>("prAuc");
  const [modelId, setModelId] = React.useState("all");
  const models = Array.from(new Map(experiments.map((experiment) => [experiment.modelId, experiment.modelName])).entries()).map(([value, label]) => ({ value, label }));

  const data = experiments
    .filter((experiment) => experiment.status === "completed" && (modelId === "all" || experiment.modelId === modelId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((experiment) => {
      let value: number | undefined;
      if (metric === "businessCost") {
        value = experiment.evaluationResults.businessImpact?.estimatedCost;
      } else {
        value = experiment.evaluationResults[metric];
      }
      return {
        date: new Date(experiment.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }),
        modelName: experiment.modelName,
        experimentId: experiment.id,
        value,
      };
    });

  const formatValue = (val: number) => {
    if (metric === "businessCost") return formatCurrency(val);
    if (metric === "prAuc") return val.toFixed(3);
    return formatPercent(val);
  };

  const metricTitle = {
    prAuc: "PR-AUC",
    precision: "Precision",
    f1Score: "F1 Score",
    recall: "Recall",
    businessCost: "Business cost",
  }[metric];

  return (
    <section id="experiment-trends" aria-labelledby="experiment-trends-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Performance trends</p>
          <h2 id="experiment-trends-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Track runs without overclaiming improvement.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Chronological movement is shown as a review aid. It does not prove quality improved unless the dataset, split and evaluation protocol are comparable.</p>
        </div>
        <Badge variant="signal">Completed records only</Badge>
      </div>

      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="w-full sm:w-56">
          <label htmlFor="trend-metric" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Trend metric</label>
          <Select
            id="trend-metric"
            value={metric}
            onChange={(event) => setMetric(event.target.value as TrendMetric)}
            options={[
              { value: "prAuc", label: "PR-AUC" },
              { value: "precision", label: "Precision" },
              { value: "f1Score", label: "F1 Score" },
              { value: "recall", label: "Recall" },
              { value: "businessCost", label: "Business cost" },
            ]}
          />
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="trend-model" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Filter model</label>
          <Select id="trend-model" value={modelId} onChange={(event) => setModelId(event.target.value)} options={[{ value: "all", label: "All models" }, ...models]} />
        </div>
      </div>

      <div className="mt-8 min-w-0 border-t border-charcoal bg-charcoal p-5 sm:p-7">
        <div className="flex items-center justify-between border-b border-white/15 pb-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">{metricTitle} / run chronology</p>
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">{data.length} points</span>
        </div>
        <div className="mt-7 h-80 w-full">
          {data.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-silver/70">No completed records match this filter.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 14, bottom: 2, left: -18 }}>
                <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }}
                  tickFormatter={(val: number) => (metric === "businessCost" ? `$${Math.round(val / 1000)}k` : val.toFixed(metric === "prAuc" ? 2 : 1))}
                />
                <Tooltip
                  cursor={{ stroke: "#C0C0C0", strokeDasharray: "3 3" }}
                  contentStyle={{ border: "1px solid #787873", borderRadius: 0, background: "#2A2A2A", color: "#ffffff", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }}
                  formatter={(val) => formatValue(Number(val ?? 0))}
                  labelFormatter={(labelVal, payload) => `${String(labelVal)} / ${payload[0]?.payload?.modelName ?? "experiment"}`}
                />
                <Line type="monotone" dataKey="value" stroke="#E10600" strokeWidth={2.5} dot={{ r: 4, fill: "#E10600", strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted">
        Trend points reflect discrete model training runs recorded in the experiment registry over time. They represent distinct iterations under differing hyperparameters or imbalance techniques, not continuous parameter evolution.
      </p>
    </section>
  );
}

export { ExperimentTrends };

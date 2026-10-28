"use client";

import { LineChart as LineChartIcon } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { ThresholdModelEvaluation } from "@/types";

interface ThresholdPerformanceChartProps {
  model: ThresholdModelEvaluation;
  selectedThreshold: number;
}

type MetricKey = "precision" | "recall" | "f1Score" | "businessCost";

function ThresholdPerformanceChart({ model, selectedThreshold }: ThresholdPerformanceChartProps) {
  const recommendations = model.recommendations;
  const chartData = model.thresholdCurve.map((point) => ({ ...point, businessCost: point.businessCost }));
  const targetKey = selectedThreshold.toFixed(4);
  const selectedMetrics =
    model.thresholdCurve.find((point) => point.threshold.toFixed(4) === targetKey) ?? model.thresholdCurve[0];

  return (
    <section id="performance-curves" aria-labelledby="performance-curves-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">06 / Performance curves</p>
          <h2 id="performance-curves-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">See the threshold path.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Explicit checkpoints show how precision, recall, F1-score and assumed business cost move across persisted operating points. The frozen evaluation policy (0.115) reflects external validation; remaining points represent internal policy selection comparisons.
          </p>
        </div>
        <Badge variant="signal">
          <LineChartIcon aria-hidden="true" className="size-3" /> {model.modelName} / persisted curve
        </Badge>
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        {(["precision", "recall", "f1Score", "businessCost"] as MetricKey[]).map((metricKey) => (
          <MetricChart
            key={metricKey}
            metricKey={metricKey}
            data={chartData}
            selectedThreshold={selectedThreshold}
            defaultThreshold={model.defaultThreshold}
            minimumCostThreshold={recommendations.minimumCost.metrics.threshold}
            maximumF1Threshold={recommendations.maximumF1.metrics.threshold}
            selectedValue={selectedMetrics ? selectedMetrics[metricKey] : 0}
          />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        <span><i className="mr-2 inline-block size-2 rounded-full bg-signal" />selected / {selectedThreshold.toFixed(3)}</span>
        <span><i className="mr-2 inline-block size-2 rounded-full bg-charcoal" />frozen evaluation / {model.defaultThreshold.toFixed(3)}</span>
        <span><i className="mr-2 inline-block size-2 rounded-full bg-success" />min cost / {recommendations.minimumCost.metrics.threshold.toFixed(3)}</span>
        <span><i className="mr-2 inline-block size-2 rounded-full bg-muted" />max F1 / {recommendations.maximumF1.metrics.threshold.toFixed(3)}</span>
      </div>
    </section>
  );
}

function MetricChart({
  metricKey,
  data,
  selectedThreshold,
  defaultThreshold,
  minimumCostThreshold,
  maximumF1Threshold,
  selectedValue,
}: {
  metricKey: MetricKey;
  data: Array<Record<string, number | string>>;
  selectedThreshold: number;
  defaultThreshold: number;
  minimumCostThreshold: number;
  maximumF1Threshold: number;
  selectedValue: number;
}) {
  const title = { precision: "Precision", recall: "Recall", f1Score: "F1-score", businessCost: "Business cost" }[metricKey];
  const description = {
    precision: "Positive predictive value",
    recall: "Failure detection rate",
    f1Score: "Harmonic balance",
    businessCost: "1 × FP + 10 × FN (illustrative)",
  }[metricKey];
  const formatValue = (value: number) => (metricKey === "businessCost" ? formatNumber(value) : formatPercent(value));

  return (
    <div className="min-w-0 border-t border-charcoal bg-charcoal p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">{title}</p>
          <p className="mt-2 text-sm text-white">{description}</p>
        </div>
        <span className="font-mono text-sm text-signal">{formatValue(selectedValue)}</span>
      </div>
      <div className="mt-6 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 12, bottom: 2, left: -18 }}>
            <CartesianGrid stroke="#ffffff" strokeOpacity={0.1} vertical={false} />
            <XAxis
              dataKey="threshold"
              type="number"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }}
              tickFormatter={(value: number) => value.toFixed(2)}
            />
            <YAxis
              domain={metricKey === "businessCost" ? [0, "auto"] : [0, 1]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }}
              tickFormatter={(value: number) => (metricKey === "businessCost" ? formatNumber(value) : value.toFixed(2))}
            />
            <Tooltip
              cursor={{ stroke: "#C0C0C0", strokeDasharray: "3 3" }}
              contentStyle={{
                border: "1px solid #787873",
                borderRadius: 0,
                background: "#2A2A2A",
                color: "#ffffff",
                fontFamily: "var(--font-ibm-plex-mono)",
                fontSize: 11,
              }}
              formatter={(value) => formatValue(Number(value ?? 0))}
              labelFormatter={(value) => `Threshold ${Number(value).toFixed(3)}`}
            />
            <Line
              type="monotone"
              dataKey={metricKey}
              name={title}
              stroke="#E10600"
              strokeWidth={2.5}
              dot={data.length > 50 ? false : { r: 2, fill: "#E10600", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <ReferenceLine x={selectedThreshold} stroke="#E10600" strokeDasharray="4 4" label={{ value: "selected", fill: "#E10600", fontSize: 9, position: "top" }} />
            <ReferenceLine x={defaultThreshold} stroke="#C0C0C0" strokeDasharray="2 3" label={{ value: "frozen", fill: "#C0C0C0", fontSize: 9, position: "insideTopLeft" }} />
            <ReferenceLine x={minimumCostThreshold} stroke="#63B37A" strokeDasharray="2 3" />
            <ReferenceLine x={maximumF1Threshold} stroke="#787873" strokeDasharray="2 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export { ThresholdPerformanceChart };

"use client";

import * as React from "react";
import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/lib/formatters";
import type { ModelMetrics } from "@/types";

interface ModelPerformanceProps {
  models: ModelMetrics[];
}

const METRIC_CONFIG = [
  { key: "PR-AUC", label: "PR-AUC (Primary)", shortLabel: "PR-AUC", color: "#E10600", description: "Precision-Recall AUC" },
  { key: "Recall", label: "Recall", shortLabel: "Recall", color: "#38BDF8", description: "Failure Detection Rate" },
  { key: "Precision", label: "Precision", shortLabel: "Precision", color: "#FBBF24", description: "Positive Predictive Value" },
  { key: "F1-score", label: "F1-score", shortLabel: "F1-score", color: "#34D399", description: "Harmonic Precision/Recall Balance" },
] as const;

type FilterCount = "top6" | "top10" | "all";

function formatModelLabel(name: string): string {
  let label = name;
  label = label.replace(/^random_forest/i, "RF");
  label = label.replace(/^catboost/i, "CatBoost");
  label = label.replace(/^xgboost/i, "XGBoost");
  label = label.replace(/^logistic_regression/i, "LogReg");
  label = label.replace(/\s*\/\s*original/i, " (Orig)");
  label = label.replace(/\s*\/\s*class_weight/i, " (CW)");
  label = label.replace(/\s*\/\s*smote/i, " (SMOTE)");
  if (label.length > 20) return `${label.slice(0, 18)}…`;
  return label;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    dataKey: string;
    payload: {
      modelName: string;
      label: string;
      "PR-AUC": number;
      Precision: number;
      Recall: number;
      "F1-score": number;
      rocAuc?: number;
    };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="border border-line-strong bg-charcoal p-3 font-mono text-xs text-white shadow-xl min-w-[200px]">
      <p className="font-semibold text-white">{data.modelName}</p>
      <p className="text-[10px] text-silver/60 uppercase tracking-wider mt-0.5">Validation Operating Point</p>
      <div className="mt-2.5 space-y-1.5 border-t border-white/15 pt-2">
        {METRIC_CONFIG.map(({ key, label, color }) => {
          const val = data[key];
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-silver text-[11px]">
                <span className="size-2 rounded-[1px] shrink-0" style={{ backgroundColor: color }} />
                {label}:
              </span>
              <span className="font-semibold text-white font-mono">{formatPercent(Number(val ?? 0))}</span>
            </div>
          );
        })}
        {data.rocAuc !== undefined && data.rocAuc !== null ? (
          <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-1 text-[10px] text-silver/60">
            <span>ROC-AUC (Secondary):</span>
            <span className="font-mono text-silver">{formatPercent(data.rocAuc)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ModelPerformance({ models }: ModelPerformanceProps) {
  // Sort deterministically by PR-AUC descending
  const sortedModels = React.useMemo(() => {
    return [...models].sort((a, b) => (b.prAuc ?? 0) - (a.prAuc ?? 0));
  }, [models]);

  const bestModelId = sortedModels[0]?.modelId;

  // Filter option: default to top 6 models when > 6 models exist
  const [filterCount, setFilterCount] = React.useState<FilterCount>(() => {
    return sortedModels.length > 6 ? "top6" : "all";
  });

  const displayModels = React.useMemo(() => {
    if (filterCount === "top6") return sortedModels.slice(0, 6);
    if (filterCount === "top10") return sortedModels.slice(0, 10);
    return sortedModels;
  }, [sortedModels, filterCount]);

  const chartData = React.useMemo(() => {
    const labelCounts: Record<string, number> = {};
    displayModels.forEach((m) => {
      const base = formatModelLabel(m.modelName);
      labelCounts[base] = (labelCounts[base] ?? 0) + 1;
    });

    const seenLabels: Record<string, number> = {};
    return displayModels.map((model) => {
      const base = formatModelLabel(model.modelName);
      let label = base;
      if (labelCounts[base] > 1) {
        seenLabels[base] = (seenLabels[base] ?? 0) + 1;
        label = `${base} #${seenLabels[base]}`;
      }
      return {
        id: model.modelId,
        modelId: model.modelId,
        modelName: model.modelName,
        label,
        "PR-AUC": model.prAuc ?? 0,
        Precision: model.precision ?? 0,
        Recall: model.recall ?? 0,
        "F1-score": model.f1Score ?? 0,
        rocAuc: model.rocAuc,
      };
    });
  }, [displayModels]);

  const isWideChart = displayModels.length > 8;

  return (
    <section aria-labelledby="model-performance-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Model performance</p>
          <h2 id="model-performance-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Compare the signal, not the headline.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Precision-recall metrics keep the rare failure class in view. Only persisted validation results are shown; official-test and production scopes remain separate.
          </p>
        </div>
        <Badge variant="neutral">
          <ChartNoAxesCombined aria-hidden="true" className="size-3" /> {models.length} persisted result{models.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr] items-start">
        <div className="min-w-0 border-t border-charcoal bg-charcoal p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/15 pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Metric comparison / validation</p>
              <p className="mt-1 font-mono text-[10px] text-silver/60">0.0 — 1.0 scale · PR-AUC prioritized</p>
            </div>
            {sortedModels.length > 6 ? (
              <div className="flex items-center gap-1 bg-white/5 p-1 border border-white/10 font-mono text-[10px]">
                <button
                  type="button"
                  onClick={() => setFilterCount("top6")}
                  className={`px-2 py-0.5 transition-colors ${filterCount === "top6" ? "bg-signal text-white" : "text-silver hover:text-white"}`}
                >
                  Top 6
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCount("top10")}
                  className={`px-2 py-0.5 transition-colors ${filterCount === "top10" ? "bg-signal text-white" : "text-silver hover:text-white"}`}
                >
                  Top 10
                </button>
                <button
                  type="button"
                  onClick={() => setFilterCount("all")}
                  className={`px-2 py-0.5 transition-colors ${filterCount === "all" ? "bg-signal text-white" : "text-silver hover:text-white"}`}
                >
                  All ({sortedModels.length})
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/10 pb-3">
            {METRIC_CONFIG.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-silver">
                <span className="size-2.5 rounded-[1px] shrink-0" style={{ backgroundColor: color }} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <div
            className={`mt-4 h-[380px] w-full sm:h-[420px] ${isWideChart ? "overflow-x-auto" : ""}`}
            role="img"
            aria-label="Grouped bar chart comparing model metrics"
          >
            <div className={isWideChart ? "min-w-[1200px] h-full" : "w-full h-full"}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 16, right: 16, bottom: 24, left: -14 }}
                  barCategoryGap={displayModels.length > 8 ? "12%" : "20%"}
                  barGap={3}
                >
                  <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.12} strokeDasharray="1 4" />
                  <XAxis
                    dataKey="label"
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }}
                    angle={displayModels.length > 4 ? -20 : 0}
                    textAnchor={displayModels.length > 4 ? "end" : "middle"}
                    height={40}
                  />
                  <YAxis
                    domain={[0, 1]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }}
                    tickFormatter={(value: number) => value.toFixed(1)}
                  />
                  <Tooltip
                    cursor={{ fill: "#ffffff", fillOpacity: 0.06 }}
                    content={<CustomTooltip />}
                  />
                  <Bar dataKey="PR-AUC" fill="#E10600" radius={[2, 2, 0, 0]} maxBarSize={22} minPointSize={3} isAnimationActive={false} />
                  <Bar dataKey="Recall" fill="#38BDF8" radius={[2, 2, 0, 0]} maxBarSize={22} minPointSize={3} isAnimationActive={false} />
                  <Bar dataKey="Precision" fill="#FBBF24" radius={[2, 2, 0, 0]} maxBarSize={22} minPointSize={3} isAnimationActive={false} />
                  <Bar dataKey="F1-score" fill="#34D399" radius={[2, 2, 0, 0]} maxBarSize={22} minPointSize={3} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="min-w-0 border-y border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Comparison table ({sortedModels.length} runs)
            </p>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              PR-AUC priority <ArrowUpRight aria-hidden="true" className="size-3" />
            </span>
          </div>
          <div className="max-h-[460px] overflow-y-auto overflow-x-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-surface z-10 border-b border-line">
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>PR-AUC</TableHead>
                  <TableHead>ROC-AUC</TableHead>
                  <TableHead>Precision</TableHead>
                  <TableHead>Recall</TableHead>
                  <TableHead>F1</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedModels.map((model) => {
                  const isBest = model.modelId === bestModelId;
                  return (
                    <TableRow key={model.modelId} className={isBest ? "bg-signal-wash/45" : undefined}>
                      <TableCell className="whitespace-nowrap text-xs font-medium">
                        <span className="flex items-center gap-1.5">
                          {model.modelName}
                          {isBest ? (
                            <Badge variant="signal" className="text-[9px] px-1.5 py-0">Top</Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className={`font-mono text-xs ${isBest ? "font-semibold text-signal" : ""}`}>
                        {formatPercent(model.prAuc)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{model.rocAuc ? formatPercent(model.rocAuc) : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{formatPercent(model.precision)}</TableCell>
                      <TableCell className="font-mono text-xs">{formatPercent(model.recall)}</TableCell>
                      <TableCell className="font-mono text-xs">{formatPercent(model.f1Score)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="border-t border-line px-3 py-3 text-xs leading-5 text-muted">
            Validation results only. Accuracy is intentionally absent from the primary comparison.
          </p>
        </div>
      </div>
    </section>
  );
}

export { ModelPerformance };

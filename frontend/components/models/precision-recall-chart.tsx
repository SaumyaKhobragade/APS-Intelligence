"use client";

import * as React from "react";
import { Eye, EyeOff, LineChart as LineChartIcon } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { downsampleCurve } from "@/lib/downsample";
import { formatPercent } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

const modelColors = ["#E10600", "#2A2A2A", "#787873", "#C0C0C0"];

interface PrecisionRecallChartProps {
  models: ModelEvaluation[];
}

function PrecisionRecallChartComponent({ models }: PrecisionRecallChartProps) {
  const [curveType, setCurveType] = React.useState<"pr" | "roc">("pr");
  // Default to showing top 2 models to prevent browser lockup from 30k+ SVG nodes
  const [visibleModels, setVisibleModels] = React.useState<Set<string>>(() =>
    new Set(models.slice(0, 2).map((model) => model.modelId)),
  );

  // Downsample coordinates for visualization-only rendering (max 100 points per curve)
  // Preserves curve shape, elbows, endpoints while dropping SVG nodes from 33,000 to <300.
  const downsampledModels = React.useMemo(() => {
    return models.map((model) => ({
      modelId: model.modelId,
      modelName: model.modelName,
      prAuc: model.prAuc,
      rocAuc: model.rocAuc,
      prCurve: downsampleCurve(model.precisionRecallCurve, "recall", "precision", 100),
      rocCurve: model.rocCurve ? downsampleCurve(model.rocCurve, "falsePositiveRate", "truePositiveRate", 100) : [],
    }));
  }, [models]);

  function toggleModel(modelId: string) {
    setVisibleModels((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  function setTopN(count: number) {
    setVisibleModels(new Set(models.slice(0, count).map((m) => m.modelId)));
  }

  function clearAll() {
    setVisibleModels(new Set());
  }

  function selectAll() {
    setVisibleModels(new Set(models.map((m) => m.modelId)));
  }

  const prAvailable = downsampledModels.some((model) => model.prCurve.length > 0);
  const rocAvailable = downsampledModels.some((model) => model.rocCurve.length > 0);
  const curvesAvailable = curveType === "pr" ? prAvailable : rocAvailable;

  return (
    <section id="precision-recall" aria-labelledby="precision-recall-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / {curveType === "pr" ? "Precision-recall curves" : "ROC curves"}</p>
          <h2 id="precision-recall-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">
            {curveType === "pr" ? "Keep the rare class on the chart." : "Discrimination across operating points."}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            {curveType === "pr"
              ? "Persisted validation coordinates make the rare-class trade-off visible beside the summary metrics. Toggle models to isolate the operating shape."
              : "Receiver operating characteristic curves compare true-positive rate against false-positive rate across discrimination thresholds."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={curveType === "pr" ? "default" : "outline"} size="sm" onClick={() => setCurveType("pr")}>
            PR curve
          </Button>
          <Button variant={curveType === "roc" ? "default" : "outline"} size="sm" onClick={() => setCurveType("roc")}>
            ROC curve
          </Button>
          <Badge variant="signal"><LineChartIcon aria-hidden="true" className="size-3" /> {curveType === "pr" ? "PR-AUC" : "ROC-AUC"} / validation</Badge>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="min-w-0 border-t border-charcoal bg-charcoal p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-white/15 pb-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">
              {curveType === "pr" ? "Recall / x · Precision / y" : "False-positive rate / x · True-positive rate / y"}
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">0 — 1 scale</span>
          </div>
          <div className="mt-7 h-80 w-full sm:h-96" role="img" aria-label="Persisted validation curve comparison">
            {!curvesAvailable ? (
              <EmptyState
                title={`${curveType === "pr" ? "Precision-recall" : "ROC"} curves unavailable`}
                description="The comparison API returned validation metrics, but no persisted curve coordinates are available for this view."
              />
            ) : null}
            {curvesAvailable ? (
              <ResponsiveContainer width="100%" height="100%">
                {curveType === "pr" ? (
                  <LineChart data={downsampledModels[0]?.prCurve} margin={{ top: 8, right: 14, bottom: 2, left: -18 }}>
                    <XAxis type="number" dataKey="recall" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: "Recall", position: "insideBottomRight", fill: "#787873", fontSize: 10, offset: -2 }} />
                    <YAxis type="number" dataKey="precision" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: "Precision", angle: -90, position: "insideLeft", fill: "#787873", fontSize: 10, offset: 8 }} />
                    <Tooltip cursor={{ stroke: "#C0C0C0", strokeDasharray: "3 3" }} contentStyle={{ border: "1px solid #787873", borderRadius: 0, background: "#2A2A2A", color: "#ffffff", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }} formatter={(value) => formatPercent(Number(value ?? 0))} labelFormatter={(value) => `Recall ${formatPercent(Number(value))}`} />
                    {downsampledModels.map((model, index) => visibleModels.has(model.modelId) ? (
                      <Line key={model.modelId} data={model.prCurve} type="monotone" dataKey="precision" name={model.modelName} stroke={modelColors[index % modelColors.length]} strokeWidth={index === 0 ? 3 : 1.8} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 1.5 }} />
                    ) : null)}
                  </LineChart>
                ) : (
                  <LineChart data={downsampledModels[0]?.rocCurve} margin={{ top: 8, right: 14, bottom: 2, left: -18 }}>
                    <XAxis type="number" dataKey="falsePositiveRate" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: "FPR", position: "insideBottomRight", fill: "#787873", fontSize: 10, offset: -2 }} />
                    <YAxis type="number" dataKey="truePositiveRate" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: "TPR (Recall)", angle: -90, position: "insideLeft", fill: "#787873", fontSize: 10, offset: 8 }} />
                    <Tooltip cursor={{ stroke: "#C0C0C0", strokeDasharray: "3 3" }} contentStyle={{ border: "1px solid #787873", borderRadius: 0, background: "#2A2A2A", color: "#ffffff", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }} formatter={(value) => formatPercent(Number(value ?? 0))} labelFormatter={(value) => `FPR ${formatPercent(Number(value))}`} />
                    {downsampledModels.map((model, index) => visibleModels.has(model.modelId) && model.rocCurve.length > 0 ? (
                      <Line key={model.modelId} data={model.rocCurve} type="monotone" dataKey="truePositiveRate" name={model.modelName} stroke={modelColors[index % modelColors.length]} strokeWidth={index === 0 ? 3 : 1.8} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 1.5 }} />
                    ) : null)}
                  </LineChart>
                )}
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        <div className="border-y border-line bg-surface">
          <div className="flex flex-col gap-2 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Curve visibility</p>
              <p className="mt-1 text-sm text-ink">{visibleModels.size} active line{visibleModels.size === 1 ? "" : "s"}</p>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <button type="button" onClick={() => setTopN(3)} className="border border-line px-2 py-1 text-muted hover:border-ink hover:text-ink">Top 3</button>
              <button type="button" onClick={clearAll} className="border border-line px-2 py-1 text-muted hover:border-ink hover:text-ink">Clear</button>
              <button type="button" onClick={selectAll} className="border border-line px-2 py-1 text-muted hover:border-ink hover:text-ink">All ({models.length})</button>
            </div>
          </div>
          <div className="max-h-96 divide-y divide-line overflow-y-auto">
            {downsampledModels.map((model, index) => {
              const isVisible = visibleModels.has(model.modelId);
              return (
                <button
                  key={model.modelId}
                  type="button"
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-canvas-deep ${isVisible ? "" : "opacity-45"}`}
                  onClick={() => toggleModel(model.modelId)}
                  aria-pressed={isVisible}
                >
                  <span className="size-2 shrink-0" style={{ backgroundColor: modelColors[index % modelColors.length] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">{model.modelName}</span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      {curveType === "pr" ? `PR-AUC / ${formatPercent(model.prAuc)}` : `ROC-AUC / ${model.rocAuc ? formatPercent(model.rocAuc) : "—"}`}
                    </span>
                  </span>
                  {isVisible ? <Eye aria-hidden="true" className="size-4 text-signal" /> : <EyeOff aria-hidden="true" className="size-4 text-muted" />}
                </button>
              );
            })}
          </div>
          <p className="border-t border-line px-4 py-3 text-xs leading-5 text-muted">
            Coordinates are read from persisted validation artifacts. The highlighted line is a visual emphasis only, not a backend recommendation.
          </p>
        </div>
      </div>
    </section>
  );
}

export const PrecisionRecallChart = React.memo(PrecisionRecallChartComponent);

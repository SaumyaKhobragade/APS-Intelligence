"use client";

import * as React from "react";
import { Eye, EyeOff, LineChart as LineChartIcon } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

const modelColors = ["#E10600", "#2A2A2A", "#787873", "#C0C0C0"];

interface PrecisionRecallChartProps {
  models: ModelEvaluation[];
}

function PrecisionRecallChart({ models }: PrecisionRecallChartProps) {
  const [visibleModels, setVisibleModels] = React.useState<Set<string>>(() => new Set(models.map((model) => model.modelId)));

  function toggleModel(modelId: string) {
    setVisibleModels((current) => {
      const next = new Set(current);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  }

  return (
    <section id="precision-recall" aria-labelledby="precision-recall-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Precision-recall curves</p><h2 id="precision-recall-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Keep the rare class on the chart.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Each line uses explicit demonstration coordinates from the model artifact mock. Toggle models to isolate the operating shape, not just the summary score.</p></div><Badge variant="signal"><LineChartIcon aria-hidden="true" className="size-3" /> PR-AUC / sample</Badge></div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="min-w-0 border-t border-charcoal bg-charcoal p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-white/15 pb-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Recall / x · Precision / y</p><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">0 — 1 scale</span></div>
          <div className="mt-7 h-80 w-full sm:h-96" role="img" aria-label="Precision-recall curves for four demonstration models">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={models[0]?.precisionRecallCurve} margin={{ top: 8, right: 14, bottom: 2, left: -18 }}>
              <XAxis type="number" dataKey="recall" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: "Recall", position: "insideBottomRight", fill: "#787873", fontSize: 10, offset: -2 }} />
              <YAxis type="number" dataKey="precision" domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: "Precision", angle: -90, position: "insideLeft", fill: "#787873", fontSize: 10, offset: 8 }} />
              <Tooltip cursor={{ stroke: "#C0C0C0", strokeDasharray: "3 3" }} contentStyle={{ border: "1px solid #787873", borderRadius: 0, background: "#2A2A2A", color: "#ffffff", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }} formatter={(value) => formatPercent(Number(value ?? 0))} labelFormatter={(value) => `Recall ${formatPercent(Number(value))}`} />
              {models.map((model, index) => visibleModels.has(model.modelId) ? <Line key={model.modelId} data={model.precisionRecallCurve} type="monotone" dataKey="precision" name={model.modelName} stroke={modelColors[index % modelColors.length]} strokeWidth={model.modelId === "xgboost" ? 3 : 1.8} dot={{ r: 2, fill: modelColors[index % modelColors.length], strokeWidth: 0 }} activeDot={{ r: 4 }} /> : null)}
            </LineChart></ResponsiveContainer>
          </div>
        </div>

        <div className="border-y border-line bg-surface">
          <div className="border-b border-line px-4 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Curve visibility</p><p className="mt-2 text-sm text-ink">Toggle a model line</p></div>
          <div className="divide-y divide-line">{models.map((model, index) => { const isVisible = visibleModels.has(model.modelId); return <button key={model.modelId} type="button" className={`flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-canvas-deep ${isVisible ? "" : "opacity-45"}`} onClick={() => toggleModel(model.modelId)} aria-pressed={isVisible}><span className="size-2 shrink-0" style={{ backgroundColor: modelColors[index % modelColors.length] }} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium text-ink">{model.modelName}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">PR-AUC / {formatPercent(model.prAuc)}</span></span>{isVisible ? <Eye aria-hidden="true" className="size-4 text-signal" /> : <EyeOff aria-hidden="true" className="size-4 text-muted" />}</button>; })}</div>
          <p className="border-t border-line px-4 py-4 text-xs leading-5 text-muted">Precision-recall curves are threshold paths. The highlighted line is a visual emphasis only, not a backend recommendation.</p>
        </div>
      </div>
    </section>
  );
}

export { PrecisionRecallChart };

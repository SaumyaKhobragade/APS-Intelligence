"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { formatPercent } from "@/lib/formatters";
import type { FeatureImportance, ModelEvaluation } from "@/types";

interface FeatureImportanceChartProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function FeatureImportanceChart({ models, selectedModelId, onSelectModel }: FeatureImportanceChartProps) {
  const selectedModel = models.find((model) => model.modelId === selectedModelId) ?? models[0];
  const importance = selectedModel.featureImportance ?? [];
  const chartData = importance.map((feature) => ({ feature: feature.featureName, importance: feature.importance }));

  return (
    <section id="feature-importance" aria-labelledby="feature-importance-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Feature importance</p>
          <h2 id="feature-importance-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">See which signals move the artifact.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Importance is model-specific. Logistic Regression uses absolute coefficients while tree models use gain or split frequency; values across methodologies are not directly comparable.</p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="importance-model" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Importance model</label>
          <Select id="importance-model" value={selectedModel.modelId} onChange={(event) => onSelectModel(event.target.value)} options={models.map((model) => ({ label: model.modelName, value: model.modelId }))} />
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0 border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-line pb-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Most influential features / sample</p><p className="mt-2 text-sm text-ink">{selectedModel.modelName}</p></div><Badge variant="neutral"><BarChart3 aria-hidden="true" className="size-3" /> {importanceMethod(importance[0]?.methodology)}</Badge></div>
          {importance.length ? <div className="mt-7 h-72 w-full" role="img" aria-label={`Feature importance chart for ${selectedModel.modelName}`}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 2 }}><CartesianGrid horizontal={false} stroke="#d9d6ce" strokeDasharray="1 4" /><XAxis type="number" domain={[0, 1]} tickLine={false} axisLine={false} tick={{ fill: "#787873", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(1)} /><YAxis type="category" dataKey="feature" width={54} tickLine={false} axisLine={false} tick={{ fill: "#2A2A2A", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} /><Tooltip cursor={{ fill: "#ebe8e0" }} contentStyle={{ border: "1px solid #b8b5ac", borderRadius: 0, background: "#fbfaf7", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }} formatter={(value) => formatPercent(Number(value ?? 0))} /><Bar dataKey="importance" fill="#E10600" barSize={18} radius={0} /></BarChart></ResponsiveContainer></div> : <p className="py-16 text-center text-sm text-muted">No feature importance artifact is available for this model.</p>}
        </div>
        <div className="border-l-2 border-signal pl-5"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Interpretation note</p><p className="mt-5 text-lg leading-7 text-ink">A high score identifies an influential signal inside one model, not a causal explanation of APS failure.</p><p className="mt-6 text-sm leading-6 text-muted">Use this view to decide which features deserve deeper domain review. Compare like with like: coefficients, gain and split frequency answer different questions.</p><div className="mt-8 border-t border-line pt-4 font-mono text-[10px] uppercase leading-5 tracking-[0.1em] text-muted">Selected model / {selectedModel.modelName}<br />Method / {importanceMethod(importance[0]?.methodology)}</div></div>
      </div>
    </section>
  );
}

function importanceMethod(methodology: FeatureImportance["methodology"] | undefined): string {
  if (methodology === "absolute_coefficient") return "absolute coefficient";
  if (methodology === "split_frequency") return "split frequency";
  if (methodology === "gain") return "gain";
  return "not available";
}

export { FeatureImportanceChart };

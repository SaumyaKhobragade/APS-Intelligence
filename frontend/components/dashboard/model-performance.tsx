"use client";

import { ArrowUpRight, ChartNoAxesCombined } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

function shortModelName(modelName: string): string {
  return modelName === "Logistic Regression" ? "Logistic" : modelName;
}

function ModelPerformance({ models }: ModelPerformanceProps) {
  const bestModelId = models.length ? models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), models[0]).modelId : undefined;
  const chartData = models.map((model) => ({
    model: shortModelName(model.modelName),
    "PR-AUC": model.prAuc,
    Precision: model.precision,
    Recall: model.recall,
    "F1-score": model.f1Score,
  }));

  return (
    <section aria-labelledby="model-performance-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Model performance</p>
          <h2 id="model-performance-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Compare the signal, not the headline.</h2>
           <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Precision-recall metrics keep the rare failure class in view. Only persisted validation results are shown; official-test and production scopes remain separate.</p>
        </div>
         <Badge variant="neutral"><ChartNoAxesCombined aria-hidden="true" className="size-3" /> {models.length} persisted result{models.length === 1 ? "" : "s"}</Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0 border-t border-charcoal bg-charcoal p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-white/15 pb-4">
             <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Metric comparison / validation</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">0 — 1 scale</span>
          </div>
          <div className="mt-7 h-72 w-full sm:h-80" role="img" aria-label="Grouped bar chart comparing model metrics">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="#ffffff" strokeOpacity={0.12} strokeDasharray="1 4" />
                <XAxis dataKey="model" tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-dm-sans)", fontSize: 11 }} />
                <YAxis domain={[0, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => value.toFixed(1)} />
                <Tooltip cursor={{ fill: "#ffffff", fillOpacity: 0.06 }} contentStyle={{ border: "1px solid #787873", borderRadius: 0, background: "#2A2A2A", color: "#ffffff", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }} />
                <Legend wrapperStyle={{ color: "#C0C0C0", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }} />
                <Bar dataKey="PR-AUC" fill="#E10600" barSize={8} />
                <Bar dataKey="Precision" fill="#C0C0C0" barSize={8} />
                <Bar dataKey="Recall" fill="#787873" barSize={8} />
                <Bar dataKey="F1-score" fill="#ffffff" barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 border-y border-line">
          <div className="flex items-center justify-between border-b border-line px-3 py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Comparison table</p>
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">PR-AUC priority <ArrowUpRight aria-hidden="true" className="size-3" /></span>
          </div>
          <Table>
            <TableHeader>
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
              {models.map((model) => (
                <TableRow key={model.modelId} className={model.modelId === bestModelId ? "bg-signal-wash/45" : undefined}>
                  <TableCell className="whitespace-nowrap text-xs font-medium">{model.modelName}</TableCell>
                  <TableCell className={`font-mono text-xs ${model.modelId === bestModelId ? "font-semibold text-signal" : ""}`}>{formatPercent(model.prAuc)}</TableCell>
                  <TableCell className="font-mono text-xs">{model.rocAuc ? formatPercent(model.rocAuc) : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(model.precision)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(model.recall)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(model.f1Score)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
           <p className="border-t border-line px-3 py-4 text-xs leading-5 text-muted">Validation results only. Accuracy is intentionally absent from the primary comparison.</p>
        </div>
      </div>
    </section>
  );
}

export { ModelPerformance };

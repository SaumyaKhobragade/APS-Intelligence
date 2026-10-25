import { RotateCcw, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPercent } from "@/lib/formatters";
import type { ThresholdModelEvaluation, ThresholdRecommendation } from "@/types";

interface ThresholdControlProps {
  model: ThresholdModelEvaluation;
  threshold: number;
  recommendations: ThresholdModelEvaluation["recommendations"];
  onThresholdChange: (threshold: number) => void;
  onReset: () => void;
  onSelectRecommendation: (recommendation: ThresholdRecommendation) => void;
}

function clampThreshold(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function ThresholdControl({ model, threshold, recommendations, onThresholdChange, onReset, onSelectRecommendation }: ThresholdControlProps) {
  function handleInputChange(value: string) {
    if (value === "") return;
    onThresholdChange(clampThreshold(Number(value)));
  }

  return (
    <section id="threshold-control" aria-labelledby="threshold-control-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Threshold control</p>
          <h2 id="threshold-control-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Move the operating point.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Drag, type or select a recommendation. Every count, score and cost below reads from this same validation threshold.</p>
        </div>
        <Badge variant="signal"><Target aria-hidden="true" className="size-3" /> Shared threshold state</Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Selected threshold</p><p className="mt-4 font-display text-6xl leading-none tracking-[-0.08em] text-signal">{threshold.toFixed(2)}</p></div><Button size="sm" variant="ghost" className="text-silver hover:bg-white/10 hover:text-white" onClick={onReset}><RotateCcw aria-hidden="true" className="size-3.5" /> Reset / {formatPercent(model.defaultThreshold)}</Button></div>
          <div className="mt-10"><label htmlFor="threshold-range" className="sr-only">Classification threshold</label><input id="threshold-range" type="range" min="0" max="1" step="0.01" value={threshold} onChange={(event) => onThresholdChange(Number(event.target.value))} className="h-2 w-full cursor-pointer accent-signal" /><div className="mt-3 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60"><span>0.00 / flag broadly</span><span>1.00 / flag narrowly</span></div></div>
          <div className="mt-8 grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Default</p><p className="mt-2 font-mono text-lg">{formatPercent(model.defaultThreshold)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Min cost</p><p className="mt-2 font-mono text-lg">{formatPercent(recommendations.minimumCost.metrics.threshold)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Max F1</p><p className="mt-2 font-mono text-lg">{formatPercent(recommendations.maximumF1.metrics.threshold)}</p></div></div>
        </div>

        <div className="border-y border-line bg-surface p-5 sm:p-7"><div className="flex items-end gap-3"><div className="flex-1"><label htmlFor="threshold-number" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Direct numerical input</label><Input id="threshold-number" type="number" min="0" max="1" step="0.01" value={threshold.toFixed(2)} onChange={(event) => handleInputChange(event.target.value)} /></div><span className="pb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">0 — 1</span></div><div className="mt-7 border-t border-line pt-5"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Recommended operating points</p><div className="mt-4 divide-y divide-line">{[recommendations.minimumCost, recommendations.maximumF1, recommendations.default].map((recommendation) => <button key={recommendation.kind} type="button" className={`flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:bg-canvas-deep/60 ${Math.abs(threshold - recommendation.metrics.threshold) < 0.005 ? "text-signal" : "text-ink"}`} onClick={() => onSelectRecommendation(recommendation)}><span><span className="block text-sm font-medium">{recommendation.label}</span><span className="mt-1 block text-xs leading-5 text-muted">{recommendation.explanation}</span></span><span className="shrink-0 font-mono text-sm">{formatPercent(recommendation.metrics.threshold)}</span></button>)}</div></div></div>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">The displayed coordinates are validation checkpoints. Values between checkpoints are linearly interpolated for this demonstration; no final test set is used to choose the threshold.</p>
    </section>
  );
}

export { ThresholdControl };

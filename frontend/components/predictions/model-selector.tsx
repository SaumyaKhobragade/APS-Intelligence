import { Check, CircleHelp, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PredictionModelOption } from "@/types";

interface ModelSelectorProps {
  models: PredictionModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function ModelSelector({ models, selectedModelId, onSelectModel }: ModelSelectorProps) {
  return (
    <section id="model-selection" aria-labelledby="model-selection-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model selection</p><h2 id="model-selection-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Choose the inference artifact deliberately.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Evaluation metrics and thresholds are shown for context. Availability below is a simulated demo state; no trained artifact is claimed to be loaded by the backend.</p></div><Badge variant="signal"><Cpu aria-hidden="true" className="size-3" /> Demo inference only</Badge></div>
       <div className="mt-8 grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">{models.map((model) => { const selected = model.modelId === selectedModelId; const available = model.availability === "available"; return <button key={model.modelId} type="button" className={`relative bg-surface p-5 text-left transition-colors hover:bg-canvas-deep ${selected ? "border-t-2 border-signal bg-signal-wash/40" : "border-t-2 border-transparent"}`} onClick={() => onSelectModel(model.modelId)} aria-pressed={selected} disabled={!available}><div className="flex items-start justify-between gap-3"><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{model.modelId}</span>{selected ? <Check aria-hidden="true" className="size-4 text-signal" /> : null}</div><p className="mt-6 font-display text-3xl leading-none tracking-[-0.035em] text-ink">{model.modelName}</p><div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">PR-AUC</p><p className="mt-2 font-mono text-lg text-signal">{model.prAuc === undefined ? "—" : `${(model.prAuc * 100).toFixed(1)}%`}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Threshold</p><p className="mt-2 font-mono text-lg text-ink">{(model.defaultThreshold * 100).toFixed(0)}%</p></div></div><div className="mt-5 flex items-center gap-2"><Badge variant={available ? "success" : "neutral"}>{available ? "Approved" : "Not available"}</Badge>{!available ? <CircleHelp aria-hidden="true" className="size-3 text-muted" /> : null}</div></button>; })}</div>
    </section>
  );
}

export { ModelSelector };

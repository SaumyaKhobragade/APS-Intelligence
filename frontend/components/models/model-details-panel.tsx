import { Clock3, Code2, Database, FileCheck2, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

interface ModelDetailsPanelProps {
  model: ModelEvaluation;
}

function ModelDetailsPanel({ model }: ModelDetailsPanelProps) {
  return (
    <section id="model-details" aria-labelledby="model-details-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">06 / Model details</p><h2 id="model-details-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Open the artifact contract.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Configuration and evaluation provenance stay beside the metrics so a score is never detached from its dataset or threshold.</p></div><Badge variant="success"><FileCheck2 aria-hidden="true" className="size-3" /> {model.evaluationStatus}</Badge></div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[0.8fr_1.2fr]"><div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Selected artifact</p><h3 className="mt-5 font-display text-5xl leading-none tracking-[-0.05em]">{model.modelName}</h3><p className="mt-3 text-sm text-silver/75">{model.modelType}</p><div className="mt-10 space-y-4 border-t border-white/15 pt-5"><DetailLine icon={Clock3} label="Training duration" value={`${model.trainingDurationSeconds}s`} /><DetailLine icon={Database} label="Training dataset" value={model.trainingDataset} /><DetailLine icon={FileCheck2} label="Evaluation dataset" value={model.evaluationDataset} /><DetailLine icon={SlidersHorizontal} label="Classification threshold" value={formatPercent(model.threshold)} /></div></div>
        <div className="min-w-0 border-y border-line bg-surface"><div className="border-b border-line px-4 py-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Hyperparameters</p><p className="mt-1 text-sm text-ink">Offline artifact configuration / sample</p></div><div className="grid gap-px bg-line sm:grid-cols-2">{Object.entries(model.hyperparameters).map(([key, value]) => <div key={key} className="bg-surface p-4"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{key.replaceAll("_", " ")}</p><p className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-ink"><Code2 aria-hidden="true" className="size-3 text-signal" />{String(value)}</p></div>)}</div><div className="border-t border-line px-4 py-5"><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">PR-AUC</p><p className="mt-2 font-mono text-lg text-signal">{formatPercent(model.prAuc)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Precision</p><p className="mt-2 font-mono text-lg text-ink">{formatPercent(model.precision)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Recall</p><p className="mt-2 font-mono text-lg text-ink">{formatPercent(model.recall)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">F1</p><p className="mt-2 font-mono text-lg text-ink">{formatPercent(model.f1Score)}</p></div></div></div></div>
      </div>
    </section>
  );
}

function DetailLine({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="flex items-start gap-3"><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} /><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-silver/65">{label}</p><p className="mt-1 break-words font-mono text-xs text-white">{value}</p></div></div>;
}

export { ModelDetailsPanel };

import * as React from "react";
import { Award, Clock3, Gauge, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPercent } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

interface ModelOverviewProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function ModelOverviewComponent({ models, selectedModelId, onSelectModel }: ModelOverviewProps) {
  const bestModel = React.useMemo(() => {
    return models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), models[0]);
  }, [models]);

  if (!bestModel) return null;

  return (
    <section id="model-overview" aria-labelledby="model-overview-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model overview</p>
          <h2 id="model-overview-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Historical models, one evaluation contract.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Persisted validation records are compared with PR-AUC as the primary ranking lens. Cross-validation and threshold-dependent metrics remain labelled separately.</p>
        </div>
        <Badge variant="signal"><Target aria-hidden="true" className="size-3" /> PR-AUC priority</Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Best validation PR-AUC</p>
              <p className="mt-5 font-display text-5xl leading-none tracking-[-0.05em]">{bestModel.modelName}</p>
            </div>
            <Award aria-hidden="true" className="size-5 text-signal" strokeWidth={1.5} />
          </div>
          <p className="mt-8 font-mono text-6xl tracking-[-0.08em] text-signal">{formatPercent(bestModel.prAuc)}</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-silver/75">Persisted validation evidence. Threshold-dependent cost remains a separate operating-point decision.</p>
          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-white/15 pt-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Threshold</p>
              <p className="mt-2 font-mono text-lg">{formatPercent(bestModel.threshold)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Training</p>
              <p className="mt-2 inline-flex items-center gap-2 font-mono text-lg">
                <Clock3 aria-hidden="true" className="size-3 text-signal" />
                {bestModel.trainingDurationSeconds === undefined ? "—" : `${bestModel.trainingDurationSeconds}s`}
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0 border-y border-line">
          <div className="grid grid-cols-[minmax(9rem,1.4fr)_repeat(4,minmax(4.5rem,0.7fr))] border-b border-line bg-surface px-3 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>Model</span>
            <span>PR-AUC</span>
            <span>Precision</span>
            <span>Recall</span>
            <span>F1</span>
          </div>
          <div className="max-h-[34rem] divide-y divide-line overflow-y-auto">
            {models.map((model) => {
              const isSelected = model.modelId === selectedModelId;
              const isBest = model.modelId === bestModel.modelId;
              return (
                <Button
                  key={model.modelId}
                  type="button"
                  variant="ghost"
                  className={`grid h-auto w-full grid-cols-[minmax(9rem,1.4fr)_repeat(4,minmax(4.5rem,0.7fr))] justify-stretch gap-0 border-b border-line px-3 py-4 text-left font-normal hover:bg-canvas-deep ${
                    isSelected ? "bg-signal-wash/50" : ""
                  }`}
                  onClick={() => onSelectModel(model.modelId)}
                  aria-pressed={isSelected}
                >
                  <span className="flex min-w-0 flex-col gap-1 pr-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`size-1.5 shrink-0 rounded-full ${isBest ? "bg-signal" : "bg-line-strong"}`} />
                      <span className="truncate text-xs font-medium text-ink">{model.modelName}</span>
                      {isBest ? <Badge variant="signal" className="hidden shrink-0 sm:inline-flex">Best</Badge> : null}
                    </span>
                    <span className="pl-3.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                      {model.trainingDurationSeconds === undefined ? "duration unavailable" : `${model.trainingDurationSeconds}s training`} · threshold {formatPercent(model.threshold)} · {model.evaluationStatus}
                    </span>
                  </span>
                  <span className={`font-mono text-xs ${isBest ? "font-semibold text-signal" : "text-ink"}`}>{formatPercent(model.prAuc)}</span>
                  <span className="font-mono text-xs text-ink">{formatPercent(model.precision)}</span>
                  <span className="font-mono text-xs text-ink">{formatPercent(model.recall)}</span>
                  <span className="font-mono text-xs text-ink">{formatPercent(model.f1Score)}</span>
                </Button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-3 py-4 text-xs text-muted">
            <Gauge aria-hidden="true" className="size-4 text-signal" /> Selected model drives the details, confusion matrix and business impact sections.
          </div>
        </div>
      </div>
    </section>
  );
}

export const ModelOverview = React.memo(ModelOverviewComponent);

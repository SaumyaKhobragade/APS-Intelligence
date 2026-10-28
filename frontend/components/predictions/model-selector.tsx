"use client";

import { Check, Cpu, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import type { PredictionModelOption } from "@/types";

interface ModelSelectorProps {
  models: PredictionModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function ModelSelector({ models, selectedModelId, onSelectModel }: ModelSelectorProps) {
  return (
    <section id="model-selection" aria-labelledby="model-selection-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model selection</p>
          <h2 id="model-selection-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">
            Choose the inference artifact deliberately.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Production inference requires an approved model and active decision policy. Candidate evaluation models remain gated by backend safeguards.
          </p>
        </div>
        <Badge variant="signal">
          <Cpu aria-hidden="true" className="size-3" /> Model Registry
        </Badge>
      </div>

      {models.length ? (
        <div className="mt-8 grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
          {models.map((model) => {
            const selected = model.modelId === selectedModelId;
            const available = model.availability === "available";

            return (
              <button
                key={model.modelId}
                type="button"
                className={`relative bg-surface p-5 text-left transition-colors hover:bg-canvas-deep ${
                  selected ? "border-t-2 border-signal bg-signal-wash/40" : "border-t-2 border-transparent"
                }`}
                onClick={() => onSelectModel(model.modelId)}
                aria-pressed={selected}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted break-all">
                    {model.modelId}
                  </span>
                  {selected ? <Check aria-hidden="true" className="size-4 shrink-0 text-signal" /> : null}
                </div>
                <p className="mt-5 font-display text-2xl leading-tight tracking-[-0.03em] text-ink">
                  {model.modelName}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Threshold</p>
                    <p className="mt-1 font-mono text-base text-ink">
                      {(model.defaultThreshold * 100).toFixed(1)}% ({model.defaultThreshold.toFixed(3)})
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Features</p>
                    <p className="mt-1 font-mono text-base text-ink">
                      {model.featureCount} sensor inputs
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-line/60 pt-3">
                  <Badge variant={available ? "success" : "neutral"}>
                    {available ? "Production Approved" : "Unpromoted Candidate"}
                  </Badge>
                  {!available ? (
                    <span className="flex items-center gap-1 font-mono text-[10px] text-muted" title={model.availabilityNote}>
                      <ShieldAlert aria-hidden="true" className="size-3 text-signal" /> Gated
                    </span>
                  ) : null}
                </div>
                {model.availabilityNote ? (
                  <p className="mt-2 text-[11px] leading-4 text-muted line-clamp-2">
                    {model.availabilityNote}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            title="No registered inference models"
            description="The backend returned no completed model records. Inference remains unavailable until an approved model and active decision policy are registered."
          />
        </div>
      )}
    </section>
  );
}

export { ModelSelector };

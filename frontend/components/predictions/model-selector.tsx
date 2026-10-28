"use client";

import * as React from "react";
import { Check, Cpu, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import type { PredictionModelOption } from "@/types";

interface ModelSelectorProps {
  models: PredictionModelOption[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

export function ModelSelector({
  models,
  selectedModelId,
  onSelectModel,
}: ModelSelectorProps) {
  const selectedModel = models.find((m) => m.modelId === selectedModelId) ?? models[0];

  if (!models.length) {
    return (
      <section
        id="model-selection"
        aria-labelledby="model-selection-heading"
        className="border-b border-line px-5 py-6 sm:px-8 lg:px-10"
      >
        <EmptyState
          title="No registered inference models"
          description="The backend returned no completed model records. Inference remains unavailable until an approved model and active decision policy are registered."
        />
      </section>
    );
  }

  const isApproved =
    selectedModel?.approvalStatus === "approved" && selectedModel?.availability === "available";
  const isVerificationFailed = selectedModel?.approvalStatus === "verification_failed";

  return (
    <section
      id="model-selection"
      aria-labelledby="model-selection-heading"
      className="border-b border-line px-5 py-6 sm:px-8 lg:px-10"
    >
      {/* Stage Header */}
      <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            01 / Inference Configuration
          </p>
          <h2
            id="model-selection-heading"
            className="mt-1 font-display text-2xl leading-tight tracking-[-0.03em] text-ink sm:text-3xl"
          >
            Inference Artifact & Operating Point
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isApproved ? "success" : isVerificationFailed ? "signal" : "neutral"}>
            <Cpu aria-hidden="true" className="size-3" />
            {isApproved
              ? "Production Approved"
              : isVerificationFailed
              ? "Registry Unavailable"
              : "Unpromoted Candidate (Gated)"}
          </Badge>
        </div>
      </div>

      {/* Model Selection Tabs / Pill Selector (if multiple models) */}
      {models.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-2 pb-3 border-b border-line">
          {models.map((model) => {
            const isSelected = model.modelId === selectedModelId;
            return (
              <button
                key={model.modelId}
                type="button"
                onClick={() => onSelectModel(model.modelId)}
                aria-pressed={isSelected}
                className={`flex items-center gap-2 px-3 py-1.5 font-mono text-xs rounded border transition-colors ${
                  isSelected
                    ? "border-signal bg-signal-wash font-semibold text-ink"
                    : "border-line bg-surface hover:bg-canvas-deep text-muted hover:text-ink"
                }`}
              >
                {isSelected ? (
                  <Check aria-hidden="true" className="size-3 text-signal" />
                ) : (
                  <Layers aria-hidden="true" className="size-3 text-muted" />
                )}
                <span>{model.modelName}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Compact Model Metadata Grid */}
      {selectedModel ? (
        <div className="mt-4 border border-line bg-surface p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Model Artifact
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-ink truncate" title={selectedModel.modelName}>
                {selectedModel.modelName}
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted truncate" title={selectedModel.modelId}>
                {selectedModel.modelId}
              </p>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Frozen Threshold
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-ink">
                {(selectedModel.defaultThreshold * 100).toFixed(1)}% ({selectedModel.defaultThreshold.toFixed(3)})
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted">Cost-optimal</p>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Calibration
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-ink">Isotonic</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted">Probability mapped</p>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Feature Schema
              </p>
              <p className="mt-1 font-mono text-xs font-semibold text-ink">
                {selectedModel.featureCount ?? 170} sensors
              </p>
              <p className="mt-0.5 font-mono text-[10px] text-muted">APS specification</p>
            </div>

            <div className="col-span-2 sm:col-span-4 lg:col-span-1 border-t lg:border-t-0 lg:border-l border-line pt-2 lg:pt-0 lg:pl-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Lifecycle State
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant={isApproved ? "success" : "neutral"} className="text-[10px]">
                  {isApproved ? "Approved" : "Gated (0 promotions)"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Availability note / explanation */}
          {selectedModel.availabilityNote ? (
            <p className="mt-3 border-t border-line/60 pt-2 font-mono text-[11px] text-muted leading-4">
              {selectedModel.availabilityNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

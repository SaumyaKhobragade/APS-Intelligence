"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select as SelectInput } from "@/components/ui/select";
import { formatNumber } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

interface ConfusionMatrixComparisonProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function ConfusionMatrixComparisonComponent({ models, selectedModelId, onSelectModel }: ConfusionMatrixComparisonProps) {
  const selectedModel = React.useMemo(() => {
    return models.find((model) => model.modelId === selectedModelId) ?? models[0];
  }, [models, selectedModelId]);

  const modelOptions = React.useMemo(() => {
    return models.map((model) => ({ label: model.modelName, value: model.modelId }));
  }, [models]);

  if (!selectedModel) return null;
  const matrix = selectedModel.confusionMatrix;

  return (
    <section id="confusion-matrix" aria-labelledby="confusion-matrix-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">04 / Confusion matrix</p>
          <h2 id="confusion-matrix-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Make the errors tangible.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Switch models to inspect the threshold-dependent counts behind precision, recall and the business cost. False negatives receive the signal-red treatment because they carry the larger penalty.</p>
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="confusion-model" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Inspect model</label>
          <SelectInput id="confusion-model" value={selectedModel.modelId} onChange={(event) => onSelectModel(event.target.value)} options={modelOptions} />
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{selectedModel.modelName}</p>
              <p className="mt-2 text-sm text-ink">Threshold / {selectedModel.threshold.toFixed(2)}</p>
            </div>
            <Badge variant="signal">Sample counts</Badge>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2" role="table" aria-label={`Confusion matrix for ${selectedModel.modelName}`}>
            <MatrixCell label="True negative" shortLabel="TN" value={matrix.trueNegative} tone="neutral" icon={CheckCircle2} />
            <MatrixCell label="False positive" shortLabel="FP" value={matrix.falsePositive} tone="muted" icon={MinusCircle} />
            <MatrixCell label="False negative" shortLabel="FN" value={matrix.falseNegative} tone="signal" icon={AlertTriangle} />
            <MatrixCell label="True positive" shortLabel="TP" value={matrix.truePositive} tone="success" icon={CheckCircle2} />
          </div>
          <div className="mt-6 border-t border-line pt-4 font-mono text-[10px] uppercase leading-5 tracking-[0.1em] text-muted">
            Predicted / normal → failure <span className="mx-2 text-line-strong">·</span> Actual / normal ↓ failure
          </div>
        </div>
        <div className="border-l-2 border-signal pl-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Reading the cells</p>
          <div className="mt-5 space-y-5">
            <Explanation label="True negative" text="Normal systems correctly left unflagged." />
            <Explanation label="False positive" text="A normal system sent for inspection; costed at $1 in this validation context." />
            <Explanation label="False negative" text="A failure missed by the model; costed at $10 and operationally critical." accent />
            <Explanation label="True positive" text="A failure correctly surfaced for intervention." />
          </div>
        </div>
      </div>
    </section>
  );
}

function MatrixCell({ label, shortLabel, value, tone, icon: Icon }: { label: string; shortLabel: string; value: number; tone: "neutral" | "muted" | "signal" | "success"; icon: typeof CheckCircle2 }) {
  const classes = { neutral: "border-line bg-canvas-deep/60", muted: "border-line-strong bg-canvas-deep", signal: "border-signal bg-signal-wash", success: "border-success/40 bg-success/10" };
  const iconClasses = { neutral: "text-muted", muted: "text-muted", signal: "text-signal", success: "text-success" };
  return (
    <div className={`border p-4 sm:p-6 ${classes[tone]}`} role="cell">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{shortLabel}</span>
        <Icon aria-hidden="true" className={`size-4 ${iconClasses[tone]}`} strokeWidth={1.5} />
      </div>
      <p className="mt-6 font-mono text-3xl tracking-[-0.06em] text-ink">{formatNumber(value)}</p>
      <p className="mt-2 text-xs leading-5 text-muted">{label}</p>
    </div>
  );
}

function Explanation({ label, text, accent = false }: { label: string; text: string; accent?: boolean }) {
  return (
    <div>
      <p className={`text-sm font-medium ${accent ? "text-signal" : "text-ink"}`}>{label}</p>
      <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
    </div>
  );
}

export const ConfusionMatrixComparison = React.memo(ConfusionMatrixComparisonComponent);

"use client";

import * as React from "react";
import { FilePlus2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CostWeights, ExperimentCreationRequest, PredictionModelOption } from "@/types";

interface ExperimentCreationProps { models: PredictionModelOption[]; onSave: (request: ExperimentCreationRequest) => void; }

function ExperimentCreation({ models, onSave }: ExperimentCreationProps) {
  const [name, setName] = React.useState("");
  const [modelId, setModelId] = React.useState(models[0]?.modelId ?? "");
  const [datasetId, setDatasetId] = React.useState("aps-training-v1");
  const [missingValueStrategy, setMissingValueStrategy] = React.useState("median_imputation");
  const [classImbalanceStrategy, setClassImbalanceStrategy] = React.useState("balanced_class_weights");
  const [classificationThreshold, setClassificationThreshold] = React.useState("0.36");
  const [falsePositive, setFalsePositive] = React.useState("10");
  const [falseNegative, setFalseNegative] = React.useState("500");
  const [saved, setSaved] = React.useState(false);

  function saveConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const costWeights: CostWeights = { falsePositive: Number(falsePositive) || 0, falseNegative: Number(falseNegative) || 0 };
    onSave({ name: name.trim() || "Untitled demonstration configuration", modelId, datasetId, missingValueStrategy, classImbalanceStrategy, classificationThreshold: Math.max(0, Math.min(1, Number(classificationThreshold) || 0)), costWeights });
    setSaved(true);
  }

  return <section id="experiment-creation" aria-labelledby="experiment-creation-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14"><div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">08 / New configuration</p><h2 id="experiment-creation-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Prepare the next run.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Save a configuration for future backend execution. This action does not train a model or create a completed experiment result.</p></div><Badge variant="signal"><FilePlus2 aria-hidden="true" className="size-3" /> Configuration only</Badge></div><form className="mt-8 grid gap-8 xl:grid-cols-[1fr_0.8fr]" onSubmit={saveConfiguration}><div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><label htmlFor="new-experiment-name" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Experiment name</label><Input id="new-experiment-name" placeholder="e.g. XGBoost recall review" value={name} onChange={(event) => setName(event.target.value)} /></div><div><label htmlFor="new-experiment-model" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Model</label><Select id="new-experiment-model" value={modelId} onChange={(event) => setModelId(event.target.value)} options={models.map((model) => ({ label: model.modelName, value: model.modelId }))} /></div><div><label htmlFor="new-experiment-dataset" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Dataset</label><Select id="new-experiment-dataset" value={datasetId} onChange={(event) => setDatasetId(event.target.value)} options={[{ label: "APS training / demo", value: "aps-training-v1" }, { label: "APS test holdout / demo", value: "aps-test-v2" }]} /></div><div><label htmlFor="new-missing-strategy" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Missing-value strategy</label><Select id="new-missing-strategy" value={missingValueStrategy} onChange={(event) => setMissingValueStrategy(event.target.value)} options={[{ label: "Median imputation", value: "median_imputation" }, { label: "Drop incomplete rows", value: "drop_rows" }, { label: "Backend-defined", value: "backend_defined" }]} /></div><div><label htmlFor="new-class-strategy" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Class imbalance strategy</label><Select id="new-class-strategy" value={classImbalanceStrategy} onChange={(event) => setClassImbalanceStrategy(event.target.value)} options={[{ label: "Balanced class weights", value: "balanced_class_weights" }, { label: "Resampling", value: "resampling" }, { label: "Backend-defined", value: "backend_defined" }]} /></div></div><div className="border-t border-charcoal bg-surface p-5 sm:p-7"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Operating assumptions</p><div className="mt-5 grid gap-5 sm:grid-cols-3 xl:grid-cols-1"><div><label htmlFor="new-threshold" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Classification threshold</label><Input id="new-threshold" type="number" min="0" max="1" step="0.01" value={classificationThreshold} onChange={(event) => setClassificationThreshold(event.target.value)} /></div><div><label htmlFor="new-fp-cost" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">FP cost weight</label><Input id="new-fp-cost" type="number" min="0" step="1" value={falsePositive} onChange={(event) => setFalsePositive(event.target.value)} /></div><div><label htmlFor="new-fn-cost" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">FN cost weight</label><Input id="new-fn-cost" type="number" min="0" step="1" value={falseNegative} onChange={(event) => setFalseNegative(event.target.value)} /></div></div><Button className="mt-7 w-full" type="submit"><Save aria-hidden="true" className="size-3.5" /> Save configuration</Button>{saved ? <p className="mt-4 text-sm leading-6 text-success">Configuration prepared locally. No backend execution was requested.</p> : null}</div></form></section>;
}

export { ExperimentCreation };

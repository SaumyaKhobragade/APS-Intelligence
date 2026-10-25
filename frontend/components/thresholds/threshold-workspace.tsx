"use client";

import * as React from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BusinessCostBreakdown } from "@/components/thresholds/business-cost-breakdown";
import { CalibrationChart } from "@/components/thresholds/calibration-chart";
import { ModelThresholdComparison } from "@/components/thresholds/model-threshold-comparison";
import { OperationalRecommendation } from "@/components/thresholds/operational-recommendation";
import { ThresholdConfusionMatrix } from "@/components/thresholds/threshold-confusion-matrix";
import { ThresholdControl } from "@/components/thresholds/threshold-control";
import { ThresholdMetrics } from "@/components/thresholds/threshold-metrics";
import { ThresholdPerformanceChart } from "@/components/thresholds/threshold-performance-chart";
import { ThresholdRecommendations } from "@/components/thresholds/threshold-recommendations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Select } from "@/components/ui/select";
import { getThresholdOptimizationSnapshot, getThresholdRecommendations, evaluateThreshold, cloneThresholdOptimizationSnapshot, defaultCostWeights } from "@/lib/threshold-mock-data";
import type { CostWeights, ThresholdOptimizationSnapshot, ThresholdRecommendation } from "@/types";

function clampThreshold(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function ThresholdWorkspace() {
  const [snapshot, setSnapshot] = React.useState<ThresholdOptimizationSnapshot>(() => getThresholdOptimizationSnapshot());
  const [selectedModelId, setSelectedModelId] = React.useState("xgboost");
  const [threshold, setThreshold] = React.useState(0.36);
  const [costWeights, setCostWeights] = React.useState<CostWeights>(() => ({ ...defaultCostWeights }));
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const selectedModel = snapshot.models.find((model) => model.modelId === selectedModelId) ?? snapshot.models[0];

  function selectModel(modelId: string) {
    const nextModel = snapshot.models.find((model) => model.modelId === modelId);
    setSelectedModelId(modelId);
    if (nextModel) setThreshold(nextModel.defaultThreshold);
  }

  function refreshWorkspace() {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setSnapshot(cloneThresholdOptimizationSnapshot(getThresholdOptimizationSnapshot(costWeights)));
      setIsRefreshing(false);
    }, 650);
  }

  if (!selectedModel) {
    return <AppShell><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10"><EmptyState title="No threshold evaluations" description="Threshold optimization artifacts are not available in the current demonstration snapshot." /></div></AppShell>;
  }

  const recommendations = getThresholdRecommendations(selectedModel, costWeights);
  const currentMetrics = evaluateThreshold(selectedModel, threshold, costWeights);
  const defaultMetrics = recommendations.default.metrics;

  function handleRecommendation(recommendation: ThresholdRecommendation) {
    setThreshold(recommendation.metrics.threshold);
  }

  return <AppShell onRefresh={refreshWorkspace} isRefreshing={isRefreshing} lastUpdated={snapshot.lastUpdated}><div className="mx-auto max-w-[1600px]"><section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Threshold Optimization sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#model-selection">01 / Model</a><a className="hover:text-signal" href="#threshold-control">02 / Control</a><a className="hover:text-signal" href="#threshold-metrics">03 / Metrics</a><a className="hover:text-signal" href="#threshold-confusion-matrix">04 / Errors</a><a className="hover:text-signal" href="#business-cost">05 / Cost</a><a className="hover:text-signal" href="#performance-curves">06 / Curves</a><a className="hover:text-signal" href="#threshold-recommendations">07 / Recommendations</a><a className="hover:text-signal" href="#calibration">09 / Calibration</a></nav><Button variant="ghost" size="sm" onClick={refreshWorkspace} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh evaluation</Button></div></section><section id="model-selection" className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model selection</p><h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Choose the artifact before the threshold.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">All four options use the same validation evaluation contract. PR-AUC remains the ranking lens; threshold-dependent metrics describe the chosen operating point.</p></div><div className="w-full xl:w-72"><label htmlFor="threshold-model" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Selected model</label><Select id="threshold-model" value={selectedModel.modelId} onChange={(event) => selectModel(event.target.value)} options={snapshot.models.map((model) => ({ label: model.modelName, value: model.modelId }))} /></div></div><div className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-6"><SelectionStat label="Model" value={selectedModel.modelName} /><SelectionStat label="Evaluation dataset" value={selectedModel.evaluationDataset} /><SelectionStat label="Current threshold" value={threshold.toFixed(2)} accent /><SelectionStat label="Default threshold" value={selectedModel.defaultThreshold.toFixed(2)} /><SelectionStat label="PR-AUC" value={selectedModel.prAuc.toFixed(3)} /><SelectionStat label="Calibration" value={selectedModel.calibrationStatusLabel} /></div><div className="mt-5 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted"><Badge variant="signal">Validation only</Badge><span>{snapshot.methodologyNote}</span></div></section><ThresholdControl model={selectedModel} threshold={threshold} recommendations={recommendations} onThresholdChange={(value) => setThreshold(clampThreshold(value))} onReset={() => setThreshold(selectedModel.defaultThreshold)} onSelectRecommendation={handleRecommendation} /><ThresholdMetrics metrics={currentMetrics} /><ThresholdConfusionMatrix metrics={currentMetrics} modelName={selectedModel.modelName} /><BusinessCostBreakdown metrics={currentMetrics} defaultMetrics={defaultMetrics} costWeights={costWeights} onCostWeightsChange={setCostWeights} /><ThresholdPerformanceChart model={{ ...selectedModel, recommendations }} selectedThreshold={threshold} costWeights={costWeights} /><ThresholdRecommendations model={selectedModel} recommendations={recommendations} selectedThreshold={threshold} onSelect={handleRecommendation} /><ModelThresholdComparison models={snapshot.models} costWeights={costWeights} selectedModelId={selectedModel.modelId} onSelectModel={selectModel} /><CalibrationChart model={selectedModel} /><OperationalRecommendation model={selectedModel} metrics={currentMetrics} /><section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Threshold optimization / end of view</p><p className="mt-2 text-sm text-ink">Freeze the selected validation threshold before final held-out test evaluation.</p></div><Button variant="outline" asChild><a href="#model-selection">Back to model <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section></div></AppShell>;
}

function SelectionStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="min-w-0 bg-canvas p-4 sm:p-5"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{label}</p><p className={`mt-2 truncate font-mono text-sm ${accent ? "text-signal" : "text-ink"}`}>{value}</p></div>;
}

export { ThresholdWorkspace };

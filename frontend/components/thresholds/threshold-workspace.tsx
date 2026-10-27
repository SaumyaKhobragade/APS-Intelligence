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
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { fetchThresholdSnapshot } from "@/services/threshold-service";
import type { CostWeights, ThresholdMetrics as ThresholdMetricsData, ThresholdModelEvaluation, ThresholdOptimizationSnapshot, ThresholdRecommendation } from "@/types";

function nearestMetrics(model: ThresholdModelEvaluation, threshold: number): ThresholdMetricsData {
  return model.thresholdCurve.reduce((closest, point) => Math.abs(point.threshold - threshold) < Math.abs(closest.threshold - threshold) ? point : closest, model.thresholdCurve[0]);
}

function ThresholdWorkspace() {
  const [snapshot, setSnapshot] = React.useState<ThresholdOptimizationSnapshot | null>(null);
  const [selectedModelId, setSelectedModelId] = React.useState<string>();
  const [threshold, setThreshold] = React.useState(0.5);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const next = await fetchThresholdSnapshot();
      setSnapshot(next);
      setSelectedModelId((current) => current && next.models.some((model) => model.modelId === current) ? current : next.models[0]?.modelId);
      if (next.models[0]) setThreshold(next.models[0].defaultThreshold);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Threshold analytics could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const selectedModel = snapshot?.models.find((model) => model.modelId === selectedModelId) ?? snapshot?.models[0];

  if (!isLoading && (error || !selectedModel || !snapshot)) return <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated="Threshold analytics unavailable"><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10">{error ? <ErrorState title="Threshold analytics unavailable" description={error} onRetry={() => void load()} /> : <EmptyState title="No persisted threshold analytics" description="No threshold, calibration or decision-policy artifacts are available for the active registry. The frozen candidate is not modified by this page." />}</div></AppShell>;
  if (!selectedModel || !snapshot) return <AppShell><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10"><p role="status" className="border border-line bg-surface px-6 py-10 text-center text-sm text-muted">Loading persisted threshold analytics…</p></div></AppShell>;

  const costWeights: CostWeights = selectedModel.costWeights ?? snapshot.costWeights;
  const currentMetrics = nearestMetrics(selectedModel, threshold);
  const defaultMetrics = nearestMetrics(selectedModel, selectedModel.defaultThreshold);
  function selectModel(modelId: string) {
    const model = snapshot!.models.find((candidate) => candidate.modelId === modelId);
    setSelectedModelId(modelId);
    if (model) setThreshold(model.defaultThreshold);
  }
  function selectRecommendation(recommendation: ThresholdRecommendation) {
    if (selectedModel?.readOnly) return;
    setThreshold(recommendation.metrics.threshold);
  }

  return <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated={snapshot.lastUpdated}><div className="mx-auto max-w-[1600px]">
    <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Threshold Optimization sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#model-selection">01 / Model</a><a className="hover:text-signal" href="#threshold-control">02 / Control</a><a className="hover:text-signal" href="#threshold-metrics">03 / Metrics</a><a className="hover:text-signal" href="#threshold-confusion-matrix">04 / Errors</a><a className="hover:text-signal" href="#business-cost">05 / Cost</a><a className="hover:text-signal" href="#performance-curves">06 / Curves</a><a className="hover:text-signal" href="#threshold-recommendations">07 / Recommendations</a><a className="hover:text-signal" href="#calibration">09 / Calibration</a></nav><Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh evaluation</Button></div></section>
    <section id="model-selection" className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10"><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model selection</p><h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Inspect persisted policy analytics.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Thresholds and calibration below are read-only validation artifacts. Controls do not modify the frozen candidate or its policy.</p></div><Badge variant="signal">{snapshot.models.length} persisted reference{snapshot.models.length === 1 ? "" : "s"}</Badge></div><div className="mt-8 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">{snapshot.models.map((model) => <button key={model.modelId} type="button" onClick={() => selectModel(model.modelId)} className={`bg-canvas p-4 text-left ${model.modelId === selectedModel.modelId ? "border-t-2 border-signal bg-signal-wash/40" : "border-t-2 border-transparent"}`}><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{model.modelName}</p><p className="mt-3 font-mono text-lg text-signal">{model.prAuc.toFixed(3)} PR-AUC</p><p className="mt-1 text-xs text-muted">{model.evaluationDataset}</p></button>)}</div></section>
    <ThresholdControl model={selectedModel} threshold={threshold} recommendations={selectedModel.recommendations} onThresholdChange={selectedModel.readOnly ? () => undefined : setThreshold} onReset={() => setThreshold(selectedModel.defaultThreshold)} onSelectRecommendation={selectRecommendation} readOnly={selectedModel.readOnly} />
    <ThresholdMetrics metrics={currentMetrics} />
    <ThresholdConfusionMatrix metrics={currentMetrics} modelName={selectedModel.modelName} />
    <BusinessCostBreakdown metrics={currentMetrics} defaultMetrics={defaultMetrics} costWeights={costWeights} onCostWeightsChange={() => undefined} readOnly />
    <ThresholdPerformanceChart model={selectedModel} selectedThreshold={threshold} />
    <ThresholdRecommendations model={selectedModel} recommendations={selectedModel.recommendations} selectedThreshold={threshold} onSelect={selectRecommendation} />
    <ModelThresholdComparison models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={selectModel} />
    <CalibrationChart model={selectedModel} />
    <OperationalRecommendation model={selectedModel} metrics={currentMetrics} />
    <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Threshold optimization / end of view</p><p className="mt-2 text-sm text-ink">{selectedModel.methodologyNote ?? "Persisted validation analytics"}</p></div><Button variant="outline" asChild><a href="#model-selection">Back to model selection <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
  </div></AppShell>;
}

export { ThresholdWorkspace };

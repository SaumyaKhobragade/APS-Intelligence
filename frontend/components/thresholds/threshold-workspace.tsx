"use client";

import * as React from "react";
import { AlertCircle, ArrowDown, RefreshCw } from "lucide-react";
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
import type { CostWeights, ThresholdCurvePoint, ThresholdModelEvaluation, ThresholdOptimizationSnapshot, ThresholdRecommendation } from "@/types";

function getExactCheckpoint(model: ThresholdModelEvaluation | undefined, targetThreshold: number): ThresholdCurvePoint | null {
  if (!model) {
    return null;
  }
  const points = model.thresholdCurve;
  if (!points || points.length === 0) {
    return null;
  }
  const targetKey = targetThreshold.toFixed(4);
  return points.find((pt) => pt.threshold.toFixed(4) === targetKey) ?? null;
}

function ThresholdWorkspace() {
  const [snapshot, setSnapshot] = React.useState<ThresholdOptimizationSnapshot | null>(null);
  const [selectedModelId, setSelectedModelId] = React.useState<string>();
  const [threshold, setThreshold] = React.useState(0.115);
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
  const [customCostWeights, setCustomCostWeights] = React.useState<CostWeights | null>(null);

  const selectedModel = snapshot?.models.find((model) => model.modelId === selectedModelId) ?? snapshot?.models[0];
  const costWeights: CostWeights = React.useMemo(() => {
    return customCostWeights ?? selectedModel?.costWeights ?? snapshot?.costWeights ?? { falsePositive: 1, falseNegative: 10 };
  }, [customCostWeights, selectedModel?.costWeights, snapshot?.costWeights]);

  const activeModel = React.useMemo(() => {
    if (!selectedModel) return null;
    if (!customCostWeights) return selectedModel;

    const fpWeight = costWeights.falsePositive;
    const fnWeight = costWeights.falseNegative;

    const updatedCurve = selectedModel.thresholdCurve.map((pt) => {
      const fpCost = pt.falsePositiveCount * fpWeight;
      const fnCost = pt.falseNegativeCount * fnWeight;
      return {
        ...pt,
        falsePositiveCost: fpCost,
        falseNegativeCost: fnCost,
        businessCost: fpCost + fnCost,
      };
    });

    const updateRec = (rec: ThresholdRecommendation): ThresholdRecommendation => {
      if (rec.isAvailable === false) return rec;
      const fpCost = rec.metrics.falsePositiveCount * fpWeight;
      const fnCost = rec.metrics.falseNegativeCount * fnWeight;
      return {
        ...rec,
        metrics: {
          ...rec.metrics,
          falsePositiveCost: fpCost,
          falseNegativeCost: fnCost,
          businessCost: fpCost + fnCost,
        },
      };
    };

    return {
      ...selectedModel,
      thresholdCurve: updatedCurve,
      costWeights,
      recommendations: {
        minimumCost: updateRec(selectedModel.recommendations.minimumCost),
        maximumF1: updateRec(selectedModel.recommendations.maximumF1),
        default: updateRec(selectedModel.recommendations.default),
      },
    };
  }, [selectedModel, customCostWeights, costWeights]);

  const currentCheckpoint = React.useMemo(() => {
    return activeModel ? getExactCheckpoint(activeModel, threshold) : null;
  }, [activeModel, threshold]);

  const frozenCheckpoint = React.useMemo(() => {
    return activeModel ? getExactCheckpoint(activeModel, activeModel.defaultThreshold) : null;
  }, [activeModel]);

  const activeSnapshotModels = React.useMemo(() => {
    if (!snapshot) return [];
    if (!customCostWeights) return snapshot.models;
    const fpWeight = costWeights.falsePositive;
    const fnWeight = costWeights.falseNegative;
    return snapshot.models.map((m) => {
      const updateRec = (rec: ThresholdRecommendation): ThresholdRecommendation => {
        if (rec.isAvailable === false) return rec;
        const fpCost = rec.metrics.falsePositiveCount * fpWeight;
        const fnCost = rec.metrics.falseNegativeCount * fnWeight;
        return {
          ...rec,
          metrics: {
            ...rec.metrics,
            falsePositiveCost: fpCost,
            falseNegativeCost: fnCost,
            businessCost: fpCost + fnCost,
          },
        };
      };
      return {
        ...m,
        costWeights,
        recommendations: {
          minimumCost: updateRec(m.recommendations.minimumCost),
          maximumF1: updateRec(m.recommendations.maximumF1),
          default: updateRec(m.recommendations.default),
        },
      };
    });
  }, [snapshot, customCostWeights, costWeights]);

  if (!isLoading && (error || !selectedModel || !snapshot)) {
    return (
      <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated="Threshold analytics unavailable">
        <div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10">
          {error ? <ErrorState title="Threshold analytics unavailable" description={error} onRetry={() => void load()} /> : <EmptyState title="No persisted threshold analytics" description="No threshold, calibration or decision-policy artifacts are available for the active registry. The frozen candidate is not modified by this page." />}
        </div>
      </AppShell>
    );
  }

  if (!selectedModel || !snapshot) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10">
          <p role="status" className="border border-line bg-surface px-6 py-10 text-center text-sm text-muted">Loading persisted threshold analytics…</p>
        </div>
      </AppShell>
    );
  }

  function selectModel(modelId: string) {
    const model = snapshot!.models.find((candidate) => candidate.modelId === modelId);
    setSelectedModelId(modelId);
    setCustomCostWeights(null);
    if (model) setThreshold(model.defaultThreshold);
  }

  function selectRecommendation(recommendation: ThresholdRecommendation) {
    setThreshold(recommendation.metrics.threshold);
  }

  function handleReset() {
    if (selectedModel) {
      setThreshold(selectedModel.defaultThreshold);
    }
    setCustomCostWeights(null);
  }

  return (
    <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated={snapshot.lastUpdated}>
      <div className="mx-auto max-w-[1600px]">
        <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Threshold Optimization sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <a className="hover:text-signal" href="#model-selection">01 / Model</a>
              <a className="hover:text-signal" href="#threshold-control">02 / Control</a>
              <a className="hover:text-signal" href="#threshold-metrics">03 / Metrics</a>
              <a className="hover:text-signal" href="#threshold-confusion-matrix">04 / Errors</a>
              <a className="hover:text-signal" href="#business-cost">05 / Cost</a>
              <a className="hover:text-signal" href="#performance-curves">06 / Curves</a>
              <a className="hover:text-signal" href="#threshold-recommendations">07 / Recommendations</a>
              <a className="hover:text-signal" href="#model-threshold-comparison">08 / Comparison</a>
              <a className="hover:text-signal" href="#calibration">09 / Calibration</a>
              <a className="hover:text-signal" href="#operational-recommendation">10 / Decision support</a>
            </nav>
            <Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={isRefreshing}>
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh evaluation
            </Button>
          </div>
        </section>

        <section id="model-selection" className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model selection</p>
              <h2 id="model-selection-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Inspect persisted policy analytics.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
                Thresholds and calibration below reflect offline validation evidence. Candidate evaluation policy is frozen at threshold 0.115 (selected via internal OOF evidence, evaluated on external validation). Candidate is not production approved.
              </p>
            </div>
            <Badge variant="signal">{snapshot.models.length} persisted reference{snapshot.models.length === 1 ? "" : "s"}</Badge>
          </div>
          <div className="mt-8 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {snapshot.models.map((model) => (
              <button
                key={model.modelId}
                type="button"
                onClick={() => selectModel(model.modelId)}
                className={`bg-canvas p-4 text-left ${model.modelId === selectedModel.modelId ? "border-t-2 border-signal bg-signal-wash/40" : "border-t-2 border-transparent"}`}
              >
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{model.modelName}</p>
                <p className="mt-3 font-mono text-lg text-signal">{model.prAuc.toFixed(3)} PR-AUC</p>
                <p className="mt-1 text-xs text-muted">{model.evaluationDataset}</p>
              </button>
            ))}
          </div>
        </section>

        <ThresholdControl
          model={activeModel ?? selectedModel}
          threshold={threshold}
          recommendations={(activeModel ?? selectedModel).recommendations}
          onThresholdChange={setThreshold}
          onReset={handleReset}
          onSelectRecommendation={selectRecommendation}
          readOnly={false}
        />

        {!currentCheckpoint ? (
          <section className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <AlertCircle aria-hidden="true" className="size-4 text-signal" />
                  <p className="font-mono text-xs uppercase tracking-wider font-semibold text-signal">
                    Non-persisted threshold: {threshold.toFixed(3)}
                  </p>
                </div>
                <p className="mt-2 text-sm text-ink max-w-2xl leading-6">
                  Selected threshold does not match any exact persisted checkpoint. Nearest-point fallback is disabled to preserve scientific evidence integrity.
                </p>
              </div>
              {frozenCheckpoint ? (
                <Button size="sm" onClick={handleReset}>
                  Return to frozen evaluation policy ({selectedModel.defaultThreshold.toFixed(3)})
                </Button>
              ) : (
                <Badge variant="neutral">Frozen evaluation policy unavailable</Badge>
              )}
            </div>
          </section>
        ) : (
          <>
            <ThresholdMetrics metrics={currentCheckpoint} scope={currentCheckpoint.scope} scopeLabel={currentCheckpoint.scopeLabel} />
            <ThresholdConfusionMatrix metrics={currentCheckpoint} modelName={selectedModel.modelName} scope={currentCheckpoint.scope} scopeLabel={currentCheckpoint.scopeLabel} />
            {frozenCheckpoint ? (
              <BusinessCostBreakdown
                metrics={currentCheckpoint}
                defaultMetrics={frozenCheckpoint}
                costWeights={costWeights}
                onCostWeightsChange={setCustomCostWeights}
                readOnly={false}
              />
            ) : null}
            <ThresholdPerformanceChart
              model={activeModel ?? selectedModel}
              selectedThreshold={currentCheckpoint.threshold}
              costWeights={costWeights}
              isCustomWeights={Boolean(customCostWeights)}
            />
            <ThresholdRecommendations
              model={activeModel ?? selectedModel}
              recommendations={(activeModel ?? selectedModel).recommendations}
              selectedThreshold={currentCheckpoint.threshold}
              selectedScope={currentCheckpoint.scope}
              onSelect={selectRecommendation}
            />
            <ModelThresholdComparison models={activeSnapshotModels} selectedModelId={selectedModel.modelId} onSelectModel={selectModel} />
            <CalibrationChart model={activeModel ?? selectedModel} />
            <OperationalRecommendation model={activeModel ?? selectedModel} metrics={currentCheckpoint} scope={currentCheckpoint.scope} />
          </>
        )}

        <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Threshold optimization / end of view</p>
            <p className="mt-2 text-sm text-ink">{selectedModel.methodologyNote ?? "Persisted validation analytics"}</p>
          </div>
          <Button variant="outline" asChild>
            <a href="#model-selection">Back to model selection <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a>
          </Button>
        </section>
      </div>
    </AppShell>
  );
}

export { ThresholdWorkspace };

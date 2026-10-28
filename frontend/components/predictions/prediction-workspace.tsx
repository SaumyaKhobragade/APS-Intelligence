"use client";

import * as React from "react";
import { Activity, ArrowDown, BrainCircuit, CheckCircle2, DollarSign, FileSpreadsheet, RefreshCw, SlidersHorizontal } from "lucide-react";
import { BatchUpload } from "@/components/predictions/batch-upload";
import { BusinessImpactPanel } from "@/components/predictions/business-impact-panel";
import { DiagnosticAnalysis } from "@/components/predictions/diagnostic-analysis";
import { ModelSelector } from "@/components/predictions/model-selector";
import { PredictionHistory } from "@/components/predictions/prediction-history";
import { PredictionResultPanel } from "@/components/predictions/prediction-result";
import { SensorInputForm } from "@/components/predictions/sensor-input-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { AppShell } from "@/components/layout/app-shell";
import { downloadPredictionHistoryCsv, fetchFeatureSchema, fetchPredictionHistory, fetchPredictionModels, predictBatch, predictSingle, type PredictionReference } from "@/services/prediction-service";
import type { PredictionModelOption, PredictionResult, SensorFeatureDefinition } from "@/types";

type PredictionMode = "single" | "batch";

function PredictionWorkspace() {
  const [mode, setMode] = React.useState<PredictionMode>("single");
  const [models, setModels] = React.useState<PredictionModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = React.useState<string>();
  const [features, setFeatures] = React.useState<SensorFeatureDefinition[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<PredictionResult>();
  const [history, setHistory] = React.useState<PredictionResult[]>([]);
  const [readings, setReadings] = React.useState<Record<string, number | null>>({});

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [availableModels, predictionHistory] = await Promise.all([fetchPredictionModels(), fetchPredictionHistory()]);
      setModels(availableModels);
      setHistory(predictionHistory);
      const firstAvailable = availableModels.find((model) => model.availability === "available");
      setSelectedModelId((current) => availableModels.some((model) => model.modelId === current) ? current : firstAvailable?.modelId ?? availableModels[0]?.modelId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Prediction availability could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selectedModel = models.find((model) => model.modelId === selectedModelId);
  const selectedReference = React.useMemo(() => selectedModel ? modelReference(selectedModel) : undefined, [selectedModel]);

  React.useEffect(() => {
    if (!selectedReference || selectedModel?.availability !== "available") {
      const timer = window.setTimeout(() => setFeatures([]), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      setError(null);
      void fetchFeatureSchema(selectedReference).then((nextFeatures) => {
        setFeatures(nextFeatures);
        setReadings(Object.fromEntries(nextFeatures.map((feature) => [feature.id, null])));
      }).catch((schemaError) => setError(schemaError instanceof Error ? schemaError.message : "The selected model feature schema could not be loaded."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedModel?.availability, selectedReference]);

  async function handleSingleSubmit(nextReadings: Record<string, number | null>) {
    if (!selectedModel || selectedModel.availability !== "available" || !selectedReference) return;
    setReadings(nextReadings);
    setIsProcessing(true);
    setError(null);
    try {
      const nextResult = await predictSingle({ modelId: selectedModel.modelId, readings: nextReadings }, selectedReference);
      setResult(nextResult);
      setHistory((current) => [nextResult, ...current]);
    } catch (predictionError) {
      setError(predictionError instanceof Error ? predictionError.message : "The prediction request failed; no result was created.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBatchProcessed(file: File) {
    if (!selectedModel || selectedModel.availability !== "available" || !selectedReference) return;
    setIsProcessing(true);
    setError(null);
    try {
      const records = await parseBatchFile(file, features.map((feature) => feature.id));
      const response = await predictBatch({ ...selectedReference, records });
      if (response.firstPrediction) {
        setResult(response.firstPrediction);
        setHistory((current) => [response.firstPrediction as PredictionResult, ...current]);
      }
    } catch (predictionError) {
      setError(predictionError instanceof Error ? predictionError.message : "The batch prediction request failed; no result was created.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleSelectHistory(record: PredictionResult) {
    setResult(record);
    setMode(record.source === "batch" ? "batch" : "single");
  }

  function refreshWorkspace() {
    setResult(undefined);
    void load();
  }

  const isModelAvailable = selectedModel?.availability === "available" && features.length > 0;

  return (
    <AppShell onRefresh={refreshWorkspace} isRefreshing={isLoading} lastUpdated={isLoading ? "Loading prediction availability" : "Persisted backend prediction state"}>
      <div className="mx-auto max-w-[1600px]">
        <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Failure Prediction sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <a className="hover:text-signal" href="#model-selection">01 / Model</a>
              <a className="hover:text-signal" href="#single-prediction">02 / Single row</a>
              <a className="hover:text-signal" href="#batch-prediction">03 / Batch</a>
              <a className="hover:text-signal" href="#prediction-result">04 / Result</a>
              <a className="hover:text-signal" href="#diagnostics">05 / Diagnostics</a>
              <a className="hover:text-signal" href="#operational-impact">06 / Impact</a>
              <a className="hover:text-signal" href="#prediction-history">07 / History</a>
            </nav>
            <Button variant="ghost" size="sm" onClick={refreshWorkspace} disabled={isLoading}>
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh availability
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="flex items-center gap-2 text-sm text-ink">
            <BrainCircuit aria-hidden="true" className="size-4 text-signal" /> Primary operational workspace / backend inference
          </p>
          <Badge variant={isModelAvailable ? "success" : "neutral"}>
            {isModelAvailable ? "Production inference active" : "Registry safeguard: Unpromoted candidate"}
          </Badge>
        </section>

        {error ? (
          <div className="mx-5 my-6 sm:mx-8 lg:mx-10">
            <ErrorState title="Prediction request unavailable" description={error} onRetry={() => void load()} />
          </div>
        ) : null}

        <ModelSelector models={models} selectedModelId={selectedModelId ?? ""} onSelectModel={setSelectedModelId} />

        {!isLoading && !isModelAvailable ? (
          <div className="border-b border-line bg-surface px-5 py-6 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Lifecycle Safeguard Active</p>
                <h3 className="mt-1 font-display text-2xl text-ink">Inference Gated / Unpromoted Candidate</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                  {selectedModel?.availabilityNote ?? "The active model registry requires an approved model and promoted decision policy for live inference. In accordance with Phase 9 validation controls, candidate models are not automatically promoted to production."}
                </p>
              </div>
              <Badge variant="neutral">Production Promotion Required</Badge>
            </div>
          </div>
        ) : null}

        {isModelAvailable ? (
          <>
            <section className="border-b border-line px-5 py-8 sm:px-8 lg:px-10">
              <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
                <Button variant={mode === "single" ? "default" : "ghost"} size="sm" onClick={() => setMode("single")} aria-pressed={mode === "single"}>Single truck</Button>
                <Button variant={mode === "batch" ? "default" : "ghost"} size="sm" onClick={() => setMode("batch")} aria-pressed={mode === "batch"}>Batch CSV</Button>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{selectedModel.referenceType} / {selectedModel.referenceId}</span>
              </div>
            </section>
            {mode === "single" ? (
              <SensorInputForm features={features} isProcessing={isProcessing} onSubmit={handleSingleSubmit} />
            ) : (
              <BatchUpload expectedFeatureIds={features.map((feature) => feature.id)} isProcessing={isProcessing} onProcessed={handleBatchProcessed} />
            )}
            <PredictionResultPanel result={result} />
            <DiagnosticAnalysis result={result} readings={readings} />
            <BusinessImpactPanel result={result} />
          </>
        ) : (
          <div className="space-y-0">
            {/* 02 / Single row preview specification */}
            <section id="single-prediction" aria-labelledby="single-spec-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Single truck prediction</p>
                  <h2 id="single-spec-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Single-Record Sensor Input Contract</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Input contract requires 170 numerical sensor features (anonymized prefix groups `aa_000` through `eg_000`). Missing values are accepted as null and handled via candidate imputation.</p>
                </div>
                <Badge variant="neutral"><SlidersHorizontal aria-hidden="true" className="size-3" /> 170 features required</Badge>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Schema validation</p>
                  <p className="mt-2 text-sm text-ink">170 floating-point sensor signals. Non-numeric or out-of-spec inputs fail fast at API boundary.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Missingness handling</p>
                  <p className="mt-2 text-sm text-ink">Partial records are supported; median training-set imputation aligns with offline candidate pipeline.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Inference policy</p>
                  <p className="mt-2 text-sm text-ink">Evaluated at frozen decision threshold 0.115 with isotonic probability calibration.</p>
                </div>
              </div>
            </section>

            {/* 03 / Batch prediction preview specification */}
            <section id="batch-prediction" aria-labelledby="batch-spec-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Batch prediction</p>
                  <h2 id="batch-spec-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Fleet-Scale Batch Input Contract</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Batch processing ingests CSV files containing vehicle telemetry rows. Header columns must match APS schema naming.</p>
                </div>
                <Badge variant="neutral"><FileSpreadsheet aria-hidden="true" className="size-3" /> CSV / 1,000 rows max</Badge>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Batch throughput</p>
                  <p className="mt-2 text-sm text-ink">Vectorized batch scoring executes sub-second inference across 1,000 telemetry records.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">File size limits</p>
                  <p className="mt-2 text-sm text-ink">Accepts up to 100 MB standard CSV files with raw sensor telemetry data.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Result export</p>
                  <p className="mt-2 text-sm text-ink">Generates row-level failure probabilities, classification flags, and audit timestamps.</p>
                </div>
              </div>
            </section>

            {/* 04 / Prediction result specification */}
            <section id="prediction-result" aria-labelledby="result-spec-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">04 / Prediction result</p>
                  <h2 id="result-spec-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Calibrated Output & Decision Schema</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Each scored record yields an isotonic-calibrated failure probability compared against frozen threshold 0.115.</p>
                </div>
                <Badge variant="neutral"><CheckCircle2 aria-hidden="true" className="size-3" /> Binary classification</Badge>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Prediction classification</p>
                  <p className="mt-2 text-sm text-ink">`APS Failure` if P ≥ 0.115, otherwise `Normal` healthy state.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Probability calibration</p>
                  <p className="mt-2 text-sm text-ink">Isotonic regression maps raw tree margin scores to true empirical failure risk.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Audit traceability</p>
                  <p className="mt-2 text-sm text-ink">Every prediction is stamped with an immutable ID, timestamp, and model reference.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Decision policy</p>
                  <p className="mt-2 text-sm text-ink">Frozen minimum-cost policy threshold tuned on validation cross-validation split.</p>
                </div>
              </div>
            </section>

            {/* 05 / Diagnostics specification */}
            <section id="diagnostics" aria-labelledby="diag-spec-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Diagnostic analysis</p>
                  <h2 id="diag-spec-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Sensor Deviation & Root-Cause Signals</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Anomalous sensor readings are ranked against training set quantile baselines to highlight failure drivers.</p>
                </div>
                <Badge variant="neutral"><Activity aria-hidden="true" className="size-3" /> Telemetry diagnostics</Badge>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Quantile anomaly ranking</p>
                  <p className="mt-2 text-sm text-ink">Detects readings falling beyond the 95th or 99th percentile of healthy fleet baseline.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Top contributing features</p>
                  <p className="mt-2 text-sm text-ink">Weighted by candidate model feature importance to prioritize workshop inspection.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Actionable recommendation</p>
                  <p className="mt-2 text-sm text-ink">Distinguishes immediate maintenance intervention from routine service scheduling.</p>
                </div>
              </div>
            </section>

            {/* 06 / Operational impact specification */}
            <section id="operational-impact" aria-labelledby="impact-spec-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
              <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">06 / Operational impact</p>
                  <h2 id="impact-spec-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Asymmetric Cost Function & Economics</h2>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Cost matrix weights false alarms against catastrophic breakdowns to optimize fleet maintenance spend.</p>
                </div>
                <Badge variant="neutral"><DollarSign aria-hidden="true" className="size-3" /> Cost ratio 10:1</Badge>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">False Positive (Type I)</p>
                  <p className="mt-2 text-xl font-mono text-ink">1 unit weight per inspection</p>
                  <p className="mt-1 text-xs text-muted">Routine shop inspection check for unnecessary maintenance alert.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">False Negative (Type II)</p>
                  <p className="mt-2 text-xl font-mono text-signal">10 units weight per breakdown</p>
                  <p className="mt-1 text-xs text-muted">Unplanned roadside failure requiring towing, cargo disruption, and repair.</p>
                </div>
                <div className="border border-line bg-surface p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Optimal Operating Point</p>
                  <p className="mt-2 text-xl font-mono text-ink">Threshold 0.115</p>
                  <p className="mt-1 text-xs text-muted">Minimizes illustrative cost across evaluation datasets (1×FP + 10×FN).</p>
                </div>
              </div>
            </section>
          </div>
        )}

        <PredictionHistory
          records={history}
          models={models}
          selectedPredictionId={result?.predictionId}
          onSelectPrediction={handleSelectHistory}
          onExportCsv={downloadPredictionHistoryCsv}
        />

        <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Prediction workspace / end of view</p>
            <p className="mt-2 text-sm text-ink">Inference is gated by the backend registry and does not create a result when unavailable.</p>
          </div>
          <Button variant="outline" asChild>
            <a href="#model-selection">
              Back to model selection <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" />
            </a>
          </Button>
        </section>
      </div>
    </AppShell>
  );
}

function modelReference(model: PredictionModelOption): PredictionReference {
  return model.referenceType === "experiment" ? { experimentId: model.referenceId, decisionPolicyId: model.policyId } : { modelRunId: model.referenceId, decisionPolicyId: model.policyId };
}

async function parseBatchFile(file: File, featureIds: string[]): Promise<Array<{ features: Record<string, number | null> }>> {
  const lines = (await file.text()).trim().split(/\r?\n/).filter(Boolean);
  const headers = (lines[0] ?? "").split(",").map((header) => header.trim());
  return lines.slice(1, 1001).map((line) => {
    const values = line.split(",");
    const features = Object.fromEntries(featureIds.map((featureId) => {
      const index = headers.indexOf(featureId);
      const raw = index >= 0 ? values[index]?.trim() ?? "" : "";
      return [featureId, raw === "" || raw.toLowerCase() === "na" ? null : Number(raw)];
    }));
    return { features };
  });
}

export { PredictionWorkspace };

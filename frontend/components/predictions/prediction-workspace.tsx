"use client";

import * as React from "react";
import { ArrowDown, BrainCircuit, RefreshCw } from "lucide-react";
import { BatchUpload } from "@/components/predictions/batch-upload";
import { BusinessImpactPanel } from "@/components/predictions/business-impact-panel";
import { DiagnosticAnalysis } from "@/components/predictions/diagnostic-analysis";
import { ModelSelector } from "@/components/predictions/model-selector";
import { PredictionHistory } from "@/components/predictions/prediction-history";
import { PredictionResultPanel } from "@/components/predictions/prediction-result";
import { SensorInputForm } from "@/components/predictions/sensor-input-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
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

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

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

  function handleSelectHistory(record: PredictionResult) { setResult(record); setMode(record.source === "batch" ? "batch" : "single"); }
  function refreshWorkspace() { setResult(undefined); void load(); }

  return <AppShell onRefresh={refreshWorkspace} isRefreshing={isLoading} lastUpdated={isLoading ? "Loading prediction availability" : "Persisted backend prediction state"}>
    <div className="mx-auto max-w-[1600px]">
      <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Failure Prediction sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#model-selection">01 / Model</a><a className="hover:text-signal" href="#single-prediction">02 / Single row</a><a className="hover:text-signal" href="#batch-prediction">03 / Batch</a><a className="hover:text-signal" href="#prediction-result">04 / Result</a><a className="hover:text-signal" href="#diagnostics">05 / Diagnostics</a><a className="hover:text-signal" href="#operational-impact">06 / Impact</a><a className="hover:text-signal" href="#prediction-history">07 / History</a></nav><Button variant="ghost" size="sm" onClick={refreshWorkspace} disabled={isLoading}><RefreshCw aria-hidden="true" className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh availability</Button></div></section>
      <section className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><p className="flex items-center gap-2 text-sm text-ink"><BrainCircuit aria-hidden="true" className="size-4 text-signal" /> Primary operational workspace / backend inference</p><Badge variant={selectedModel?.availability === "available" ? "success" : "signal"}>{selectedModel?.availability === "available" ? "Approved inference available" : "Not-yet-approved inference"}</Badge></section>
      {error ? <div className="mx-5 my-6 sm:mx-8 lg:mx-10"><ErrorState title="Prediction request unavailable" description={error} onRetry={() => void load()} /></div> : null}
      <ModelSelector models={models} selectedModelId={selectedModelId ?? ""} onSelectModel={setSelectedModelId} />
      {!isLoading && (!selectedModel || selectedModel.availability !== "available") ? <section className="border-b border-line px-5 py-10 sm:px-8 lg:px-10"><EmptyState title="Inference is not available" description={selectedModel?.availabilityNote ?? "No approved model and active decision policy pair is registered in the active application registry. The Phase 9 validation candidate is not promoted automatically."} /></section> : null}
      {selectedModel?.availability === "available" && features.length ? <>
        <section className="border-b border-line px-5 py-8 sm:px-8 lg:px-10"><div className="flex flex-wrap items-center gap-2 border-b border-line pb-4"><Button variant={mode === "single" ? "default" : "ghost"} size="sm" onClick={() => setMode("single")} aria-pressed={mode === "single"}>Single truck</Button><Button variant={mode === "batch" ? "default" : "ghost"} size="sm" onClick={() => setMode("batch")} aria-pressed={mode === "batch"}>Batch CSV</Button><span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{selectedModel.referenceType} / {selectedModel.referenceId}</span></div></section>
         {mode === "single" ? <SensorInputForm features={features} isProcessing={isProcessing} onSubmit={handleSingleSubmit} /> : <BatchUpload expectedFeatureIds={features.map((feature) => feature.id)} isProcessing={isProcessing} onProcessed={handleBatchProcessed} />}
        <PredictionResultPanel result={result} />
        <DiagnosticAnalysis result={result} readings={readings} />
        <BusinessImpactPanel result={result} />
      </> : null}
      <PredictionHistory records={history} models={models} selectedPredictionId={result?.predictionId} onSelectPrediction={handleSelectHistory} onExportCsv={downloadPredictionHistoryCsv} />
      <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Prediction workspace / end of view</p><p className="mt-2 text-sm text-ink">Inference is gated by the backend registry and does not create a result when unavailable.</p></div><Button variant="outline" asChild><a href="#model-selection">Back to model selection <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
    </div>
  </AppShell>;
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

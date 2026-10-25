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
import { AppShell } from "@/components/layout/app-shell";
import { createDemonstrationPrediction, getDemonstrationPredictionHistory, demonstrationPredictionModels, sensorFeatureDefinitions, APS_SENSOR_FEATURE_IDS } from "@/lib/prediction-mock-data";
import type { BatchUploadSummary, PredictionResult } from "@/types";

type PredictionMode = "single" | "batch";

function PredictionWorkspace() {
  const [mode, setMode] = React.useState<PredictionMode>("single");
  const [selectedModelId, setSelectedModelId] = React.useState("xgboost");
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [result, setResult] = React.useState<PredictionResult>();
  const [history, setHistory] = React.useState<PredictionResult[]>(() => getDemonstrationPredictionHistory());
  const [readings, setReadings] = React.useState<Record<string, number | null>>(() => Object.fromEntries(APS_SENSOR_FEATURE_IDS.map((featureId) => [featureId, null])));

  function handleSingleSubmit(nextReadings: Record<string, number | null>) {
    setReadings(nextReadings); setIsProcessing(true);
    window.setTimeout(() => { const missingCount = Object.values(nextReadings).filter((value) => value === null).length; const nextResult = createDemonstrationPrediction(selectedModelId, "single", missingCount); setResult(nextResult); setHistory((current) => [nextResult, ...current]); setIsProcessing(false); }, 850);
  }

  function handleBatchProcessed(summary: BatchUploadSummary) {
    const nextResult = createDemonstrationPrediction(selectedModelId, "batch", summary.missingFeatureCount, summary.rowCount); setResult(nextResult); setHistory((current) => [nextResult, ...current]);
  }

  function handleSelectHistory(record: PredictionResult) { setResult(record); setMode(record.source === "batch" ? "batch" : "single"); }

  function refreshWorkspace() { setResult(undefined); setHistory(getDemonstrationPredictionHistory()); }

  const selectedModel = demonstrationPredictionModels.find((model) => model.modelId === selectedModelId) ?? demonstrationPredictionModels[0];
  return <AppShell onRefresh={refreshWorkspace} lastUpdated="Demo workspace / static response layer"><div className="mx-auto max-w-[1600px]"><section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Failure Prediction sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#model-selection">01 / Model</a><a className="hover:text-signal" href="#single-prediction">02 / Single row</a><a className="hover:text-signal" href="#batch-prediction">03 / Batch</a><a className="hover:text-signal" href="#prediction-result">04 / Result</a><a className="hover:text-signal" href="#diagnostics">05 / Diagnostics</a><a className="hover:text-signal" href="#operational-impact">06 / Impact</a><a className="hover:text-signal" href="#prediction-history">07 / History</a></nav><Button variant="ghost" size="sm" onClick={refreshWorkspace}><RefreshCw aria-hidden="true" className="size-3.5" /> Reset demo workspace</Button></div></section><section className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><p className="flex items-center gap-2 text-sm text-ink"><BrainCircuit aria-hidden="true" className="size-4 text-signal" /> Primary operational workspace / simulated inference</p><Badge variant="signal">No backend request made</Badge></section><ModelSelector models={demonstrationPredictionModels} selectedModelId={selectedModelId} onSelectModel={setSelectedModelId} /><section className="border-b border-line px-5 py-8 sm:px-8 lg:px-10"><div className="flex flex-wrap items-center gap-2 border-b border-line pb-4"><Button variant={mode === "single" ? "default" : "ghost"} size="sm" onClick={() => setMode("single")} aria-pressed={mode === "single"}>Single truck</Button><Button variant={mode === "batch" ? "default" : "ghost"} size="sm" onClick={() => setMode("batch")} aria-pressed={mode === "batch"}>Batch CSV</Button><span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{mode === "single" ? "one anonymized sensor row" : "multiple truck records"}</span></div><div className="mt-5 flex items-start gap-3"><ArrowDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" /><p className="max-w-2xl text-sm leading-6 text-muted">Choose a model first, then submit a single row or stage a batch. The probability and threshold are kept separate from the final predicted class.</p></div></section>{mode === "single" ? <SensorInputForm features={sensorFeatureDefinitions} isProcessing={isProcessing} onSubmit={handleSingleSubmit} /> : <BatchUpload expectedFeatureIds={APS_SENSOR_FEATURE_IDS} isProcessing={isProcessing} modelName={selectedModel.modelName} threshold={selectedModel.defaultThreshold} onProcessed={handleBatchProcessed} />}<PredictionResultPanel result={result} />{result ? <><DiagnosticAnalysis result={result} readings={readings} /><BusinessImpactPanel result={result} /></> : null}<PredictionHistory records={history} models={demonstrationPredictionModels} selectedPredictionId={result?.predictionId} onSelectPrediction={handleSelectHistory} /><section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Failure prediction / end of view</p><p className="mt-2 text-sm text-ink">Use threshold optimization next when the backend exposes calibrated evaluation and inference contracts.</p></div><Button variant="outline" asChild><a href="#model-selection">Back to model <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section></div></AppShell>;
}

export { PredictionWorkspace };

"use client";

import * as React from "react";
import { ArrowDown, BrainCircuit, RefreshCw, ShieldAlert } from "lucide-react";
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
import {
  CANONICAL_APS_FEATURES,
  downloadPredictionHistoryCsv,
  fetchFeatureSchema,
  fetchPredictionHistory,
  fetchPredictionModels,
  predictBatch,
  predictSingle,
  type PredictionReference,
} from "@/services/prediction-service";
import type { BatchPredictionResponse, PredictionModelOption, PredictionResult, SensorFeatureDefinition } from "@/types";

type PredictionMode = "single" | "batch";

function PredictionWorkspace() {
  const [mode, setMode] = React.useState<PredictionMode>("single");
  const [models, setModels] = React.useState<PredictionModelOption[]>([
    {
      modelId: "experiment:phase9-final-validation-candidate",
      modelName: "CatBoost / phase9.1.0 (Validation Candidate)",
      availability: "not_loaded",
      availabilityNote:
        "Candidate model is unapproved (promotions: 0). Production promotion required for live inference.",
      defaultThreshold: 0.115,
      referenceType: "experiment",
      referenceId: "phase9-final-validation-candidate",
      featureCount: 170,
      policyId: undefined,
    },
  ]);
  const [selectedModelId, setSelectedModelId] = React.useState<string>(
    "experiment:phase9-final-validation-candidate"
  );
  const [features, setFeatures] = React.useState<SensorFeatureDefinition[]>(() =>
    CANONICAL_APS_FEATURES.map((id, order) => ({
      id,
      order,
      group: id.split("_")[0] ?? "other",
    }))
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<PredictionResult>();
  const [batchResult, setBatchResult] = React.useState<BatchPredictionResponse>();
  const [history, setHistory] = React.useState<PredictionResult[]>([]);
  const [readings, setReadings] = React.useState<Record<string, number | null>>(() =>
    Object.fromEntries(CANONICAL_APS_FEATURES.map((id) => [id, null]))
  );

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [availableModels, predictionHistory] = await Promise.all([
        fetchPredictionModels(),
        fetchPredictionHistory().catch(() => []),
      ]);
      setModels(availableModels);
      setHistory(predictionHistory);
      setSelectedModelId((current) => {
        if (current && availableModels.some((m) => m.modelId === current)) return current;
        const firstAvailable = availableModels.find((m) => m.availability === "available");
        return firstAvailable?.modelId ?? availableModels[0]?.modelId;
      });
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
  const selectedReference = React.useMemo(() => (selectedModel ? modelReference(selectedModel) : undefined), [selectedModel]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchFeatureSchema(selectedReference)
        .then((nextFeatures) => {
          setFeatures(nextFeatures);
          setReadings((prev) => {
            if (Object.keys(prev).length === nextFeatures.length) return prev;
            return Object.fromEntries(nextFeatures.map((f) => [f.id, null]));
          });
        })
        .catch((schemaError) => {
          setError(schemaError instanceof Error ? schemaError.message : "Feature schema could not be loaded.");
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedReference]);

  async function handleSingleSubmit(nextReadings: Record<string, number | null>) {
    if (!selectedModel || !selectedReference || isProcessing) return;
    setReadings(nextReadings);
    setIsProcessing(true);
    setError(null);

    try {
      if (selectedModel.availability !== "available") {
        try {
          await predictSingle({ modelId: selectedModel.modelId, readings: nextReadings }, selectedReference);
        } catch (apiError) {
          const detail = apiError instanceof Error ? apiError.message : String(apiError);
          setError(
            `Inference blocked: The model '${selectedModel.modelName}' is an unapproved validation candidate (promotions: 0). Backend safeguards require an approved model and promoted decision policy for live predictions. API response: ${detail}`
          );
          return;
        }
      }

      const nextResult = await predictSingle({ modelId: selectedModel.modelId, readings: nextReadings }, selectedReference);
      setResult(nextResult);
      setHistory((current) => [nextResult, ...current]);
    } catch (predictionError) {
      setError(predictionError instanceof Error ? predictionError.message : "The prediction request failed.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleBatchProcessed(records: Array<{ features: Record<string, number | null> }>) {
    if (!selectedModel || !selectedReference || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (selectedModel.availability !== "available") {
        try {
          await predictBatch({ ...selectedReference, records });
        } catch (apiError) {
          const detail = apiError instanceof Error ? apiError.message : String(apiError);
          const blockedMsg = `Batch inference blocked: Candidate model '${selectedModel.modelName}' is unapproved (promotions: 0). Backend safeguards prevent live predictions until production promotion. API response: ${detail}`;
          setError(blockedMsg);
          throw new Error(blockedMsg);
        }
      }

      const response = await predictBatch({ ...selectedReference, records });
      setBatchResult(response);
      if (response.firstPrediction) {
        setResult(response.firstPrediction);
        setHistory((current) => [response.firstPrediction as PredictionResult, ...current]);
      }
      return response;
    } catch (predictionError) {
      const msg = predictionError instanceof Error ? predictionError.message : "The batch prediction request failed.";
      setError(msg);
      throw predictionError;
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
    setBatchResult(undefined);
    void load();
  }

  const isModelApproved = selectedModel?.availability === "available";

  return (
    <AppShell
      onRefresh={refreshWorkspace}
      isRefreshing={isLoading}
      lastUpdated={isLoading ? "Loading prediction availability" : "Persisted backend prediction state"}
    >
      <div className="mx-auto max-w-[1600px]">
        {/* Navigation bar */}
        <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <nav
              aria-label="Failure Prediction sections"
              className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
            >
              <a className="hover:text-signal" href="#model-selection">
                01 / Model
              </a>
              <a className="hover:text-signal" href="#single-prediction">
                02 / Single row
              </a>
              <a className="hover:text-signal" href="#batch-prediction">
                03 / Batch
              </a>
              <a className="hover:text-signal" href="#prediction-result">
                04 / Result
              </a>
              <a className="hover:text-signal" href="#diagnostics">
                05 / Diagnostics
              </a>
              <a className="hover:text-signal" href="#operational-impact">
                06 / Impact
              </a>
              <a className="hover:text-signal" href="#prediction-history">
                07 / History
              </a>
            </nav>
            <Button variant="ghost" size="sm" onClick={refreshWorkspace} disabled={isLoading}>
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh availability
            </Button>
          </div>
        </section>

        {/* Operational Workspace Status Header */}
        <section className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="flex items-center gap-2 text-sm text-ink">
            <BrainCircuit aria-hidden="true" className="size-4 text-signal" /> Primary operational workspace / backend inference
          </p>
          <Badge variant={isModelApproved ? "success" : "neutral"}>
            {isModelApproved ? "Production inference active" : "Registry safeguard: Unpromoted candidate"}
          </Badge>
        </section>

        {/* Error State Banner */}
        {error ? (
          <div className="mx-5 my-6 sm:mx-8 lg:mx-10">
            <ErrorState title="Prediction Request Blocked" description={error} onRetry={() => void load()} />
          </div>
        ) : null}

        {/* 01 / Model Selection */}
        <ModelSelector models={models} selectedModelId={selectedModelId ?? ""} onSelectModel={setSelectedModelId} />

        {/* Lifecycle Safeguard Active Notice */}
        {!isLoading && !isModelApproved ? (
          <div className="border-b border-line bg-surface px-5 py-6 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
                  <ShieldAlert aria-hidden="true" className="size-3.5" />
                  Lifecycle Safeguard Active
                </p>
                <h3 className="mt-1 font-display text-2xl text-ink">Inference Gated / Unpromoted Candidate</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                  {selectedModel?.availabilityNote ??
                    "The active model registry requires an approved model and promoted decision policy for live inference. In accordance with Phase 9 validation controls, candidate models are not automatically promoted to production."}
                </p>
              </div>
              <Badge variant="neutral">Production Promotion Required</Badge>
            </div>
          </div>
        ) : null}

        {/* Mode Selector Tab (Single truck vs Batch CSV) */}
        <section className="border-b border-line px-5 py-8 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-4">
            <Button
              variant={mode === "single" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("single")}
              aria-pressed={mode === "single"}
            >
              Single truck
            </Button>
            <Button
              variant={mode === "batch" ? "default" : "ghost"}
              size="sm"
              onClick={() => setMode("batch")}
              aria-pressed={mode === "batch"}
            >
              Batch CSV
            </Button>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              {selectedModel ? `${selectedModel.referenceType} / ${selectedModel.referenceId}` : "No model selected"}
            </span>
          </div>
        </section>

        {/* 02 / Single or 03 / Batch input forms */}
        {mode === "single" ? (
          <SensorInputForm
            features={features}
            isProcessing={isProcessing}
            onSubmit={handleSingleSubmit}
            isBlocked={!isModelApproved}
          />
        ) : (
          <BatchUpload
            expectedFeatureIds={features.map((feature) => feature.id)}
            isProcessing={isProcessing}
            onProcessed={handleBatchProcessed}
            batchResult={batchResult}
            isBlocked={!isModelApproved}
          />
        )}

        {/* 04 / Prediction Result Panel */}
        <PredictionResultPanel result={result} />

        {/* 05 / Diagnostic Analysis (when result available) */}
        {result ? <DiagnosticAnalysis result={result} readings={readings} /> : null}

        {/* 06 / Business Impact Panel (when result available) */}
        {result ? <BusinessImpactPanel result={result} /> : null}

        {/* 07 / Prediction History */}
        <PredictionHistory
          records={history}
          models={models}
          selectedPredictionId={result?.predictionId}
          onSelectPrediction={handleSelectHistory}
          onExportCsv={downloadPredictionHistoryCsv}
        />

        {/* End of view */}
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
  return model.referenceType === "experiment"
    ? { experimentId: model.referenceId, decisionPolicyId: model.policyId }
    : { modelRunId: model.referenceId, decisionPolicyId: model.policyId };
}

export { PredictionWorkspace };

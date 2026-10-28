"use client";

import * as React from "react";
import { ArrowDown, BrainCircuit, RefreshCw, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { ModelSelector } from "@/components/predictions/model-selector";
import { SensorInputForm } from "@/components/predictions/sensor-input-form";
import { BatchUpload } from "@/components/predictions/batch-upload";
import { PredictionResultPanel } from "@/components/predictions/prediction-result";
import { DiagnosticAnalysis } from "@/components/predictions/diagnostic-analysis";
import { BusinessImpactPanel } from "@/components/predictions/business-impact-panel";
import { PredictionHistory } from "@/components/predictions/prediction-history";
import {
  CANONICAL_APS_FEATURES,
  downloadPredictionHistoryCsv,
  executeBatchPredictionSubmission,
  executePredictionSubmission,
  fetchFeatureSchema,
  fetchPredictionHistory,
  fetchPredictionModels,
  type PredictionReference,
} from "@/services/prediction-service";
import type {
  BatchPredictionResponse,
  FeatureSchemaSource,
  PredictionModelOption,
  PredictionResult,
  SensorFeatureDefinition,
} from "@/types";

type PredictionMode = "single" | "batch";

function PredictionWorkspace() {
  const [mode, setMode] = React.useState<PredictionMode>("single");
  const [models, setModels] = React.useState<PredictionModelOption[]>([
    {
      modelId: "experiment:phase9-final-validation-candidate",
      modelName: "CatBoost / phase9.1.0 (Validation Candidate)",
      availability: "not_loaded",
      approvalStatus: "unapproved",
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
  const [schemaSource, setSchemaSource] = React.useState<FeatureSchemaSource>("canonical_fallback");
  const [schemaWarning, setSchemaWarning] = React.useState<string | undefined>(undefined);
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
        .then((schemaResult) => {
          setFeatures(schemaResult.features);
          setSchemaSource(schemaResult.source);
          setSchemaWarning(schemaResult.warning);
          setReadings((prev) => {
            if (Object.keys(prev).length === schemaResult.features.length) return prev;
            return Object.fromEntries(schemaResult.features.map((f) => [f.id, null]));
          });
        })
        .catch((schemaError) => {
          setSchemaSource("canonical_fallback");
          setSchemaWarning(schemaError instanceof Error ? schemaError.message : "Feature schema could not be loaded.");
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
      const outcome = await executePredictionSubmission({
        model: selectedModel,
        reference: selectedReference,
        readings: nextReadings,
      });

      if (outcome.status !== "success") {
        setError(outcome.error ?? "Prediction request blocked.");
        return;
      }

      if (outcome.result) {
        setResult(outcome.result);
        setHistory((current) => [outcome.result as PredictionResult, ...current]);
      }
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
      const outcome = await executeBatchPredictionSubmission({
        model: selectedModel,
        reference: selectedReference,
        records,
      });

      if (outcome.status !== "success") {
        const errorMsg = outcome.error ?? "Batch inference request blocked.";
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      if (outcome.result) {
        setBatchResult(outcome.result);
        if (outcome.result.firstPrediction) {
          setResult(outcome.result.firstPrediction);
          setHistory((current) => [outcome.result!.firstPrediction as PredictionResult, ...current]);
        }
        return outcome.result;
      }
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

  const isModelApproved = selectedModel?.approvalStatus === "approved" && selectedModel?.availability === "available";
  const isVerificationFailed = selectedModel?.approvalStatus === "verification_failed";

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
          <Badge variant={isModelApproved ? "success" : isVerificationFailed ? "signal" : "neutral"}>
            {isModelApproved
              ? "Production inference active"
              : isVerificationFailed
              ? "Registry check unavailable"
              : "Registry safeguard: Unpromoted candidate"}
          </Badge>
        </section>

        {/* Error State Banner */}
        {error ? (
          <div className="mx-5 my-6 sm:mx-8 lg:mx-10">
            <ErrorState title="Prediction Request Blocked" description={error} onRetry={() => void load()} />
          </div>
        ) : null}

        {/* 01 / Inference Configuration */}
        <ModelSelector models={models} selectedModelId={selectedModelId ?? ""} onSelectModel={setSelectedModelId} />

        {/* Lifecycle Safeguard Active Notice */}
        {!isLoading && !isModelApproved ? (
          <div className="border-b border-line bg-surface px-5 py-4 sm:px-8 lg:px-10">
            <div className="border border-signal/40 bg-signal-wash/60 p-4 rounded-sm flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldAlert aria-hidden="true" className="size-5 text-signal shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-signal font-semibold">
                    {isVerificationFailed ? "Registry Verification Unavailable" : "Lifecycle Safeguard Active"}
                  </p>
                  <p className="font-mono text-xs text-ink font-medium mt-1">
                    {isVerificationFailed
                      ? "Approval status could not be established. Check backend connectivity."
                      : (selectedModel?.availabilityNote ??
                         "Candidate model is unapproved (promotions: 0). In accordance with Phase 9 validation controls, live inference is gated until production promotion.")}
                  </p>
                  <p className="font-mono text-[11px] text-muted mt-1">
                    Sensor form entry and batch CSV validation are active for exploration. Live inference is blocked by backend registry safeguards.
                  </p>
                </div>
              </div>
              <Badge variant="neutral" className="shrink-0 text-xs">
                {isVerificationFailed ? "Service Unavailable" : "Promotion Required"}
              </Badge>
            </div>
          </div>
        ) : null}

        {/* Mode Selector Tab (Single truck vs Batch CSV) */}
        <section className="border-b border-line bg-canvas-deep/30 px-5 py-4 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded border border-line bg-surface p-1">
              <Button
                variant={mode === "single" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("single")}
                aria-pressed={mode === "single"}
                className="font-mono text-xs h-8"
              >
                Single truck (170 sensors)
              </Button>
              <Button
                variant={mode === "batch" ? "default" : "ghost"}
                size="sm"
                onClick={() => setMode("batch")}
                aria-pressed={mode === "batch"}
                className="font-mono text-xs h-8"
              >
                Batch CSV inference (1,000 max)
              </Button>
            </div>
            <span className="font-mono text-[11px] text-muted">
              Active reference: {selectedModel ? `${selectedModel.referenceType}:${selectedModel.referenceId}` : "—"}
            </span>
          </div>
        </section>

        {/* 02 / Single or 03 / Batch input forms */}
        {mode === "single" ? (
          <SensorInputForm
            features={features}
            schemaSource={schemaSource}
            schemaWarning={schemaWarning}
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

        {/* 03 / Prediction Result Panel */}
        <PredictionResultPanel result={result} isBlocked={!isModelApproved} />

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
  return {
    modelRunId: model.referenceType === "training_run" ? model.referenceId : undefined,
    experimentId: model.referenceType === "experiment" ? model.referenceId : undefined,
    decisionPolicyId: model.policyId,
  };
}

export { PredictionWorkspace };
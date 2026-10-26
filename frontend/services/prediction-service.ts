import { apiDownload, apiFetch } from "@/services/api-client";
import type {
  BackendBatchPredictionResponse,
  BackendFeatureSchemaResponse,
  BackendPolicyListResponse,
  BackendPredictionHistoryResponse,
  BackendPredictionModelListResponse,
  BackendPredictionResponse,
  BackendReferenceType,
  BackendRegistryListResponse,
} from "@/services/backend-contracts";
import type {
  BatchPredictionResponse,
  FeatureContribution,
  PredictionModelOption,
  PredictionRequest,
  PredictionResult,
  SensorFeatureDefinition,
} from "@/types";

export interface PredictionReference {
  modelRunId?: string;
  experimentId?: string;
  decisionPolicyId?: string;
}

export interface BackendPredictionRequest extends PredictionReference {
  features: Record<string, number | null>;
  include_explanation?: boolean;
}

export interface BackendBatchRequest extends PredictionReference {
  records: Array<{ features: Record<string, number | null> }>;
  include_explanation?: boolean;
}

export function fetchPredictionModels(): Promise<PredictionModelOption[]> {
  return Promise.all([
    apiFetch<BackendPredictionModelListResponse>("/predictions/models?page=1&page_size=100"),
    apiFetch<BackendPolicyListResponse>("/predictions/policies?page=1&page_size=100"),
    apiFetch<BackendRegistryListResponse>("/models/registry?page=1&page_size=100"),
    apiFetch<{ items: Array<{ promotion_id: string; model_reference_type: BackendReferenceType; model_reference_id: string; decision_policy_id: string; status: string }> }>("/models/promotions?page=1&page_size=100"),
  ]).then(([models, policies, registry, promotions]) => {
    const activePromotion = promotions.items.find((promotion) => promotion.status === "active");
    return models.items.map((model) => {
      const registered = registry.items.find((item) => item.model_reference_type === model.model_reference_type && item.model_reference_id === model.model_reference_id);
      const policy = policies.items.find((item) => item.model_reference_type === model.model_reference_type && item.model_reference_id === model.model_reference_id && item.status === "active");
      const isApproved = registered?.lifecycle_status === "approved" && activePromotion?.model_reference_type === model.model_reference_type && activePromotion.model_reference_id === model.model_reference_id && activePromotion.decision_policy_id === policy?.policy_id;
      return {
        modelId: `${model.model_reference_type}:${model.model_reference_id}`,
        modelName: `${model.model_name} / ${model.model_version}`,
        availability: isApproved ? "available" : "not_loaded",
        availabilityNote: isApproved ? "Approved model and active decision policy are available." : `Inference unavailable until an approved model/policy pair is registered. Current lifecycle: ${registered?.lifecycle_status ?? model.status}.`,
        defaultThreshold: model.default_threshold,
        referenceType: model.model_reference_type,
        referenceId: model.model_reference_id,
        featureCount: model.feature_count,
        policyId: isApproved ? policy?.policy_id : undefined,
      };
    });
  });
}

export function fetchFeatureSchema(reference: PredictionReference): Promise<SensorFeatureDefinition[]> {
  const { referenceType, referenceId } = referenceParts(reference);
  return apiFetch<BackendFeatureSchemaResponse>(`/predictions/models/${referenceType}/${encodeURIComponent(referenceId)}/features`).then((response) => response.feature_names.map((id, order) => ({ id, order, group: `Prefix ${id.split("_")[0]}` })));
}

export function predictSingle(request: PredictionRequest, reference: PredictionReference): Promise<PredictionResult> {
  return apiFetch<BackendPredictionResponse>("/predictions", { method: "POST", body: JSON.stringify({ ...referencePayload(reference), features: request.readings, include_explanation: true }) }).then(mapPrediction);
}

export function predictBatch(request: BackendBatchRequest): Promise<BatchPredictionResponse> {
  return apiFetch<BackendBatchPredictionResponse>("/predictions/batch", { method: "POST", body: JSON.stringify({ ...referencePayload(request), records: request.records, include_explanation: true }) }).then(mapBatchPrediction);
}

export function fetchPredictionHistory(): Promise<PredictionResult[]> {
  return apiFetch<BackendPredictionHistoryResponse>("/predictions?page=1&page_size=100").then((response) => response.items.map(mapPrediction));
}

export function fetchPrediction(predictionId: string): Promise<PredictionResult> {
  return apiFetch<BackendPredictionResponse>(`/predictions/${encodeURIComponent(predictionId)}`).then(mapPrediction);
}

export function downloadPredictionHistoryCsv(): Promise<void> {
  return apiDownload("/exports/predictions.csv?page_size=5000", "aps-prediction-history.csv");
}

function referenceParts(reference: PredictionReference): { referenceType: BackendReferenceType; referenceId: string } {
  if (reference.modelRunId) return { referenceType: "training_run", referenceId: reference.modelRunId };
  if (reference.experimentId) return { referenceType: "experiment", referenceId: reference.experimentId };
  throw new Error("A model reference is required for inference.");
}

function referencePayload(reference: PredictionReference): Record<string, string> {
  if (reference.modelRunId) return { model_run_id: reference.modelRunId, ...(reference.decisionPolicyId ? { decision_policy_id: reference.decisionPolicyId } : {}) };
  if (reference.experimentId) return { experiment_id: reference.experimentId, ...(reference.decisionPolicyId ? { decision_policy_id: reference.decisionPolicyId } : {}) };
  throw new Error("A model reference is required for inference.");
}

function mapPrediction(response: BackendPredictionResponse): PredictionResult {
  const featureContributions: FeatureContribution[] = response.explanation?.top_features.map((feature) => ({
    featureId: feature.feature_name,
    contribution: feature.importance,
    direction: "increase_risk",
    method: feature.importance_type === "absolute_coefficient" ? "backend_coefficient" : "backend_shap",
  })) ?? [];
  return {
    predictionId: response.prediction_id,
    datasetRowId: response.request_reference ?? response.prediction_id,
    predictedLabel: response.predicted_class === "pos" ? "failure" : "normal",
    failureProbability: response.failure_probability,
    threshold: response.applied_threshold,
    modelId: `${response.model_reference_type}:${response.model_reference_id}`,
    modelName: response.model_version,
    createdAt: response.prediction_timestamp,
    status: "completed",
    source: "single",
    featureContributions,
  };
}

function mapBatchPrediction(response: BackendBatchPredictionResponse): BatchPredictionResponse {
  const firstPrediction = response.items.find((item) => item.prediction)?.prediction;
  return {
    batchId: response.batch_id,
    status: response.failed_count ? "completed" : "completed",
    rowCount: response.total_records,
    completedCount: response.successful_count,
    failedCount: response.failed_count,
    resultsFileName: `${response.batch_id}.json`,
    completedAt: new Date().toISOString(),
    firstPrediction: firstPrediction ? { ...mapPrediction(firstPrediction), source: "batch", batchRowCount: response.total_records } : undefined,
  } as BatchPredictionResponse & { firstPrediction?: PredictionResult };
}

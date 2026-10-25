import { apiFetch } from "@/services/api-client";
import type { BatchPredictionResponse, PredictionModelOption, PredictionRequest, PredictionResult } from "@/types";

/** Proposed FastAPI contracts. The prediction workspace uses mock responses until the backend is connected. */
export function fetchPredictionModels(): Promise<PredictionModelOption[]> {
  return apiFetch<PredictionModelOption[]>("/models");
}

export function predictSingle(request: PredictionRequest): Promise<PredictionResult> {
  return apiFetch<PredictionResult>("/predict", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
}

export function predictBatch(file: File, modelId: string): Promise<BatchPredictionResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("model_id", modelId);
  return apiFetch<BatchPredictionResponse>("/predict/batch", { method: "POST", body });
}

export function fetchPredictionHistory(): Promise<PredictionResult[]> {
  return apiFetch<PredictionResult[]>("/predictions");
}

export function fetchPrediction(predictionId: string): Promise<PredictionResult> {
  return apiFetch<PredictionResult>(`/predictions/${encodeURIComponent(predictionId)}`);
}

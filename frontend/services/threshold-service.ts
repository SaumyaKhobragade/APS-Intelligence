import { apiFetch } from "@/services/api-client";
import type { CalibrationPoint, CostWeights, ThresholdMetrics, ThresholdModelEvaluation, ThresholdOptimizationSnapshot, ThresholdRecommendation } from "@/types";

export interface ThresholdEvaluationRequest {
  modelId: string;
  threshold: number;
  costWeights: CostWeights;
}

export interface ThresholdEvaluationResponse extends ThresholdMetrics {
  modelId: string;
  evaluationDataset: string;
  source: "validation" | "demo";
}

export interface ThresholdCurveResponse {
  modelId: string;
  evaluationDataset: string;
  points: ThresholdMetrics[];
}

export interface ThresholdRecommendationsResponse {
  modelId: string;
  recommendations: {
    minimumCost: ThresholdRecommendation;
    maximumF1: ThresholdRecommendation;
    default: ThresholdRecommendation;
  };
}

export interface CalibrationResponse {
  modelId: string;
  status: ThresholdModelEvaluation["calibrationStatus"];
  brierScore?: number;
  points: CalibrationPoint[];
}

/** Proposed FastAPI contracts. The workspace uses centralized demo data until these endpoints exist. */
export function fetchThresholdModels(): Promise<ThresholdOptimizationSnapshot> {
  return apiFetch<ThresholdOptimizationSnapshot>("/thresholds/models");
}

export function fetchThresholdCurve(modelId: string): Promise<ThresholdCurveResponse> {
  return apiFetch<ThresholdCurveResponse>(`/thresholds/${encodeURIComponent(modelId)}/curve`);
}

export function evaluateThreshold(request: ThresholdEvaluationRequest): Promise<ThresholdEvaluationResponse> {
  return apiFetch<ThresholdEvaluationResponse>("/thresholds/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function fetchThresholdRecommendations(modelId: string): Promise<ThresholdRecommendationsResponse> {
  return apiFetch<ThresholdRecommendationsResponse>(`/thresholds/${encodeURIComponent(modelId)}/recommendations`);
}

export function fetchCalibration(modelId: string): Promise<CalibrationResponse> {
  return apiFetch<CalibrationResponse>(`/calibration/${encodeURIComponent(modelId)}`);
}

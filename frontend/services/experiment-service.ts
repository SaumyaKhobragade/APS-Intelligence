import { apiFetch } from "@/services/api-client";
import type { ExperimentComparisonRequest, ExperimentConfigurationSnapshot, ExperimentCreationRequest, ExperimentEvaluationResults, ExperimentHistoryRecord, ExperimentRegistrySnapshot, ExperimentReportResponse } from "@/types";

export function fetchExperiments(): Promise<ExperimentRegistrySnapshot> {
  return apiFetch<ExperimentRegistrySnapshot>("/experiments");
}

export function fetchExperiment(experimentId: string): Promise<ExperimentHistoryRecord> {
  return apiFetch<ExperimentHistoryRecord>(`/experiments/${encodeURIComponent(experimentId)}`);
}

export function createExperiment(request: ExperimentCreationRequest): Promise<ExperimentHistoryRecord> {
  return apiFetch<ExperimentHistoryRecord>("/experiments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
}

export function fetchExperimentResults(experimentId: string): Promise<ExperimentEvaluationResults> {
  return apiFetch<ExperimentEvaluationResults>(`/experiments/${encodeURIComponent(experimentId)}/results`);
}

export function compareExperiments(request: ExperimentComparisonRequest): Promise<ExperimentHistoryRecord[]> {
  return apiFetch<ExperimentHistoryRecord[]>("/experiments/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
}

export function fetchExperimentConfiguration(experimentId: string): Promise<ExperimentConfigurationSnapshot> {
  return apiFetch<ExperimentConfigurationSnapshot>(`/experiments/${encodeURIComponent(experimentId)}/configuration`);
}

export function fetchExperimentReport(experimentId: string, format: "pdf" | "json" = "pdf"): Promise<ExperimentReportResponse> {
  return apiFetch<ExperimentReportResponse>(`/experiments/${encodeURIComponent(experimentId)}/report?format=${format}`);
}

import { fetchDatasetExplorer, fetchDatasets } from "@/services/dataset-service";
import {
  fetchHistoricalOverview,
  fetchHistoricalValidation,
  fetchHistoricalValidationComparison,
  mapHistoricalSummaryToModel,
  mapHistoricalValidationToModel,
} from "@/services/historical-evidence-service";
import type { BackendDatasetSummary } from "@/services/backend-contracts";
import type { DashboardSnapshot, DatasetMetadata, DatasetDistribution, ExperimentRecord, ModelMetrics } from "@/types";

const CANDIDATE_ID = "phase9-final-validation-candidate";

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [datasets, overview, candidateEvidence, comparison] = await Promise.all([
    fetchDatasets("training"),
    fetchHistoricalOverview(),
    fetchHistoricalValidation(CANDIDATE_ID),
    fetchHistoricalValidationComparison(100),
  ]);
  const primaryDataset = datasets.items[0];
  const explorer = primaryDataset ? await fetchDatasetExplorer(primaryDataset.dataset_id) : null;
  const dataset = primaryDataset ? mapDataset(primaryDataset, explorer?.dataset.missingValueCount) : null;
  const models: ModelMetrics[] = comparison.items.flatMap((item) => {
    const model = mapHistoricalSummaryToModel(item);
    if (!model) return [];
    return [{
      modelId: model.modelId,
      modelName: model.modelName,
      prAuc: model.prAuc,
      precision: model.precision,
      recall: model.recall,
      f1Score: model.f1Score,
      threshold: model.threshold,
      evaluatedAt: model.evaluatedAt,
      rocAuc: model.rocAuc,
      specificity: model.specificity,
      balancedAccuracy: model.balancedAccuracy,
      evaluationScope: model.evaluationScope,
      candidateLabel: model.candidateLabel,
    }];
  });
  const candidateValidation = mapHistoricalValidationToModel(candidateEvidence);
  const split = candidateEvidence.dataset_and_split;
  const distribution = distributionFromEvidence(split) ?? explorer?.classDistribution ?? null;
  const recentExperiments: ExperimentRecord[] = overview.experiments.slice(0, 5).map((experiment) => ({
    id: experiment.reference_id,
    name: `${experiment.model_name}${experiment.imbalance_strategy ? ` / ${experiment.imbalance_strategy}` : ""}`,
    modelId: experiment.model_name,
    datasetId: experiment.dataset_id,
    status: experiment.status === "running" || experiment.status === "queued" || experiment.status === "failed" ? experiment.status : "completed",
    prAuc: experiment.validation_metrics?.pr_auc ?? undefined,
    createdAt: experiment.created_at ?? "",
    completedAt: experiment.completed_at ?? undefined,
  }));
  return {
    dataset,
    distribution,
    models,
    businessImpact: candidateValidation?.businessImpact ?? null,
    recentExperiments,
    quality: explorer?.quality ?? null,
    lastUpdated: new Date().toISOString(),
    availability: [
      ...overview.availability,
      ...(explorer ? [] : [{ name: "training_profile", status: "unavailable" as const, message: "No persisted training profile is available; raw data was not reprofiled." }]),
      ...candidateEvidence.availability,
    ],
    sourceLabel: "Persisted Phase 3/4/9 evidence",
    candidateStatus: overview.candidate_lifecycle_status ?? "unavailable",
    candidateLabel: overview.candidate_label ?? undefined,
    candidateThreshold: candidateValidation?.threshold,
    candidateValidation: candidateValidation ?? undefined,
  };
}

function mapDataset(dataset: BackendDatasetSummary, missingValueCount?: number): DatasetMetadata {
  return {
    id: dataset.dataset_id,
    name: dataset.dataset_name,
    source: dataset.source_file_name,
    featureCount: dataset.feature_count,
    rowCount: dataset.record_count,
    positiveClassLabel: "pos",
    missingValueCount,
    updatedAt: dataset.imported_at,
    datasetType: dataset.dataset_type === "testing" ? "testing" : "training",
    targetColumn: dataset.target_column ?? "class",
    fingerprint: dataset.fingerprint,
    fileSizeBytes: dataset.file_size_bytes,
    status: dataset.status === "error" ? "error" : "ready",
    uploadedAt: dataset.imported_at,
  };
}

function distributionFromEvidence(payload: Record<string, unknown> | null | undefined): DatasetDistribution | null {
  if (!payload) return null;
  const training = counts(payload.training_class_counts);
  const validation = counts(payload.validation_class_counts);
  const normalRecords = training.neg + validation.neg;
  const failureRecords = training.pos + validation.pos;
  const total = normalRecords + failureRecords;
  if (!total) return null;
  return {
    normalRecords,
    failureRecords,
    imbalanceRatio: `${(normalRecords / Math.max(failureRecords, 1)).toFixed(2)}:1`,
  };
}

function counts(value: unknown): { neg: number; pos: number } {
  if (!value || typeof value !== "object") return { neg: 0, pos: 0 };
  const record = value as Record<string, unknown>;
  return {
    neg: typeof record.neg === "number" ? record.neg : 0,
    pos: typeof record.pos === "number" ? record.pos : 0,
  };
}

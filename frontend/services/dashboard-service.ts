import { apiFetch } from "@/services/api-client";
import { fetchDatasetExplorer } from "@/services/dataset-service";
import type { BackendDashboardResponse } from "@/services/backend-contracts";
import type { DashboardSnapshot, DatasetMetadata, ExperimentRecord, ModelMetrics } from "@/types";

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const dashboard = await apiFetch<BackendDashboardResponse>("/analytics/dashboard");
  const primaryDataset = dashboard.datasets.find((dataset) => dataset.dataset_type === "training") ?? dashboard.datasets[0];
  let explorer = null;
  if (primaryDataset) {
    try {
      explorer = await fetchDatasetExplorer(primaryDataset.dataset_id, 1, 50);
    } catch {
      explorer = null;
    }
  }
  const dataset: DatasetMetadata | null = primaryDataset ? {
    id: primaryDataset.dataset_id,
    name: primaryDataset.dataset_name,
    source: primaryDataset.source_file_name,
    featureCount: primaryDataset.feature_count,
    rowCount: primaryDataset.record_count,
    positiveClassLabel: explorer?.dataset.positiveClassLabel ?? "unavailable",
    missingValueCount: explorer?.dataset.missingValueCount ?? 0,
    updatedAt: primaryDataset.imported_at,
    datasetType: primaryDataset.dataset_type === "testing" ? "testing" : "training",
    targetColumn: primaryDataset.target_column ?? "class",
    fileSizeBytes: primaryDataset.file_size_bytes,
    status: primaryDataset.status === "error" ? "error" : "ready",
    uploadedAt: primaryDataset.imported_at,
  } : null;
  const models: ModelMetrics[] = dashboard.latest_validation_metrics.filter((metric) => metric.pr_auc !== null && metric.pr_auc !== undefined).map((metric) => ({
    modelId: `${metric.reference_type}:${metric.reference_id}`,
    modelName: `${metric.model_name} / ${metric.model_version}`,
    prAuc: metric.pr_auc ?? 0,
    precision: metric.precision ?? 0,
    recall: metric.recall ?? 0,
    f1Score: metric.f1_score ?? 0,
    threshold: 0.5,
    evaluatedAt: metric.generated_at,
  }));
  const recentExperiments: ExperimentRecord[] = dashboard.recent_experiments.map((experiment) => ({
    id: experiment.experiment_id,
    name: `${experiment.model_name} / ${experiment.model_version}`,
    modelId: experiment.model_name,
    datasetId: experiment.dataset_id,
    status: experiment.status === "running" || experiment.status === "queued" || experiment.status === "failed" ? experiment.status : "completed",
    prAuc: experiment.pr_auc ?? undefined,
    createdAt: experiment.created_at,
    completedAt: experiment.completed_at ?? undefined,
  }));
  return {
    dataset,
    distribution: explorer?.classDistribution ?? null,
    models,
    businessImpact: null,
    recentExperiments,
    lastUpdated: dashboard.generated_at,
    availability: dashboard.availability,
    sourceLabel: "Persisted backend analytics",
  };
}

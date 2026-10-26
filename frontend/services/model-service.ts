import { apiDownload, apiFetch } from "@/services/api-client";
import type {
  BackendModelComparisonResponse,
  BackendModelComparisonItem,
} from "@/services/backend-contracts";
import type {
  ConfusionMatrix,
  FeatureImportance,
  ModelComparisonSnapshot,
  ModelEvaluation,
} from "@/types";

export interface ModelComparisonFilters {
  page?: number;
  pageSize?: number;
  modelName?: string;
  experimentId?: string;
  imbalanceStrategy?: string;
  evaluationType?: "validation" | "official_test" | "production";
}

export function fetchModelComparison(filters: ModelComparisonFilters = {}): Promise<ModelComparisonSnapshot> {
  const params = new URLSearchParams({ page: String(filters.page ?? 1), page_size: String(filters.pageSize ?? 100), evaluation_type: filters.evaluationType ?? "validation" });
  if (filters.modelName) params.set("model_name", filters.modelName);
  if (filters.experimentId) params.set("experiment_id", filters.experimentId);
  if (filters.imbalanceStrategy) params.set("imbalance_strategy", filters.imbalanceStrategy);
  return apiFetch<BackendModelComparisonResponse>(`/analytics/models/comparison?${params}`).then(mapModelComparison);
}

export function downloadModelComparisonCsv(evaluationType: "validation" | "official_test" | "production" = "validation"): Promise<void> {
  return apiDownload(`/exports/models/comparison.csv?evaluation_type=${evaluationType}`, "aps-model-comparison.csv");
}

function modelKey(item: BackendModelComparisonItem): string {
  return `${item.reference_type}:${item.reference_id}`;
}

function metricNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapConfusionMatrix(value: Record<string, unknown> | null | undefined): ConfusionMatrix {
  return {
    truePositive: Number(value?.true_positive ?? value?.truePositive ?? 0),
    trueNegative: Number(value?.true_negative ?? value?.trueNegative ?? 0),
    falsePositive: Number(value?.false_positive ?? value?.falsePositive ?? 0),
    falseNegative: Number(value?.false_negative ?? value?.falseNegative ?? 0),
  };
}

function mapFeatureImportance(items: Array<Record<string, unknown>>): FeatureImportance[] {
  return items.flatMap((item) => {
    const name = item.feature_name;
    const importance = item.importance;
    if (typeof name !== "string" || typeof importance !== "number") return [];
    return [{ featureName: name, importance, methodology: item.importance_type === "absolute_coefficient" ? "absolute_coefficient" as const : "gain" as const }];
  });
}

function mapModel(item: BackendModelComparisonItem): ModelEvaluation {
  const confusionMatrix = mapConfusionMatrix(item.confusion_matrix);
  const falsePositiveCost = metricNumber(item.false_positive_cost);
  const falseNegativeCost = metricNumber(item.false_negative_cost);
  const estimatedCost = metricNumber(item.estimated_business_cost);
  const precisionRecall = item.precision_recall_curve;
  const recallValues = precisionRecall?.recall ?? [];
  const precisionValues = precisionRecall?.precision ?? [];
  return {
    modelId: modelKey(item),
    modelName: `${item.model_name} / ${item.imbalance_strategy ?? "training"}`,
    modelType: item.model_name,
    trainingDurationSeconds: metricNumber(item.training_duration_seconds),
    evaluationStatus: item.pr_auc === null || item.pr_auc === undefined ? "not_available" : "completed",
    trainingDataset: item.dataset_id,
    evaluationDataset: `${item.dataset_id} / ${item.evaluation_scope}`,
    hyperparameters: Object.fromEntries(Object.entries(item.hyperparameters).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))) as Record<string, string | number | boolean>,
    prAuc: metricNumber(item.pr_auc),
    precision: metricNumber(item.precision),
    recall: metricNumber(item.recall),
    f1Score: metricNumber(item.f1_score),
    threshold: item.threshold ?? 0.5,
    evaluatedAt: item.created_at,
    confusionMatrix,
    businessImpact: {
      falsePositiveCount: confusionMatrix.falsePositive,
      falseNegativeCount: confusionMatrix.falseNegative,
      falsePositiveCost,
      falseNegativeCost,
      estimatedCost,
    },
    precisionRecallCurve: recallValues.map((recall, index) => ({ recall, precision: precisionValues[index] ?? 0, threshold: 0 })),
    featureImportance: mapFeatureImportance(item.feature_importance),
  };
}

function mapModelComparison(response: BackendModelComparisonResponse): ModelComparisonSnapshot {
  return {
    models: response.items.filter((item) => item.evaluation_scope === "validation").map(mapModel),
    evaluationSplit: response.items[0]?.evaluation_split ?? "Validation split / persisted backend metrics",
    lastUpdated: new Date().toISOString(),
  };
}

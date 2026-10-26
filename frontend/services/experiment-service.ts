import { apiDownload, apiFetch } from "@/services/api-client";
import type {
  BackendEvaluationMetrics,
  BackendExperimentDetail,
  BackendExperimentListResponse,
  BackendExperimentSummary,
} from "@/services/backend-contracts";
import type {
  BusinessImpactSummary,
  ConfusionMatrix,
  ExperimentConfigurationSnapshot,
  ExperimentCreationRequest,
  ExperimentEvaluationResults,
  ExperimentHistoryRecord,
  ExperimentRegistrySnapshot,
} from "@/types";

export function fetchExperiments(pageSize = 100): Promise<ExperimentRegistrySnapshot> {
  return apiFetch<BackendExperimentListResponse>(`/experiments?page=1&page_size=${pageSize}`).then((response) => ({
    experiments: response.items.map(mapExperimentSummary),
    lastUpdated: new Date().toISOString(),
    sourceLabel: "Persisted backend experiment registry",
  }));
}

export function fetchExperiment(experimentId: string): Promise<ExperimentHistoryRecord> {
  return apiFetch<BackendExperimentDetail>(`/experiments/${encodeURIComponent(experimentId)}`).then(mapExperimentDetail);
}

export function fetchExperimentConfiguration(experimentId: string): Promise<ExperimentConfigurationSnapshot> {
  return apiFetch<{ experiment_id: string; configuration: Record<string, unknown>; best_parameters: Record<string, unknown> }>(`/experiments/${encodeURIComponent(experimentId)}/configuration`).then((response) => mapConfiguration(response.configuration, response.best_parameters));
}

export function createExperiment(request: ExperimentCreationRequest): Promise<ExperimentHistoryRecord> {
  return apiFetch<BackendExperimentDetail>("/experiments", {
    method: "POST",
    body: JSON.stringify({
      dataset_id: request.datasetId,
      model_name: request.modelId,
      imbalance_strategy: request.classImbalanceStrategy === "smote" ? "smote" : request.classImbalanceStrategy === "class_weight" ? "class_weight" : "original",
      preprocessing_strategy: request.missingValueStrategy === "mean" ? "mean" : request.missingValueStrategy === "constant" ? "constant" : "median",
      threshold: request.classificationThreshold,
      false_positive_cost: request.costWeights.falsePositive,
      false_negative_cost: request.costWeights.falseNegative,
    }),
  }).then(mapExperimentDetail);
}

export function compareExperiments(experimentIds: string[]): Promise<ExperimentHistoryRecord[]> {
  return apiFetch<{ rows: BackendExperimentSummary[] }>("/experiments/compare", { method: "POST", body: JSON.stringify({ experiment_ids: experimentIds }) }).then((response) => response.rows.map(mapExperimentSummary));
}

export function downloadExperimentJson(referenceType: "training_run" | "experiment", referenceId: string): Promise<void> {
  return apiDownload(`/exports/experiments/${referenceType}/${encodeURIComponent(referenceId)}.json`, `${referenceId}-experiment.json`);
}

export function downloadExperimentCsv(referenceType: "training_run" | "experiment", referenceId: string): Promise<void> {
  return apiDownload(`/exports/experiments/${referenceType}/${encodeURIComponent(referenceId)}.csv`, `${referenceId}-experiment.csv`);
}

export function downloadExperimentPdf(referenceType: "training_run" | "experiment", referenceId: string): Promise<void> {
  return apiDownload(`/reports/experiments/${referenceType}/${encodeURIComponent(referenceId)}.pdf`, `${referenceId}-experiment-report.pdf`);
}

function mapExperimentSummary(summary: BackendExperimentSummary): ExperimentHistoryRecord {
  const metrics: ExperimentEvaluationResults = summary.primary_metric === null || summary.primary_metric === undefined ? {} : { prAuc: summary.primary_metric, trainingDurationSeconds: summary.training_duration_seconds ?? undefined };
  return buildRecord(summary, metrics, {
    configuration: {},
    best_parameters: {},
    search_results: [],
    feature_importance: [],
    training_records: 0,
    validation_records: 0,
    training_class_counts: {},
    validation_class_counts: {},
    validation_distribution_preserved: false,
    test_isolation_note: "The official APS test dataset is isolated from experimentation.",
  });
}

function mapExperimentDetail(detail: BackendExperimentDetail): ExperimentHistoryRecord {
  return buildRecord(detail, mapEvaluation(detail.metrics), detail);
}

function buildRecord(summary: BackendExperimentSummary, evaluationResults: ExperimentEvaluationResults, detail: Partial<BackendExperimentDetail>): ExperimentHistoryRecord {
  const configuration = detail.configuration ?? {};
  const bestParameters = detail.best_parameters ?? {};
  const featureNames = asStringArray(configuration.feature_names_before) ?? [];
  const preprocessing = {
    missingValueHandling: summary.preprocessing_strategy,
    featureSelection: featureNames.length ? `${featureNames.length} persisted features` : undefined,
    scalingOrTransformations: asString(configuration.scaling_or_transformations),
    classWeightingOrResampling: summary.imbalance_strategy,
  };
  const unavailableFields = [
    ...(summary.status === "completed" && detail.metrics ? [] : ["evaluationResults"]),
    ...(featureNames.length ? [] : ["featureSchema"]),
  ];
  const snapshot: ExperimentConfigurationSnapshot = {
    modelIdentifier: summary.model_name,
    modelVersion: summary.model_version,
    datasetIdentifier: summary.dataset_id,
    datasetFingerprint: summary.dataset_fingerprint,
    featureSchema: featureNames,
    preprocessing,
    classImbalanceStrategy: summary.imbalance_strategy,
    hyperparameters: toScalarRecord(bestParameters),
    classificationThreshold: asNumber(configuration.threshold) ?? undefined,
    costWeights: {
      falsePositive: asNumber(configuration.false_positive_cost) ?? 1,
      falseNegative: asNumber(configuration.false_negative_cost) ?? 10,
    },
    evaluationSplit: summary.status === "completed" ? "Persisted validation split" : undefined,
    randomSeed: summary.random_seed,
    unavailableFields,
  };
  return {
    id: summary.experiment_id,
    name: `${summary.model_name} / ${summary.imbalance_strategy}`,
    modelId: summary.model_name,
    modelName: summary.model_name,
    datasetId: summary.dataset_id,
    datasetName: summary.dataset_id,
    createdAt: summary.created_at,
    status: summary.status,
    experimentType: "model_evaluation",
    isDemonstration: false,
    evaluationResults,
    details: {
      modelConfiguration: {
        modelId: summary.model_name,
        modelName: summary.model_name,
        modelVersion: summary.model_version,
        trainingConfiguration: `${summary.imbalance_strategy} / ${summary.preprocessing_strategy}`,
        randomSeed: summary.random_seed,
        hyperparameters: toScalarRecord(bestParameters),
      },
      datasetInformation: {
        datasetId: summary.dataset_id,
        datasetName: summary.dataset_id,
        fingerprint: summary.dataset_fingerprint,
        trainingRecords: detail.training_records,
        validationRecords: detail.validation_records,
        featureCount: featureNames.length || undefined,
        evaluationProtocol: "Persisted validation split",
        compatibilityKey: summary.dataset_fingerprint,
      },
      preprocessing,
      execution: {
        startedAt: undefined,
        endedAt: summary.completed_at ?? undefined,
        durationSeconds: summary.training_duration_seconds ?? undefined,
        status: summary.status,
      },
      configurationSnapshot: snapshot,
      compatibility: "unknown",
      compatibilityNote: "Compatibility is based on the persisted dataset and split fingerprints; compare only matching fingerprints.",
    },
  };
}

function mapEvaluation(metrics: BackendEvaluationMetrics | null | undefined): ExperimentEvaluationResults {
  if (!metrics) return {};
  const confusionMatrix: ConfusionMatrix = {
    truePositive: metrics.confusion_matrix.true_positive,
    trueNegative: metrics.confusion_matrix.true_negative,
    falsePositive: metrics.confusion_matrix.false_positive,
    falseNegative: metrics.confusion_matrix.false_negative,
  };
  const businessImpact: BusinessImpactSummary = {
    falsePositiveCount: confusionMatrix.falsePositive,
    falseNegativeCount: confusionMatrix.falseNegative,
    falsePositiveCost: metrics.false_positive_cost,
    falseNegativeCost: metrics.false_negative_cost,
    estimatedCost: metrics.estimated_business_cost,
  };
  return {
    prAuc: metrics.pr_auc ?? undefined,
    precision: metrics.precision,
    recall: metrics.recall,
    f1Score: metrics.f1_score,
    classificationThreshold: metrics.threshold,
    confusionMatrix,
    businessImpact,
  };
}

function mapConfiguration(configuration: Record<string, unknown>, bestParameters: Record<string, unknown>): ExperimentConfigurationSnapshot {
  return {
    modelIdentifier: asString(configuration.model_name) ?? "unavailable",
    modelVersion: asString(configuration.model_version),
    datasetIdentifier: asString(configuration.dataset_id) ?? "unavailable",
    datasetFingerprint: asString(configuration.dataset_fingerprint),
    featureSchema: asStringArray(configuration.feature_names_before) ?? [],
    preprocessing: { missingValueHandling: asString(configuration.preprocessing_strategy) },
    classImbalanceStrategy: asString(configuration.imbalance_strategy),
    hyperparameters: toScalarRecord(bestParameters),
    classificationThreshold: asNumber(configuration.threshold),
    unavailableFields: [],
  };
}

function asString(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function asNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function asStringArray(value: unknown): string[] | undefined { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined; }
function toScalarRecord(value: Record<string, unknown>): Record<string, string | number | boolean> { return Object.fromEntries(Object.entries(value).filter(([, item]) => ["string", "number", "boolean"].includes(typeof item))) as Record<string, string | number | boolean>; }

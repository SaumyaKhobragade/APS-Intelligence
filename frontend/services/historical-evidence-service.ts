import { apiFetch } from "@/services/api-client";
import type {
  BackendHistoricalCalibrationResponse,
  BackendHistoricalMetric,
  BackendHistoricalOverviewResponse,
  BackendHistoricalRunDetail,
  BackendHistoricalRunSummary,
  BackendHistoricalThresholdResponse,
  BackendHistoricalValidationComparisonResponse,
  BackendHistoricalValidationResponse,
  BackendOfficialTestEvidenceResponse,
} from "@/services/backend-contracts";
import type {
  BusinessImpactSummary,
  ConfusionMatrix,
  ExperimentHistoryRecord,
  ModelEvaluation,
  ModelComparisonSnapshot,
} from "@/types";

export function fetchHistoricalOverview(): Promise<BackendHistoricalOverviewResponse> {
  return apiFetch<BackendHistoricalOverviewResponse>("/historical-evidence/overview");
}

export function fetchHistoricalTrainingRuns(pageSize = 100) {
  return apiFetch<{ items: BackendHistoricalRunSummary[]; total: number; page: number; page_size: number; availability: BackendHistoricalOverviewResponse["availability"] }>(`/historical-evidence/training-runs?page=1&page_size=${pageSize}`);
}

export function fetchHistoricalExperiments(pageSize = 100) {
  return apiFetch<{ items: BackendHistoricalRunSummary[]; total: number; page: number; page_size: number; availability: BackendHistoricalOverviewResponse["availability"] }>(`/historical-evidence/experiments?page=1&page_size=${pageSize}`);
}

export function fetchHistoricalExperiment(referenceId: string): Promise<BackendHistoricalRunDetail> {
  return apiFetch<BackendHistoricalRunDetail>(`/historical-evidence/experiments/${encodeURIComponent(referenceId)}`);
}

export function extractReferenceId(id: string): string {
  return id.includes(":") ? id.split(":")[1] : id;
}

export function fetchHistoricalValidationComparison(pageSize = 100): Promise<BackendHistoricalValidationComparisonResponse> {
  return apiFetch<BackendHistoricalValidationComparisonResponse>(`/historical-evidence/validation/comparison?page=1&page_size=${pageSize}`);
}

export function fetchHistoricalValidation(referenceId: string): Promise<BackendHistoricalValidationResponse> {
  const safeId = extractReferenceId(referenceId);
  return apiFetch<BackendHistoricalValidationResponse>(`/historical-evidence/validation/${encodeURIComponent(safeId)}`);
}

export function fetchHistoricalThreshold(referenceId: string): Promise<BackendHistoricalThresholdResponse> {
  const safeId = extractReferenceId(referenceId);
  return apiFetch<BackendHistoricalThresholdResponse>(`/historical-evidence/thresholds/${encodeURIComponent(safeId)}`);
}

export function fetchHistoricalCalibration(referenceId: string): Promise<BackendHistoricalCalibrationResponse> {
  const safeId = extractReferenceId(referenceId);
  return apiFetch<BackendHistoricalCalibrationResponse>(`/historical-evidence/calibration/${encodeURIComponent(safeId)}`);
}

export function fetchOfficialTestEvidence(): Promise<BackendOfficialTestEvidenceResponse> {
  return apiFetch<BackendOfficialTestEvidenceResponse>("/historical-evidence/official-test");
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function confusionMatrix(metric?: BackendHistoricalMetric | null): ConfusionMatrix {
  return {
    truePositive: metric?.confusion_matrix?.true_positive ?? 0,
    trueNegative: metric?.confusion_matrix?.true_negative ?? 0,
    falsePositive: metric?.confusion_matrix?.false_positive ?? 0,
    falseNegative: metric?.confusion_matrix?.false_negative ?? 0,
  };
}

function businessImpact(metric: BackendHistoricalMetric): BusinessImpactSummary {
  const matrix = confusionMatrix(metric);
  const unitFp = metric.false_positive_cost ?? 1;
  const unitFn = metric.false_negative_cost ?? 10;
  const fpCost = unitFp * matrix.falsePositive;
  const fnCost = unitFn * matrix.falseNegative;
  return {
    falsePositiveCount: matrix.falsePositive,
    falseNegativeCount: matrix.falseNegative,
    falsePositiveCost: fpCost,
    falseNegativeCost: fnCost,
    estimatedCost: metric.estimated_business_cost ?? (fpCost + fnCost),
    unitFalsePositiveCost: unitFp,
    unitFalseNegativeCost: unitFn,
  };
}

function scalarRecord(values: Record<string, unknown>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))) as Record<string, string | number | boolean>;
}

function curvePoints(curves: Record<string, unknown> | null | undefined): ModelEvaluation["precisionRecallCurve"] {
  const precisionRecall = curves?.precision_recall;
  if (!precisionRecall || typeof precisionRecall !== "object") return [];
  const values = precisionRecall as { precision?: unknown; recall?: unknown; thresholds?: unknown };
  const precision = Array.isArray(values.precision) ? values.precision : [];
  const recall = Array.isArray(values.recall) ? values.recall : [];
  const thresholds = Array.isArray(values.thresholds) ? values.thresholds : [];
  return recall.flatMap((value, index) => typeof value === "number" && typeof precision[index] === "number" ? [{ recall: value, precision: precision[index], threshold: typeof thresholds[index] === "number" ? thresholds[index] : 0 }] : []);
}

function featureImportance(values: Array<Record<string, unknown>> | undefined): NonNullable<ModelEvaluation["featureImportance"]> {
  return (values ?? []).flatMap((item) => {
    const featureName = item.feature_name;
    const importance = item.importance;
    if (typeof featureName !== "string" || typeof importance !== "number") return [];
    return [{
      featureName,
      importance,
      methodology: item.importance_type === "absolute_coefficient" ? "absolute_coefficient" as const : "gain" as const,
    }];
  });
}

function mapRocCurve(curves: Record<string, unknown> | null | undefined): NonNullable<ModelEvaluation["rocCurve"]> {
  const roc = curves?.roc;
  if (!roc || typeof roc !== "object") return [];
  const values = roc as { false_positive_rate?: unknown; true_positive_rate?: unknown; thresholds?: unknown };
  const fpr = Array.isArray(values.false_positive_rate) ? values.false_positive_rate : [];
  const tpr = Array.isArray(values.true_positive_rate) ? values.true_positive_rate : [];
  const thresholds = Array.isArray(values.thresholds) ? values.thresholds : [];
  return fpr.flatMap((value, index) => typeof value === "number" && typeof tpr[index] === "number" ? [{ falsePositiveRate: value, truePositiveRate: tpr[index], threshold: typeof thresholds[index] === "number" ? thresholds[index] : 0 }] : []);
}

export function mapHistoricalSummaryToModel(summary: BackendHistoricalRunSummary): ModelEvaluation | null {
  const metric = summary.validation_metrics;
  if (!metric || metric.pr_auc === null || metric.pr_auc === undefined) return null;
  const strategy = summary.imbalance_strategy ? ` / ${summary.imbalance_strategy}` : "";
  return {
    modelId: `${summary.reference_type}:${summary.reference_id}`,
    modelName: `${summary.model_name}${strategy}`,
    modelType: summary.model_name,
    trainingDurationSeconds: numberOrUndefined(summary.training_duration_seconds),
    evaluationStatus: summary.status === "failed" ? "not_available" : "completed",
    trainingDataset: summary.dataset_id,
    evaluationDataset: `${summary.dataset_id} / ${metric.scope}`,
    hyperparameters: summary.hyperparameters ? scalarRecord(summary.hyperparameters) : {},
    prAuc: metric.pr_auc,
    rocAuc: numberOrUndefined(metric.roc_auc),
    precision: metric.precision ?? 0,
    recall: metric.recall ?? 0,
    f1Score: metric.f1_score ?? 0,
    specificity: numberOrUndefined(metric.specificity),
    balancedAccuracy: numberOrUndefined(metric.balanced_accuracy),
    threshold: metric.threshold ?? summary.threshold ?? 0,
    evaluatedAt: summary.created_at ?? "",
    evaluationScope: metric.scope === "validation" ? "validation" : metric.scope === "official_test" ? "official_test" : undefined,
    candidateLabel: summary.candidate_label ?? undefined,
    confusionMatrix: confusionMatrix(metric),
    businessImpact: businessImpact(metric),
    precisionRecallCurve: curvePoints(summary.curves),
    rocCurve: mapRocCurve(summary.curves),
    crossValidation: summary.cross_validation ? {
      prAucMean: numberOrUndefined(summary.cross_validation.pr_auc_mean),
      prAucStd: numberOrUndefined(summary.cross_validation.pr_auc_std),
      folds: summary.cross_validation.folds ?? undefined,
      searchBudget: summary.cross_validation.search_budget ?? undefined,
      sourceReference: summary.cross_validation.source_reference,
    } : undefined,
    artifactIntegrityStatus: summary.artifact_integrity_status,
    artifactAvailable: summary.artifact_available,
    sourceDatabase: summary.source_database,
    strategy: summary.imbalance_strategy ?? undefined,
    preprocessingStrategy: summary.preprocessing_strategy ?? undefined,
    calibrationProvenance: summary.candidate_label ? "isotonic" : undefined,
    curvesAvailable: curvePoints(summary.curves).length > 0 || mapRocCurve(summary.curves).length > 0,
    featureImportanceAvailable: Boolean(summary.feature_importance_available),
  };
}

export function mapHistoricalValidationToModel(response: BackendHistoricalValidationResponse): ModelEvaluation | null {
  const model = mapHistoricalSummaryToModel({
    ...response.reference,
    validation_metrics: response.metrics.find((metric) => metric.scope === "validation") ?? response.reference.validation_metrics,
    curves: response.curves && !Array.isArray(response.curves) ? response.curves : response.reference.curves,
  });
  if (!model) return null;
  return {
    ...model,
    hyperparameters: (() => { const hp = (response.reference as unknown as { hyperparameters?: Record<string, unknown> })?.hyperparameters; return hp && Object.keys(hp).length > 0 ? (scalarRecord(hp) ?? {}) : model.hyperparameters; })(),
    featureImportance: featureImportance(response.feature_importance),
    featureImportanceAvailable: (response.feature_importance && response.feature_importance.length > 0) || model.featureImportanceAvailable,
  };
}

export function mapHistoricalDetailToExperiment(detail: BackendHistoricalRunDetail): ExperimentHistoryRecord {
  const metric = detail.validation_metrics ?? detail.metrics[0] ?? undefined;
  const matrix = confusionMatrix(metric);
  return {
    id: detail.reference_id,
    name: `${detail.model_name}${detail.imbalance_strategy ? ` / ${detail.imbalance_strategy}` : ""}`,
    modelId: detail.model_name,
    modelName: detail.model_name,
    datasetId: detail.dataset_id,
    datasetName: detail.dataset_id,
    createdAt: detail.created_at ?? "",
    status: detail.status === "failed" ? "failed" : detail.status === "running" ? "running" : detail.status === "queued" ? "queued" : "completed",
    experimentType: "model_evaluation",
    isDemonstration: false,
    source: "historical",
    phase: detail.phase,
    lifecycleStatus: detail.lifecycle_status ?? undefined,
    candidateLabel: detail.candidate_label ?? undefined,
    strategy: detail.imbalance_strategy ?? undefined,
    artifactIntegrityStatus: detail.artifact_integrity_status,
    artifactAvailable: detail.artifact_available,
    errorMessage: detail.error_message ?? undefined,
    crossValidation: detail.cross_validation ? {
      prAucMean: numberOrUndefined(detail.cross_validation.pr_auc_mean),
      prAucStd: numberOrUndefined(detail.cross_validation.pr_auc_std),
      folds: detail.cross_validation.folds ?? undefined,
      searchBudget: detail.cross_validation.search_budget ?? undefined,
      sourceReference: detail.cross_validation.source_reference,
    } : undefined,
    evaluationResults: metric ? {
      prAuc: numberOrUndefined(metric.pr_auc),
      precision: metric.precision ?? undefined,
      recall: metric.recall ?? undefined,
      f1Score: metric.f1_score ?? undefined,
      classificationThreshold: metric.threshold ?? undefined,
      confusionMatrix: matrix,
      businessImpact: businessImpact(metric),
      trainingDurationSeconds: detail.training_duration_seconds ?? undefined,
    } : {},
    details: {
      modelConfiguration: {
        modelId: detail.model_name,
        modelName: detail.model_name,
        modelVersion: detail.model_version,
        trainingConfiguration: `${detail.imbalance_strategy ?? "strategy unavailable"} / ${detail.preprocessing_strategy ?? "preprocessing unavailable"}`,
        hyperparameters: scalarRecord(detail.hyperparameters),
      },
      datasetInformation: {
        datasetId: detail.dataset_id,
        datasetName: detail.dataset_id,
        fingerprint: detail.dataset_fingerprint ?? undefined,
        evaluationProtocol: metric?.scope === "validation" ? "Persisted validation evidence" : "Historical training evidence",
        compatibilityKey: detail.dataset_fingerprint ?? detail.dataset_id,
      },
      preprocessing: {
        missingValueHandling: detail.preprocessing_strategy ?? undefined,
        classWeightingOrResampling: detail.imbalance_strategy ?? undefined,
      },
      execution: {
        endedAt: detail.completed_at ?? undefined,
        durationSeconds: detail.training_duration_seconds ?? undefined,
        status: detail.status === "failed" ? "failed" : detail.status === "running" ? "running" : detail.status === "queued" ? "queued" : "completed",
      },
      configurationSnapshot: {
        modelIdentifier: detail.model_name,
        modelVersion: detail.model_version,
        datasetIdentifier: detail.dataset_id,
        datasetFingerprint: detail.dataset_fingerprint ?? undefined,
        featureSchema: [],
        preprocessing: { missingValueHandling: detail.preprocessing_strategy ?? undefined },
        classImbalanceStrategy: detail.imbalance_strategy ?? undefined,
        hyperparameters: scalarRecord(detail.hyperparameters),
        classificationThreshold: metric?.threshold ?? detail.threshold ?? undefined,
        unavailableFields: detail.status === "failed" ? ["validationMetrics", "artifacts"] : [],
      },
      compatibility: detail.artifact_available ? "compatible" : "unknown",
      compatibilityNote: detail.provenance[0] ?? "Historical evidence record; no production approval implied.",
    },
  };
}

export function mapHistoricalSummaryToExperiment(summary: BackendHistoricalRunSummary): ExperimentHistoryRecord {
  return mapHistoricalDetailToExperiment({
    ...summary,
    configuration: {},
    hyperparameters: summary.hyperparameters ? scalarRecord(summary.hyperparameters) : {},
    search_results: [],
    feature_importance: [],
    metrics: summary.validation_metrics ? [summary.validation_metrics] : [],
    artifacts: [],
    availability: [],
    provenance: ["Historical summary returned by the read-only evidence API."],
  });
}

export function mapHistoricalComparisonToSnapshot(response: BackendHistoricalValidationComparisonResponse): ModelComparisonSnapshot {
  return {
    models: response.items.flatMap((item) => {
      const model = mapHistoricalSummaryToModel(item);
      return model ? [model] : [];
    }),
    evaluationSplit: "Persisted external validation evidence",
    lastUpdated: new Date().toISOString(),
  };
}

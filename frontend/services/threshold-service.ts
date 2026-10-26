import { apiFetch } from "@/services/api-client";
import type {
  BackendThresholdAnalyticsResponse,
  BackendThresholdListResponse,
  BackendThresholdPoint,
} from "@/services/backend-contracts";
import type {
  CalibrationPoint,
  CostWeights,
  ThresholdCurvePoint,
  ThresholdMetrics,
  ThresholdModelEvaluation,
  ThresholdOptimizationSnapshot,
  ThresholdRecommendation,
} from "@/types";

export function fetchThresholdList(): Promise<BackendThresholdListResponse> {
  return apiFetch<BackendThresholdListResponse>("/analytics/thresholds?page=1&page_size=100");
}

export function fetchThresholdAnalytics(referenceId: string): Promise<BackendThresholdAnalyticsResponse> {
  return apiFetch<BackendThresholdAnalyticsResponse>(`/analytics/thresholds/${encodeURIComponent(referenceId)}`);
}

export async function fetchThresholdSnapshot(): Promise<ThresholdOptimizationSnapshot> {
  const list = await fetchThresholdList();
  const details = await Promise.all(list.items.slice(0, 20).map(async (item) => {
    try {
      return mapThresholdAnalytics(await fetchThresholdAnalytics(item.reference_id));
    } catch {
      return null;
    }
  }));
  const models = details.filter((model): model is ThresholdModelEvaluation => model !== null);
  const costs: CostWeights = models[0]?.costWeights ? { falsePositive: models[0].costWeights.falsePositive, falseNegative: models[0].costWeights.falseNegative } : { falsePositive: 1, falseNegative: 10 };
  return {
    models,
    costWeights: costs,
    evaluationDataset: models[0]?.evaluationDataset ?? "Persisted validation analytics",
    methodologyNote: models[0]?.methodologyNote ?? "No persisted threshold or calibration analytics are available.",
    lastUpdated: new Date().toISOString(),
  };
}

function mapPoint(point: BackendThresholdPoint): ThresholdCurvePoint {
  return {
    threshold: point.threshold,
    precision: point.precision,
    recall: point.recall,
    f1Score: point.f1_score,
    falsePositiveCount: point.false_positive,
    falseNegativeCount: point.false_negative,
    truePositiveCount: point.true_positive,
    trueNegativeCount: point.true_negative,
    predictedFailureCount: point.predicted_positive_count,
    totalSamples: point.total_records,
    falsePositiveCost: point.false_positive * 0,
    falseNegativeCost: point.false_negative * 0,
    businessCost: point.business_cost,
    source: "validation_checkpoint",
  };
}

function mapPointWithCosts(point: BackendThresholdPoint, fpCost: number, fnCost: number): ThresholdCurvePoint {
  const mapped = mapPoint(point);
  return {
    ...mapped,
    falsePositiveCost: point.false_positive * fpCost,
    falseNegativeCost: point.false_negative * fnCost,
  };
}

function asRecommendation(kind: ThresholdRecommendation["kind"], label: string, point: ThresholdMetrics, explanation: string): ThresholdRecommendation {
  return { kind, label, metrics: point, explanation };
}

function metricsFromPolicy(row: { decision_threshold: number; precision: number; recall: number; f1_score: number; false_positive: number; false_negative: number; true_positive: number; true_negative: number; total_business_cost: number }, fpCost: number, fnCost: number): ThresholdMetrics {
  return {
    threshold: row.decision_threshold,
    precision: row.precision,
    recall: row.recall,
    f1Score: row.f1_score,
    falsePositiveCount: row.false_positive,
    falseNegativeCount: row.false_negative,
    truePositiveCount: row.true_positive,
    trueNegativeCount: row.true_negative,
    predictedFailureCount: row.false_positive + row.true_positive,
    totalSamples: row.false_positive + row.false_negative + row.true_positive + row.true_negative,
    falsePositiveCost: row.false_positive * fpCost,
    falseNegativeCost: row.false_negative * fnCost,
    businessCost: row.total_business_cost,
  };
}

function mapThresholdAnalytics(response: BackendThresholdAnalyticsResponse): ThresholdModelEvaluation | null {
  const analysis = response.threshold_analysis;
  const policies = response.decision_policies;
  if (!analysis && !policies) return null;
  const reference = analysis?.reference ?? policies?.reference;
  if (!reference) return null;
  const fpCost = analysis?.false_positive_cost ?? policies?.false_positive_cost ?? 1;
  const fnCost = analysis?.false_negative_cost ?? policies?.false_negative_cost ?? 10;
  const curve = analysis?.candidates.map((point) => mapPointWithCosts(point, fpCost, fnCost)) ?? [];
  const defaultMetrics = analysis ? mapPointWithCosts(analysis.default_threshold, fpCost, fnCost) : policies?.rows[0] ? metricsFromPolicy(policies.rows[0], fpCost, fnCost) : null;
  if (!defaultMetrics) return null;
  const minimumPoint = policies?.rows.find((row) => row.threshold_source === "cost_optimal") ?? analysis?.selected ?? analysis?.candidates.reduce((best, current) => current.business_cost < best.business_cost ? current : best, analysis.candidates[0]);
  const maximumF1Point = policies?.rows.reduce((best, current) => current.f1_score > best.f1_score ? current : best, policies.rows[0]) ?? analysis?.candidates.reduce((best, current) => current.f1_score > best.f1_score ? current : best, analysis.candidates[0]);
  const minimumMetrics = minimumPoint ? "decision_threshold" in minimumPoint ? metricsFromPolicy(minimumPoint, fpCost, fnCost) : mapPointWithCosts(minimumPoint, fpCost, fnCost) : defaultMetrics;
  const maximumF1Metrics = maximumF1Point ? "decision_threshold" in maximumF1Point ? metricsFromPolicy(maximumF1Point, fpCost, fnCost) : mapPointWithCosts(maximumF1Point, fpCost, fnCost) : defaultMetrics;
  const calibrationMethod = response.calibration?.methods.find((method) => method.status === "completed") ?? response.calibration?.methods[0];
  const calibrationCurve: CalibrationPoint[] = calibrationMethod?.reliability_curve.map((point) => ({
    binLabel: point.bin_label,
    predictedProbability: point.predicted_probability,
    observedFailureRate: point.observed_failure_rate,
    sampleCount: point.sample_count,
  })) ?? [];
  const recommendations = {
    minimumCost: asRecommendation("minimum_cost", "Persisted minimum-cost policy", minimumMetrics, analysis?.validation_selection_note ?? policies?.validation_selection_note ?? "Persisted policy comparison."),
    maximumF1: asRecommendation("maximum_f1", "Maximum F1 on persisted candidates", maximumF1Metrics, "Highest F1-score among persisted validation candidates."),
    default: asRecommendation("default", "Persisted default threshold", defaultMetrics, "Configured default threshold from the persisted validation artifact."),
  };
  return {
    modelId: `${reference.reference_type}:${reference.reference_id}`,
    modelName: `${reference.model_name} / ${reference.reference_id}`,
    modelType: reference.model_name,
    prAuc: analysis?.selected.pr_auc ?? policies?.rows[0]?.pr_auc ?? 0,
    evaluationDataset: `${reference.dataset_id} / validation`,
    evaluationSplit: reference.split_identifier,
    defaultThreshold: defaultMetrics.threshold,
    calibrationStatus: calibrationMethod?.status === "completed" ? "completed" : calibrationMethod?.status ?? "not_available",
    calibrationStatusLabel: calibrationMethod ? `${calibrationMethod.method} / ${calibrationMethod.status}` : "Calibration unavailable",
    brierScore: calibrationMethod?.brier_score ?? undefined,
    thresholdCurve: curve.length ? curve : [defaultMetrics],
    calibrationCurve,
    recommendations,
    costWeights: { falsePositive: fpCost, falseNegative: fnCost },
    methodologyNote: analysis?.validation_selection_note ?? policies?.validation_selection_note ?? "Persisted validation analytics.",
  } as ThresholdModelEvaluation & { costWeights: CostWeights; methodologyNote: string };
}

import { fetchHistoricalCalibration, fetchHistoricalThreshold } from "@/services/historical-evidence-service";
import type { BackendHistoricalMetric, BackendHistoricalThresholdPoint } from "@/services/backend-contracts";
import type {
  CalibrationPoint,
  CostWeights,
  ThresholdCurvePoint,
  ThresholdMetrics,
  ThresholdModelEvaluation,
  ThresholdOptimizationSnapshot,
  ThresholdRecommendation,
} from "@/types";

const CANDIDATE_ID = "phase9-final-validation-candidate";

export async function fetchThresholdSnapshot(): Promise<ThresholdOptimizationSnapshot> {
  const [threshold, calibration] = await Promise.all([
    fetchHistoricalThreshold(CANDIDATE_ID),
    fetchHistoricalCalibration(CANDIDATE_ID),
  ]);
  const validation = threshold.validation;
  if (!validation || validation.threshold === null || validation.threshold === undefined) {
    return {
      models: [],
      costWeights: { falsePositive: 1, falseNegative: 10 },
      evaluationDataset: "Historical validation evidence unavailable",
      methodologyNote: "The frozen candidate has no persisted validation operating point.",
      lastUpdated: new Date().toISOString(),
    };
  }
  const costs: CostWeights = {
    falsePositive: validation.false_positive_cost ?? 1,
    falseNegative: validation.false_negative_cost ?? 10,
  };
  const frozen: ThresholdCurvePoint = { ...metricToThresholdMetrics(validation, costs), source: "validation_checkpoint", scope: "validation" };
  const internalPoints = threshold.threshold_points.map((point) => historicalPointToThreshold(point, costs));
  const maxF1 = internalPoints.reduce((best, current) => current.f1Score > best.f1Score ? current : best, internalPoints[0] ?? frozen);
  const minimumCost = recommendation("minimum_cost", "Frozen minimum-cost threshold / external validation", frozen, "The frozen threshold was selected by minimum illustrative cost on the internal OOF policy subset and assessed on external validation.");
  const maximumF1 = recommendation("maximum_f1", "Internal maximum-F1 comparison", maxF1, "Persisted internal threshold-selection evidence; not a replacement for the frozen policy.");
  const defaultRecommendation = recommendation("default", "Frozen candidate operating point", frozen, "The Phase 9 candidate is preserved at its frozen evaluation threshold (0.115).");
  const calibrationCurve: CalibrationPoint[] = calibration.reliability_curve.flatMap((point) => {
    const predicted = point.predicted_probability;
    const observed = point.observed_failure_rate;
    const count = point.sample_count;
    return typeof predicted === "number" && typeof observed === "number" && typeof count === "number" ? [{
      binLabel: String(point.bin_label ?? "bin"),
      predictedProbability: predicted,
      observedFailureRate: observed,
      sampleCount: count,
    }] : [];
  });
  const model: ThresholdModelEvaluation = {
    modelId: `experiment:${CANDIDATE_ID}`,
    modelName: `${threshold.model_name} / ${CANDIDATE_ID}`,
    modelType: threshold.model_name,
    prAuc: validation.pr_auc ?? 0,
    evaluationDataset: "Phase 9 external validation / frozen candidate",
    evaluationSplit: threshold.selection_scope,
    defaultThreshold: threshold.frozen_threshold,
    frozenThreshold: threshold.frozen_threshold,
    calibrationStatus: "completed",
    calibrationStatusLabel: `${threshold.calibration_method} / persisted historical evidence`,
    brierScore: calibration.metrics.brier_score ?? undefined,
    thresholdCurve: [frozen, ...internalPoints],
    calibrationCurve,
    recommendations: { minimumCost, maximumF1, default: defaultRecommendation },
    costWeights: costs,
    methodologyNote: [...threshold.provenance, ...calibration.provenance].join(" "),
    readOnly: true,
    calibrationMetrics: calibration.metrics,
    provenance: [...threshold.provenance, ...calibration.provenance],
  };
  return {
    models: [model],
    costWeights: costs,
    evaluationDataset: model.evaluationDataset,
    methodologyNote: model.methodologyNote ?? "Persisted historical threshold and calibration evidence.",
    lastUpdated: new Date().toISOString(),
  };
}

function metricToThresholdMetrics(metric: BackendHistoricalMetric, costs: CostWeights): ThresholdMetrics {
  const matrix = metric.confusion_matrix;
  return {
    threshold: metric.threshold ?? 0,
    precision: metric.precision ?? 0,
    recall: metric.recall ?? 0,
    f1Score: metric.f1_score ?? 0,
    falsePositiveCount: matrix?.false_positive ?? 0,
    falseNegativeCount: matrix?.false_negative ?? 0,
    truePositiveCount: matrix?.true_positive ?? 0,
    trueNegativeCount: matrix?.true_negative ?? 0,
    predictedFailureCount: (matrix?.false_positive ?? 0) + (matrix?.true_positive ?? 0),
    totalSamples: (matrix?.false_positive ?? 0) + (matrix?.false_negative ?? 0) + (matrix?.true_positive ?? 0) + (matrix?.true_negative ?? 0),
    falsePositiveCost: (matrix?.false_positive ?? 0) * costs.falsePositive,
    falseNegativeCost: (matrix?.false_negative ?? 0) * costs.falseNegative,
    businessCost: metric.estimated_business_cost ?? 0,
  };
}

function historicalPointToThreshold(point: BackendHistoricalThresholdPoint, costs: CostWeights): ThresholdCurvePoint {
  const falsePositive = point.false_positive ?? 0;
  const falseNegative = point.false_negative ?? 0;
  const truePositive = point.true_positive ?? 0;
  const trueNegative = point.true_negative ?? 0;
  return {
    threshold: point.threshold,
    precision: point.precision ?? 0,
    recall: point.recall ?? 0,
    f1Score: point.f1_score ?? 0,
    falsePositiveCount: falsePositive,
    falseNegativeCount: falseNegative,
    truePositiveCount: truePositive,
    trueNegativeCount: trueNegative,
    predictedFailureCount: falsePositive + truePositive,
    totalSamples: falsePositive + falseNegative + truePositive + trueNegative,
    falsePositiveCost: falsePositive * costs.falsePositive,
    falseNegativeCost: falseNegative * costs.falseNegative,
    businessCost: point.business_cost ?? 0,
    source: "internal_selection",
    scope: "internal_selection",
  };
}

function recommendation(
  kind: ThresholdRecommendation["kind"],
  label: string,
  metrics: ThresholdMetrics,
  explanation: string,
): ThresholdRecommendation {
  return { kind, label, metrics, explanation };
}

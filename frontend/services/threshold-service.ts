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
  const frozen: ThresholdCurvePoint = {
    ...metricToThresholdMetrics(validation, costs),
    source: "validation_checkpoint",
    scope: "validation",
    scopeLabel: "External validation / frozen candidate",
    sourceReference: validation.source_reference,
  };
  const rawPoints = threshold.threshold_points.map((point) => historicalPointToThreshold(point, costs));
  const pointsMap = new Map<string, ThresholdCurvePoint>();
  for (const pt of rawPoints) {
    pointsMap.set(pt.threshold.toFixed(4), pt);
  }
  pointsMap.set(frozen.threshold.toFixed(4), frozen);
  const sortedCurve = Array.from(pointsMap.values()).sort((a, b) => a.threshold - b.threshold);

  // Use ONLY genuine internal-selection points from threshold.internal_points or explicitly tagged scope/reference
  const isGenuineInternal = (pt: BackendHistoricalThresholdPoint) =>
    pt.scope === "internal_selection" ||
    pt.source_reference === "maximum_f1" ||
    pt.source_reference === "internal_max_f1" ||
    pt.source_reference === "internal_min_cost" ||
    pt.source_reference === "internal_recall_constrained";

  const genuineInternalCandidates = [
    ...(threshold.internal_points ?? []),
    ...threshold.threshold_points.filter(isGenuineInternal),
  ];
  const internalMap = new Map<string, BackendHistoricalThresholdPoint>();
  for (const pt of genuineInternalCandidates) {
    if (isGenuineInternal(pt) || threshold.internal_points?.includes(pt)) {
      internalMap.set(pt.threshold.toFixed(4), pt);
    }
  }
  const internalList = Array.from(internalMap.values());
  const internalPoints = internalList.map((point) => historicalPointToThreshold(point, costs));

  const minimumCost = recommendation(
    "minimum_cost",
    "Validation operating point at minimum illustrative cost",
    frozen,
    "Evaluated at threshold 0.115 on the 12,000-sample external validation partition, yielding the lowest illustrative business cost (362) under baseline weights.",
    "validation",
    "External validation",
    true,
  );

  const maximumF1: ThresholdRecommendation = internalPoints.length > 0
    ? recommendation(
        "maximum_f1",
        "Internal maximum-F1 comparison",
        internalPoints.reduce((best, current) => (current.f1Score > best.f1Score ? current : best), internalPoints[0]),
        "Persisted internal threshold-selection evidence (OOF policy tuning); not an external validation point or candidate replacement.",
        "internal_selection",
        "Internal policy selection",
        true,
      )
    : {
        kind: "maximum_f1",
        label: "Internal maximum-F1 comparison",
        explanation: "Internal policy-selection evidence (OOF tuning) is unavailable. Validation checkpoints cannot be substituted.",
        scope: "internal_selection",
        scopeLabel: "Internal policy selection",
        isAvailable: false,
        unavailableReason: "Persisted internal-selection evidence is missing from payload.",
        metrics: {
          threshold: 0,
          precision: 0,
          recall: 0,
          f1Score: 0,
          falsePositiveCount: 0,
          falseNegativeCount: 0,
          truePositiveCount: 0,
          trueNegativeCount: 0,
          predictedFailureCount: 0,
          totalSamples: 0,
          falsePositiveCost: 0,
          falseNegativeCost: 0,
          businessCost: 0,
        },
      };

  const defaultRecommendation = recommendation(
    "default",
    "Frozen candidate operating point",
    frozen,
    "The Phase 9 candidate is preserved at its frozen evaluation threshold (0.115), which was chosen by internal OOF tuning and verified on external validation.",
    "validation",
    "External validation",
    true,
  );
  const calibrationCurve: CalibrationPoint[] = calibration.reliability_curve.flatMap((point) => {
    const predicted = point.predicted_probability;
    const observed = point.observed_failure_rate;
    const count = point.sample_count;
    return typeof predicted === "number" && typeof observed === "number" && typeof count === "number"
      ? [
          {
            binLabel: String(point.bin_label ?? "bin"),
            predictedProbability: predicted,
            observedFailureRate: observed,
            sampleCount: count,
          },
        ]
      : [];
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
    thresholdCurve: sortedCurve,
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
    totalSamples:
      (matrix?.false_positive ?? 0) +
      (matrix?.false_negative ?? 0) +
      (matrix?.true_positive ?? 0) +
      (matrix?.true_negative ?? 0),
    falsePositiveCost: (matrix?.false_positive ?? 0) * costs.falsePositive,
    falseNegativeCost: (matrix?.false_negative ?? 0) * costs.falseNegative,
    businessCost:
      metric.estimated_business_cost ??
      (matrix?.false_positive ?? 0) * costs.falsePositive + (matrix?.false_negative ?? 0) * costs.falseNegative,
  };
}

function historicalPointToThreshold(point: BackendHistoricalThresholdPoint, costs: CostWeights): ThresholdCurvePoint {
  const falsePositive = point.false_positive ?? 0;
  const falseNegative = point.false_negative ?? 0;
  const truePositive = point.true_positive ?? 0;
  const trueNegative = point.true_negative ?? 0;
  const scope = point.scope ?? "internal_selection";
  const isValidation = scope === "validation";
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
    businessCost: point.business_cost ?? (falsePositive * costs.falsePositive + falseNegative * costs.falseNegative),
    source: isValidation ? "validation_checkpoint" : "internal_selection",
    scope,
    scopeLabel: point.scope_label ?? (isValidation ? "External validation" : "Internal policy selection (OOF CV)"),
    sourceReference: point.source_reference,
  };
}

function recommendation(
  kind: ThresholdRecommendation["kind"],
  label: string,
  metrics: ThresholdMetrics,
  explanation: string,
  scope?: "validation" | "internal_selection",
  scopeLabel?: string,
  isAvailable: boolean = true,
): ThresholdRecommendation {
  return { kind, label, metrics, explanation, scope, scopeLabel, isAvailable };
}

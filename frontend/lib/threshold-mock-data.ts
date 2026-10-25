import { getDemonstrationModelComparison } from "@/lib/model-comparison-mock-data";
import type {
  CalibrationPoint,
  CostWeights,
  ThresholdCurvePoint,
  ThresholdMetrics,
  ThresholdModelEvaluation,
  ThresholdOptimizationSnapshot,
  ThresholdRecommendation,
} from "@/types";

const TOTAL_FAILURES = 1_000;
const TOTAL_NORMAL = 59_000;

export const defaultCostWeights: CostWeights = {
  falsePositive: 10,
  falseNegative: 500,
};

interface ThresholdCountPoint {
  threshold: number;
  truePositive: number;
  falsePositive: number;
}

const thresholdCountPoints: Record<string, ThresholdCountPoint[]> = {
  "logistic-regression": [
    { threshold: 0.05, truePositive: 960, falsePositive: 12_000 },
    { threshold: 0.12, truePositive: 870, falsePositive: 5_100 },
    { threshold: 0.18, truePositive: 780, falsePositive: 3_900 },
    { threshold: 0.24, truePositive: 681, falsePositive: 3_184 },
    { threshold: 0.34, truePositive: 570, falsePositive: 2_200 },
    { threshold: 0.48, truePositive: 440, falsePositive: 1_300 },
    { threshold: 0.65, truePositive: 280, falsePositive: 650 },
    { threshold: 0.82, truePositive: 120, falsePositive: 230 },
    { threshold: 0.94, truePositive: 35, falsePositive: 45 },
  ],
  "random-forest": [
    { threshold: 0.05, truePositive: 960, falsePositive: 10_000 },
    { threshold: 0.12, truePositive: 800, falsePositive: 3_000 },
    { threshold: 0.2, truePositive: 700, falsePositive: 1_900 },
    { threshold: 0.31, truePositive: 602, falsePositive: 1_256 },
    { threshold: 0.42, truePositive: 520, falsePositive: 850 },
    { threshold: 0.58, truePositive: 390, falsePositive: 480 },
    { threshold: 0.72, truePositive: 240, falsePositive: 210 },
    { threshold: 0.88, truePositive: 90, falsePositive: 70 },
    { threshold: 0.97, truePositive: 15, falsePositive: 20 },
  ],
  xgboost: [
    { threshold: 0.05, truePositive: 950, falsePositive: 11_000 },
    { threshold: 0.12, truePositive: 780, falsePositive: 1_900 },
    { threshold: 0.2, truePositive: 700, falsePositive: 1_200 },
    { threshold: 0.36, truePositive: 574, falsePositive: 894 },
    { threshold: 0.46, truePositive: 500, falsePositive: 600 },
    { threshold: 0.6, truePositive: 390, falsePositive: 330 },
    { threshold: 0.76, truePositive: 240, falsePositive: 150 },
    { threshold: 0.9, truePositive: 85, falsePositive: 45 },
    { threshold: 0.98, truePositive: 12, falsePositive: 12 },
  ],
  catboost: [
    { threshold: 0.05, truePositive: 950, falsePositive: 11_000 },
    { threshold: 0.12, truePositive: 800, falsePositive: 2_200 },
    { threshold: 0.2, truePositive: 700, falsePositive: 1_400 },
    { threshold: 0.34, truePositive: 589, falsePositive: 1_011 },
    { threshold: 0.44, truePositive: 510, falsePositive: 700 },
    { threshold: 0.58, truePositive: 390, falsePositive: 420 },
    { threshold: 0.74, truePositive: 240, falsePositive: 190 },
    { threshold: 0.89, truePositive: 80, falsePositive: 50 },
    { threshold: 0.98, truePositive: 10, falsePositive: 15 },
  ],
};

const calibrationCurves: Record<string, CalibrationPoint[]> = {
  "logistic-regression": [
    { binLabel: "0.00–0.10", predictedProbability: 0.05, observedFailureRate: 0.01, sampleCount: 31_600 },
    { binLabel: "0.10–0.20", predictedProbability: 0.15, observedFailureRate: 0.05, sampleCount: 13_400 },
    { binLabel: "0.20–0.30", predictedProbability: 0.25, observedFailureRate: 0.11, sampleCount: 6_800 },
    { binLabel: "0.30–0.40", predictedProbability: 0.35, observedFailureRate: 0.2, sampleCount: 3_900 },
    { binLabel: "0.40–0.60", predictedProbability: 0.5, observedFailureRate: 0.32, sampleCount: 2_400 },
    { binLabel: "0.60–0.80", predictedProbability: 0.7, observedFailureRate: 0.58, sampleCount: 1_300 },
    { binLabel: "0.80–1.00", predictedProbability: 0.9, observedFailureRate: 0.84, sampleCount: 600 },
  ],
  "random-forest": [
    { binLabel: "0.00–0.10", predictedProbability: 0.05, observedFailureRate: 0.04, sampleCount: 34_000 },
    { binLabel: "0.10–0.20", predictedProbability: 0.15, observedFailureRate: 0.13, sampleCount: 12_000 },
    { binLabel: "0.20–0.30", predictedProbability: 0.25, observedFailureRate: 0.24, sampleCount: 6_000 },
    { binLabel: "0.30–0.40", predictedProbability: 0.35, observedFailureRate: 0.34, sampleCount: 3_800 },
    { binLabel: "0.40–0.60", predictedProbability: 0.5, observedFailureRate: 0.49, sampleCount: 2_300 },
    { binLabel: "0.60–0.80", predictedProbability: 0.7, observedFailureRate: 0.68, sampleCount: 1_300 },
    { binLabel: "0.80–1.00", predictedProbability: 0.9, observedFailureRate: 0.87, sampleCount: 600 },
  ],
  xgboost: [
    { binLabel: "0.00–0.10", predictedProbability: 0.05, observedFailureRate: 0.08, sampleCount: 28_500 },
    { binLabel: "0.10–0.20", predictedProbability: 0.15, observedFailureRate: 0.2, sampleCount: 14_500 },
    { binLabel: "0.20–0.30", predictedProbability: 0.25, observedFailureRate: 0.31, sampleCount: 7_000 },
    { binLabel: "0.30–0.40", predictedProbability: 0.35, observedFailureRate: 0.43, sampleCount: 4_000 },
    { binLabel: "0.40–0.60", predictedProbability: 0.5, observedFailureRate: 0.56, sampleCount: 2_600 },
    { binLabel: "0.60–0.80", predictedProbability: 0.7, observedFailureRate: 0.73, sampleCount: 1_800 },
    { binLabel: "0.80–1.00", predictedProbability: 0.9, observedFailureRate: 0.91, sampleCount: 600 },
  ],
  catboost: [
    { binLabel: "0.00–0.10", predictedProbability: 0.05, observedFailureRate: 0.06, sampleCount: 31_500 },
    { binLabel: "0.10–0.20", predictedProbability: 0.15, observedFailureRate: 0.18, sampleCount: 13_000 },
    { binLabel: "0.20–0.30", predictedProbability: 0.25, observedFailureRate: 0.28, sampleCount: 6_800 },
    { binLabel: "0.30–0.40", predictedProbability: 0.35, observedFailureRate: 0.38, sampleCount: 4_000 },
    { binLabel: "0.40–0.60", predictedProbability: 0.5, observedFailureRate: 0.53, sampleCount: 2_600 },
    { binLabel: "0.60–0.80", predictedProbability: 0.7, observedFailureRate: 0.71, sampleCount: 1_500 },
    { binLabel: "0.80–1.00", predictedProbability: 0.9, observedFailureRate: 0.89, sampleCount: 600 },
  ],
};

function calculateThresholdMetrics(truePositive: number, falsePositive: number, threshold: number, costWeights: CostWeights): ThresholdMetrics {
  const falseNegative = TOTAL_FAILURES - truePositive;
  const trueNegative = TOTAL_NORMAL - falsePositive;
  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  const precision = precisionDenominator === 0 ? 0 : truePositive / precisionDenominator;
  const recall = recallDenominator === 0 ? 0 : truePositive / recallDenominator;
  const f1Denominator = precision + recall;
  const f1Score = f1Denominator === 0 ? 0 : (2 * precision * recall) / f1Denominator;
  const falsePositiveCost = falsePositive * costWeights.falsePositive;
  const falseNegativeCost = falseNegative * costWeights.falseNegative;

  return {
    threshold,
    precision,
    recall,
    f1Score,
    falsePositiveCount: falsePositive,
    falseNegativeCount: falseNegative,
    truePositiveCount: truePositive,
    trueNegativeCount: trueNegative,
    predictedFailureCount: truePositive + falsePositive,
    totalSamples: TOTAL_FAILURES + TOTAL_NORMAL,
    falsePositiveCost,
    falseNegativeCost,
    businessCost: falsePositiveCost + falseNegativeCost,
  };
}

function buildCurvePoint(point: ThresholdCountPoint, costWeights: CostWeights): ThresholdCurvePoint {
  return {
    ...calculateThresholdMetrics(point.truePositive, point.falsePositive, point.threshold, costWeights),
    source: "validation_checkpoint",
  };
}

function getThresholdCurve(modelId: string, costWeights: CostWeights): ThresholdCurvePoint[] {
  return (thresholdCountPoints[modelId] ?? []).map((point) => buildCurvePoint(point, costWeights));
}

function interpolate(a: number, b: number, progress: number): number {
  return a + (b - a) * progress;
}

type ThresholdEvaluationContext = Pick<ThresholdModelEvaluation, "modelId" | "defaultThreshold"> & Partial<ThresholdModelEvaluation>;

export function evaluateThreshold(model: ThresholdEvaluationContext, threshold: number, costWeights: CostWeights): ThresholdMetrics {
  const normalizedThreshold = Math.max(0, Math.min(1, Number.isFinite(threshold) ? threshold : model.defaultThreshold));
  const points = thresholdCountPoints[model.modelId] ?? [];
  if (points.length === 0) return calculateThresholdMetrics(0, 0, normalizedThreshold, costWeights);
  if (normalizedThreshold <= points[0].threshold) return calculateThresholdMetrics(points[0].truePositive, points[0].falsePositive, normalizedThreshold, costWeights);
  const lastPoint = points[points.length - 1];
  if (normalizedThreshold >= lastPoint.threshold) return calculateThresholdMetrics(lastPoint.truePositive, lastPoint.falsePositive, normalizedThreshold, costWeights);

  const upperIndex = points.findIndex((point) => point.threshold >= normalizedThreshold);
  const upper = points[upperIndex];
  const lower = points[upperIndex - 1];
  const progress = (normalizedThreshold - lower.threshold) / (upper.threshold - lower.threshold);
  const truePositive = Math.round(interpolate(lower.truePositive, upper.truePositive, progress));
  const falsePositive = Math.round(interpolate(lower.falsePositive, upper.falsePositive, progress));
  return calculateThresholdMetrics(truePositive, falsePositive, normalizedThreshold, costWeights);
}

function recommendation(kind: ThresholdRecommendation["kind"], label: string, explanation: string, metrics: ThresholdMetrics): ThresholdRecommendation {
  return { kind, label, explanation, metrics };
}

export function getThresholdRecommendations(model: ThresholdModelEvaluation, costWeights: CostWeights): ThresholdModelEvaluation["recommendations"] {
  const points = model.thresholdCurve.map((point) => evaluateThreshold(model, point.threshold, costWeights));
  const minimumCostPoint = points.reduce((best, point) => point.businessCost < best.businessCost ? point : best, points[0]);
  const maximumF1Point = points.reduce((best, point) => point.f1Score > best.f1Score ? point : best, points[0]);
  return {
    minimumCost: recommendation("minimum_cost", "Minimum business cost", "Lowest 10 × FP + 500 × FN on the validation checkpoints.", minimumCostPoint),
    maximumF1: recommendation("maximum_f1", "Maximum F1-score", "Best harmonic balance between precision and recall on the validation checkpoints.", maximumF1Point),
    default: recommendation("default", "Configured default", "The model's existing operating threshold before threshold optimization.", evaluateThreshold(model, model.defaultThreshold, costWeights)),
  };
}

function buildModelEvaluation(modelId: string, costWeights: CostWeights): ThresholdModelEvaluation {
  const comparisonModel = getDemonstrationModelComparison().models.find((model) => model.modelId === modelId);
  const modelName = comparisonModel?.modelName ?? modelId;
  const defaultThreshold = comparisonModel?.threshold ?? 0.5;
  const curve = getThresholdCurve(modelId, costWeights);
  const minimumCostPoint = curve.reduce((best, point) => point.businessCost < best.businessCost ? point : best, curve[0]);
  const maximumF1Point = curve.reduce((best, point) => point.f1Score > best.f1Score ? point : best, curve[0]);
  const defaultMetrics = evaluateThreshold({ modelId, modelName, modelType: comparisonModel?.modelType ?? "Classifier", prAuc: comparisonModel?.prAuc ?? 0, evaluationDataset: "", evaluationSplit: "", defaultThreshold, calibrationStatus: "not_available", calibrationStatusLabel: "", thresholdCurve: curve, calibrationCurve: [], recommendations: {} as ThresholdModelEvaluation["recommendations"] }, defaultThreshold, costWeights);
  const minimumCostMetrics = evaluateThreshold({ modelId, modelName, modelType: "Classifier", prAuc: comparisonModel?.prAuc ?? 0, evaluationDataset: "", evaluationSplit: "", defaultThreshold, calibrationStatus: "not_available", calibrationStatusLabel: "", thresholdCurve: curve, calibrationCurve: [], recommendations: {} as ThresholdModelEvaluation["recommendations"] }, minimumCostPoint.threshold, costWeights);
  const maximumF1Metrics = evaluateThreshold({ modelId, modelName, modelType: "Classifier", prAuc: comparisonModel?.prAuc ?? 0, evaluationDataset: "", evaluationSplit: "", defaultThreshold, calibrationStatus: "not_available", calibrationStatusLabel: "", thresholdCurve: curve, calibrationCurve: [], recommendations: {} as ThresholdModelEvaluation["recommendations"] }, maximumF1Point.threshold, costWeights);

  return {
    modelId,
    modelName,
    modelType: comparisonModel?.modelType ?? "Classifier",
    prAuc: comparisonModel?.prAuc ?? 0,
    evaluationDataset: comparisonModel?.evaluationDataset ?? "Validation artifact / 20% split",
    evaluationSplit: "Validation split only / threshold selection",
    defaultThreshold,
    calibrationStatus: modelId === "random-forest" ? "demonstration_calibrated" : modelId === "logistic-regression" ? "demonstration_overconfident" : "demonstration_underconfident",
    calibrationStatusLabel: modelId === "random-forest" ? "Demonstration signal is close to observed frequency" : modelId === "logistic-regression" ? "Demonstration signal is overconfident" : "Demonstration signal is underconfident",
    brierScore: modelId === "random-forest" ? 0.041 : modelId === "logistic-regression" ? 0.078 : modelId === "xgboost" ? 0.052 : 0.058,
    thresholdCurve: curve,
    calibrationCurve: calibrationCurves[modelId] ?? [],
    recommendations: {
      minimumCost: recommendation("minimum_cost", "Minimum business cost", "Lowest 10 × FP + 500 × FN on the validation checkpoints.", minimumCostMetrics),
      maximumF1: recommendation("maximum_f1", "Maximum F1-score", "Best harmonic balance between precision and recall on the validation checkpoints.", maximumF1Metrics),
      default: recommendation("default", "Configured default", "The model's existing operating threshold before threshold optimization.", defaultMetrics),
    },
  };
}

export function getThresholdOptimizationSnapshot(costWeights: CostWeights = defaultCostWeights): ThresholdOptimizationSnapshot {
  const models = ["logistic-regression", "random-forest", "xgboost", "catboost"].map((modelId) => buildModelEvaluation(modelId, costWeights));
  return {
    models,
    costWeights: { ...costWeights },
    evaluationDataset: "APS failure validation artifact / 60,000 rows",
    methodologyNote: "Threshold recommendations use validation data only. Freeze the chosen threshold before evaluating a final held-out test set.",
    lastUpdated: "Demo validation snapshot / 25 Oct 2026 · 10:05 UTC",
  };
}

export function cloneThresholdOptimizationSnapshot(snapshot: ThresholdOptimizationSnapshot): ThresholdOptimizationSnapshot {
  return {
    ...snapshot,
    costWeights: { ...snapshot.costWeights },
    models: snapshot.models.map((model) => ({
      ...model,
      thresholdCurve: model.thresholdCurve.map((point) => ({ ...point })),
      calibrationCurve: model.calibrationCurve.map((point) => ({ ...point })),
      recommendations: {
        minimumCost: { ...model.recommendations.minimumCost, metrics: { ...model.recommendations.minimumCost.metrics } },
        maximumF1: { ...model.recommendations.maximumF1, metrics: { ...model.recommendations.maximumF1.metrics } },
        default: { ...model.recommendations.default, metrics: { ...model.recommendations.default.metrics } },
      },
    })),
  };
}

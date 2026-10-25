import type { BusinessImpactSummary, ConfusionMatrix, ModelComparisonSnapshot, ModelEvaluation } from "@/types";

/*
 * Demonstration model artifacts only. Curves, metrics and feature importance
 * coordinates are explicit mock responses, not claims about trained models.
 * Every model uses the same 60,000-row evaluation split in this preview.
 */
function businessImpact(confusionMatrix: ConfusionMatrix): BusinessImpactSummary {
  const falsePositiveCost = confusionMatrix.falsePositive * 10;
  const falseNegativeCost = confusionMatrix.falseNegative * 500;

  return {
    falsePositiveCount: confusionMatrix.falsePositive,
    falseNegativeCount: confusionMatrix.falseNegative,
    falsePositiveCost,
    falseNegativeCost,
    estimatedCost: falsePositiveCost + falseNegativeCost,
  };
}

const logisticConfusionMatrix: ConfusionMatrix = { truePositive: 681, trueNegative: 55816, falsePositive: 3184, falseNegative: 319 };
const randomForestConfusionMatrix: ConfusionMatrix = { truePositive: 602, trueNegative: 57744, falsePositive: 1256, falseNegative: 398 };
const xgboostConfusionMatrix: ConfusionMatrix = { truePositive: 574, trueNegative: 58106, falsePositive: 894, falseNegative: 426 };
const catboostConfusionMatrix: ConfusionMatrix = { truePositive: 589, trueNegative: 57989, falsePositive: 1011, falseNegative: 411 };

const modelEvaluations: ModelEvaluation[] = [
  {
    modelId: "logistic-regression",
    modelName: "Logistic Regression",
    modelType: "Linear classifier",
    prAuc: 0.214,
    precision: 0.176,
    recall: 0.681,
    f1Score: 0.28,
    threshold: 0.24,
    evaluatedAt: "2026-10-25T09:20:00Z",
    trainingDurationSeconds: 18,
    evaluationStatus: "completed",
    trainingDataset: "aps_failure_training_set.csv",
    evaluationDataset: "held-out validation split / 20%",
    hyperparameters: { solver: "liblinear", penalty: "l2", class_weight: "balanced", max_iter: 500 },
    confusionMatrix: logisticConfusionMatrix,
    businessImpact: businessImpact(logisticConfusionMatrix),
    precisionRecallCurve: [
      { recall: 0.05, precision: 0.72, threshold: 0.92 },
      { recall: 0.16, precision: 0.48, threshold: 0.78 },
      { recall: 0.29, precision: 0.34, threshold: 0.61 },
      { recall: 0.41, precision: 0.27, threshold: 0.48 },
      { recall: 0.53, precision: 0.22, threshold: 0.36 },
      { recall: 0.68, precision: 0.18, threshold: 0.24 },
      { recall: 0.82, precision: 0.13, threshold: 0.12 },
      { recall: 0.95, precision: 0.08, threshold: 0.04 },
    ],
    featureImportance: [
      { featureName: "ay_000", importance: 0.82, methodology: "absolute_coefficient" },
      { featureName: "az_000", importance: 0.74, methodology: "absolute_coefficient" },
      { featureName: "aa_000", importance: 0.61, methodology: "absolute_coefficient" },
      { featureName: "ag_000", importance: 0.53, methodology: "absolute_coefficient" },
      { featureName: "be_000", importance: 0.46, methodology: "absolute_coefficient" },
    ],
  },
  {
    modelId: "random-forest",
    modelName: "Random Forest",
    modelType: "Bagged decision trees",
    prAuc: 0.286,
    precision: 0.324,
    recall: 0.602,
    f1Score: 0.419,
    threshold: 0.31,
    evaluatedAt: "2026-10-25T09:22:00Z",
    trainingDurationSeconds: 74,
    evaluationStatus: "completed",
    trainingDataset: "aps_failure_training_set.csv",
    evaluationDataset: "held-out validation split / 20%",
    hyperparameters: { n_estimators: 300, max_depth: 14, min_samples_leaf: 2, class_weight: "balanced_subsample" },
    confusionMatrix: randomForestConfusionMatrix,
    businessImpact: businessImpact(randomForestConfusionMatrix),
    precisionRecallCurve: [
      { recall: 0.05, precision: 0.86, threshold: 0.96 },
      { recall: 0.15, precision: 0.67, threshold: 0.83 },
      { recall: 0.27, precision: 0.49, threshold: 0.68 },
      { recall: 0.39, precision: 0.4, threshold: 0.55 },
      { recall: 0.5, precision: 0.35, threshold: 0.43 },
      { recall: 0.6, precision: 0.32, threshold: 0.31 },
      { recall: 0.77, precision: 0.24, threshold: 0.17 },
      { recall: 0.94, precision: 0.13, threshold: 0.06 },
    ],
    featureImportance: [
      { featureName: "ay_000", importance: 0.91, methodology: "split_frequency" },
      { featureName: "aa_000", importance: 0.77, methodology: "split_frequency" },
      { featureName: "az_000", importance: 0.69, methodology: "split_frequency" },
      { featureName: "am_000", importance: 0.58, methodology: "split_frequency" },
      { featureName: "ag_000", importance: 0.5, methodology: "split_frequency" },
    ],
  },
  {
    modelId: "xgboost",
    modelName: "XGBoost",
    modelType: "Gradient boosted trees",
    prAuc: 0.341,
    precision: 0.391,
    recall: 0.574,
    f1Score: 0.465,
    threshold: 0.36,
    evaluatedAt: "2026-10-25T09:24:00Z",
    trainingDurationSeconds: 112,
    evaluationStatus: "completed",
    trainingDataset: "aps_failure_training_set.csv",
    evaluationDataset: "held-out validation split / 20%",
    hyperparameters: { n_estimators: 450, max_depth: 6, learning_rate: 0.08, scale_pos_weight: 59 },
    confusionMatrix: xgboostConfusionMatrix,
    businessImpact: businessImpact(xgboostConfusionMatrix),
    precisionRecallCurve: [
      { recall: 0.05, precision: 0.92, threshold: 0.98 },
      { recall: 0.14, precision: 0.76, threshold: 0.87 },
      { recall: 0.26, precision: 0.61, threshold: 0.72 },
      { recall: 0.37, precision: 0.51, threshold: 0.58 },
      { recall: 0.48, precision: 0.44, threshold: 0.47 },
      { recall: 0.57, precision: 0.39, threshold: 0.36 },
      { recall: 0.73, precision: 0.3, threshold: 0.21 },
      { recall: 0.91, precision: 0.18, threshold: 0.08 },
    ],
    featureImportance: [
      { featureName: "ay_000", importance: 0.96, methodology: "gain" },
      { featureName: "az_000", importance: 0.88, methodology: "gain" },
      { featureName: "aa_000", importance: 0.8, methodology: "gain" },
      { featureName: "be_000", importance: 0.63, methodology: "gain" },
      { featureName: "am_000", importance: 0.56, methodology: "gain" },
    ],
  },
  {
    modelId: "catboost",
    modelName: "CatBoost",
    modelType: "Ordered boosting trees",
    prAuc: 0.327,
    precision: 0.368,
    recall: 0.589,
    f1Score: 0.45,
    threshold: 0.34,
    evaluatedAt: "2026-10-25T09:26:00Z",
    trainingDurationSeconds: 136,
    evaluationStatus: "completed",
    trainingDataset: "aps_failure_training_set.csv",
    evaluationDataset: "held-out validation split / 20%",
    hyperparameters: { iterations: 500, depth: 7, learning_rate: 0.06, auto_class_weights: "Balanced" },
    confusionMatrix: catboostConfusionMatrix,
    businessImpact: businessImpact(catboostConfusionMatrix),
    precisionRecallCurve: [
      { recall: 0.05, precision: 0.9, threshold: 0.97 },
      { recall: 0.15, precision: 0.74, threshold: 0.84 },
      { recall: 0.27, precision: 0.58, threshold: 0.7 },
      { recall: 0.39, precision: 0.49, threshold: 0.56 },
      { recall: 0.5, precision: 0.42, threshold: 0.44 },
      { recall: 0.59, precision: 0.37, threshold: 0.34 },
      { recall: 0.75, precision: 0.28, threshold: 0.19 },
      { recall: 0.92, precision: 0.17, threshold: 0.07 },
    ],
    featureImportance: [
      { featureName: "ay_000", importance: 0.93, methodology: "gain" },
      { featureName: "aa_000", importance: 0.84, methodology: "gain" },
      { featureName: "az_000", importance: 0.78, methodology: "gain" },
      { featureName: "ag_000", importance: 0.62, methodology: "gain" },
      { featureName: "be_000", importance: 0.59, methodology: "gain" },
    ],
  },
];

export const demonstrationModelComparison: ModelComparisonSnapshot = {
  models: modelEvaluations,
  evaluationSplit: "Held-out validation split / 20% of training file",
  lastUpdated: "Demo snapshot / 25 Oct 2026 · 09:32 UTC",
};

export function getDemonstrationModelComparison(): ModelComparisonSnapshot {
  return {
    ...demonstrationModelComparison,
    models: demonstrationModelComparison.models.map((model) => ({
      ...model,
      confusionMatrix: { ...model.confusionMatrix },
      businessImpact: { ...model.businessImpact },
      hyperparameters: { ...model.hyperparameters },
      precisionRecallCurve: model.precisionRecallCurve.map((point) => ({ ...point })),
      featureImportance: model.featureImportance?.map((feature) => ({ ...feature })),
    })),
  };
}

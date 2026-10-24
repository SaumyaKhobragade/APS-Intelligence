import type { DashboardSnapshot, ExperimentRecord, ModelMetrics } from "@/types";

/*
 * Demonstration data only. These values are deliberately kept outside UI
 * components so the dashboard can be swapped to API responses later without
 * changing its presentation layer. They are not trained-model results.
 */
const demonstrationModels: ModelMetrics[] = [
  {
    modelId: "logistic-regression",
    modelName: "Logistic Regression",
    prAuc: 0.214,
    precision: 0.176,
    recall: 0.681,
    f1Score: 0.28,
    threshold: 0.24,
    evaluatedAt: "2026-10-25T09:20:00Z",
  },
  {
    modelId: "random-forest",
    modelName: "Random Forest",
    prAuc: 0.286,
    precision: 0.324,
    recall: 0.602,
    f1Score: 0.419,
    threshold: 0.31,
    evaluatedAt: "2026-10-25T09:22:00Z",
  },
  {
    modelId: "xgboost",
    modelName: "XGBoost",
    prAuc: 0.341,
    precision: 0.391,
    recall: 0.574,
    f1Score: 0.465,
    threshold: 0.36,
    evaluatedAt: "2026-10-25T09:24:00Z",
  },
  {
    modelId: "catboost",
    modelName: "CatBoost",
    prAuc: 0.327,
    precision: 0.368,
    recall: 0.589,
    f1Score: 0.45,
    threshold: 0.34,
    evaluatedAt: "2026-10-25T09:26:00Z",
  },
];

const demonstrationExperiments: ExperimentRecord[] = [
  {
    id: "EXP-2026-1025-04",
    name: "Cost-weighted threshold pass",
    modelId: "xgboost",
    datasetId: "uci-aps-demo",
    status: "completed",
    metrics: demonstrationModels[2],
    createdAt: "2026-10-25T09:24:00Z",
    completedAt: "2026-10-25T09:27:00Z",
  },
  {
    id: "EXP-2026-1025-03",
    name: "Tree ensemble baseline",
    modelId: "catboost",
    datasetId: "uci-aps-demo",
    status: "completed",
    metrics: demonstrationModels[3],
    createdAt: "2026-10-25T09:18:00Z",
    completedAt: "2026-10-25T09:21:00Z",
  },
  {
    id: "EXP-2026-1025-02",
    name: "Linear reference pass",
    modelId: "logistic-regression",
    datasetId: "uci-aps-demo",
    status: "completed",
    metrics: demonstrationModels[0],
    createdAt: "2026-10-25T09:12:00Z",
    completedAt: "2026-10-25T09:15:00Z",
  },
];

export const demonstrationDashboard: DashboardSnapshot = {
  dataset: {
    id: "uci-aps-demo",
    name: "UCI APS Failure at Scania Trucks",
    source: "Demonstration snapshot",
    featureCount: 170,
    rowCount: 60000,
    positiveClassLabel: "Failure",
    missingValueCount: 850000,
    updatedAt: "2026-10-25T09:30:00Z",
  },
  distribution: {
    normalRecords: 59000,
    failureRecords: 1000,
    imbalanceRatio: "59:1",
  },
  models: demonstrationModels,
  businessImpact: {
    falsePositiveCount: 132,
    falseNegativeCount: 18,
    falsePositiveCost: 1320,
    falseNegativeCost: 9000,
    estimatedCost: 10320,
  },
  recentExperiments: demonstrationExperiments,
  lastUpdated: "Demo snapshot / 25 Oct 2026 · 09:30 UTC",
};

export function getDemonstrationDashboard(): DashboardSnapshot {
  return {
    ...demonstrationDashboard,
    models: demonstrationDashboard.models.map((model) => ({ ...model })),
    recentExperiments: demonstrationDashboard.recentExperiments.map((experiment) => ({
      ...experiment,
      metrics: experiment.metrics ? { ...experiment.metrics } : undefined,
    })),
  };
}

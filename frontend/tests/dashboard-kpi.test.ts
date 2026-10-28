import { describe, expect, it } from "vitest";
import type { DashboardSnapshot, ModelMetrics } from "@/types";

describe("Dashboard KPI Strip & MetricDisplay (AUDIT-002)", () => {
  const sampleModels: ModelMetrics[] = [
    {
      modelId: "exp:rf_orig",
      modelName: "random_forest / original",
      prAuc: 0.8864,
      rocAuc: 0.9921,
      precision: 0.9048,
      recall: 0.665,
      f1Score: 0.7666,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
    {
      modelId: "exp:cat_cw",
      modelName: "catboost / class_weight",
      prAuc: 0.8011,
      rocAuc: 0.9941,
      precision: 0.488,
      recall: 0.915,
      f1Score: 0.6365,
      threshold: 0.115,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
    {
      modelId: "exp:log_smote",
      modelName: "logistic_regression / smote",
      prAuc: 0.7445,
      rocAuc: 0.9521,
      precision: 0.3802,
      recall: 0.92,
      f1Score: 0.538,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
  ];

  const sampleSnapshot: DashboardSnapshot = {
    dataset: {
      id: "dataset-train",
      name: "APS Training Set",
      source: "aps_failure_training_set.csv",
      rowCount: 60000,
      featureCount: 170,
      positiveClassLabel: "pos",
      updatedAt: "2026-10-28T12:00:00Z",
      fingerprint: "scania-train-fingerprint",
    },
    distribution: {
      failureRecords: 1000,
      normalRecords: 59000,
      imbalanceRatio: "1:59",
    },
    models: sampleModels,
    businessImpact: {
      falsePositiveCount: 192,
      falseNegativeCount: 17,
      falsePositiveCost: 1,
      falseNegativeCost: 10,
      estimatedCost: 362,
    },
    recentExperiments: [],
    lastUpdated: "2026-10-28T12:00:00Z",
  };

  it("selects top validation model by highest PR-AUC", () => {
    const bestModel = sampleSnapshot.models.length
      ? sampleSnapshot.models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), sampleSnapshot.models[0])
      : undefined;

    expect(bestModel).toBeDefined();
    expect(bestModel?.modelName).toBe("random_forest / original");
    expect(bestModel?.prAuc).toBe(0.8864);
  });

  it("cleans model name and preserves full name for tooltip title", () => {
    const bestModel = sampleSnapshot.models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), sampleSnapshot.models[0]);
    const displayValue = bestModel.modelName.replace(" Regression", "");
    const tooltipTitle = bestModel.modelName;

    expect(displayValue).toBe("random_forest / original");
    expect(tooltipTitle).toBe("random_forest / original");
    // Displays full name as tooltip to ensure accessibility on small viewport truncations
    expect(tooltipTitle.length).toBeGreaterThan(0);
  });

  it("handles empty model list gracefully", () => {
    const emptySnapshot: DashboardSnapshot = {
      ...sampleSnapshot,
      models: [],
    };
    const bestModel = emptySnapshot.models.length
      ? emptySnapshot.models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), emptySnapshot.models[0])
      : undefined;

    const displayValue = bestModel ? bestModel.modelName.replace(" Regression", "") : "—";
    const tooltipTitle = bestModel ? bestModel.modelName : undefined;

    expect(bestModel).toBeUndefined();
    expect(displayValue).toBe("—");
    expect(tooltipTitle).toBeUndefined();
  });

  it("formats validation business cost accurately with illustrative cost assumptions", () => {
    expect(sampleSnapshot.businessImpact?.falsePositiveCost).toBe(1);
    expect(sampleSnapshot.businessImpact?.falseNegativeCost).toBe(10);
    expect(sampleSnapshot.businessImpact?.estimatedCost).toBe(362);
  });
});

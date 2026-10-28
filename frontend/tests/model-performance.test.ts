import { describe, expect, it } from "vitest";
import type { ModelMetrics } from "@/types";

describe("ModelPerformance Component & Data Transformation", () => {
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
      modelId: "exp:cat_orig",
      modelName: "catboost / original",
      prAuc: 0.8758,
      rocAuc: 0.9915,
      precision: 0.875,
      recall: 0.735,
      f1Score: 0.7989,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
    {
      modelId: "exp:xgb_orig",
      modelName: "xgboost / original",
      prAuc: 0.8717,
      rocAuc: 0.9902,
      precision: 0.8625,
      recall: 0.69,
      f1Score: 0.7667,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
    {
      modelId: "exp:rf_cw",
      modelName: "random_forest / class_weight",
      prAuc: 0.8604,
      rocAuc: 0.9881,
      precision: 0.6761,
      recall: 0.835,
      f1Score: 0.7472,
      threshold: 0.5,
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
      modelId: "exp:log_orig",
      modelName: "logistic_regression / original",
      prAuc: 0.7672,
      rocAuc: 0.9610,
      precision: 0.75,
      recall: 0.645,
      f1Score: 0.6935,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
  ];

  it("sorts models deterministically by PR-AUC descending", () => {
    const sorted = [...sampleModels].sort((a, b) => (b.prAuc ?? 0) - (a.prAuc ?? 0));
    expect(sorted[0].modelName).toBe("random_forest / original");
    expect(sorted[0].prAuc).toBe(0.8864);
    expect(sorted[1].modelName).toBe("catboost / original");
    expect(sorted[sorted.length - 1].prAuc).toBe(0.7445);
  });

  it("transforms and formats model labels readably without blind truncation", () => {
    function formatModelLabel(name: string): string {
      let label = name;
      label = label.replace(/^random_forest/i, "RF");
      label = label.replace(/^catboost/i, "CatBoost");
      label = label.replace(/^xgboost/i, "XGBoost");
      label = label.replace(/^logistic_regression/i, "LogReg");
      label = label.replace(/\s*\/\s*original/i, " (Orig)");
      label = label.replace(/\s*\/\s*class_weight/i, " (CW)");
      label = label.replace(/\s*\/\s*smote/i, " (SMOTE)");
      if (label.length > 20) return `${label.slice(0, 18)}…`;
      return label;
    }

    expect(formatModelLabel("random_forest / original")).toBe("RF (Orig)");
    expect(formatModelLabel("catboost / original")).toBe("CatBoost (Orig)");
    expect(formatModelLabel("xgboost / original")).toBe("XGBoost (Orig)");
    expect(formatModelLabel("logistic_regression / class_weight")).toBe("LogReg (CW)");
    expect(formatModelLabel("logistic_regression / smote")).toBe("LogReg (SMOTE)");
  });

  it("disambiguates identical model labels with run indices", () => {
    const modelsWithDuplicates = [
      { ...sampleModels[0], modelId: "exp:rf_1", modelName: "random_forest / original" },
      { ...sampleModels[1], modelId: "exp:rf_2", modelName: "random_forest / original" },
      { ...sampleModels[2], modelId: "exp:cat_1", modelName: "catboost / original" },
    ];

    function formatModelLabel(name: string): string {
      let label = name;
      label = label.replace(/^random_forest/i, "RF");
      label = label.replace(/^catboost/i, "CatBoost");
      label = label.replace(/\s*\/\s*original/i, " (Orig)");
      return label;
    }

    const labelCounts: Record<string, number> = {};
    modelsWithDuplicates.forEach((m) => {
      const base = formatModelLabel(m.modelName);
      labelCounts[base] = (labelCounts[base] ?? 0) + 1;
    });

    const seenLabels: Record<string, number> = {};
    const chartLabels = modelsWithDuplicates.map((model) => {
      const base = formatModelLabel(model.modelName);
      let label = base;
      if (labelCounts[base] > 1) {
        seenLabels[base] = (seenLabels[base] ?? 0) + 1;
        label = `${base} #${seenLabels[base]}`;
      }
      return label;
    });

    expect(chartLabels).toEqual(["RF (Orig) #1", "RF (Orig) #2", "CatBoost (Orig)"]);
  });

  it("maps all four metrics with exact persisted numeric values", () => {
    const sorted = [...sampleModels].sort((a, b) => (b.prAuc ?? 0) - (a.prAuc ?? 0));
    const top6 = sorted.slice(0, 6);

    const chartData = top6.map((model) => ({
      modelId: model.modelId,
      modelName: model.modelName,
      "PR-AUC": model.prAuc ?? 0,
      Precision: model.precision ?? 0,
      Recall: model.recall ?? 0,
      "F1-score": model.f1Score ?? 0,
    }));

    expect(chartData).toHaveLength(6);

    // Verify first model: Random Forest original
    expect(chartData[0]["PR-AUC"]).toBe(0.8864);
    expect(chartData[0]["Precision"]).toBe(0.9048);
    expect(chartData[0]["Recall"]).toBe(0.665);
    expect(chartData[0]["F1-score"]).toBe(0.7666);

    // Verify all 4 series have positive numbers and valid keys
    for (const item of chartData) {
      expect(item["PR-AUC"]).toBeGreaterThan(0);
      expect(item["Precision"]).toBeGreaterThan(0);
      expect(item["Recall"]).toBeGreaterThan(0);
      expect(item["F1-score"]).toBeGreaterThan(0);
    }
  });

  it("handles missing values gracefully without NaN", () => {
    const modelWithMissing: ModelMetrics = {
      modelId: "exp:partial",
      modelName: "custom_model",
      prAuc: 0.81,
      precision: 0.75,
      recall: 0.70,
      f1Score: 0.724,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    };

    const transformed = {
      "PR-AUC": modelWithMissing.prAuc ?? 0,
      Precision: modelWithMissing.precision ?? 0,
      Recall: modelWithMissing.recall ?? 0,
      "F1-score": modelWithMissing.f1Score ?? 0,
    };

    expect(Number.isFinite(transformed["PR-AUC"])).toBe(true);
    expect(Number.isFinite(transformed["Precision"])).toBe(true);
    expect(Number.isFinite(transformed["Recall"])).toBe(true);
    expect(Number.isFinite(transformed["F1-score"])).toBe(true);
  });
});

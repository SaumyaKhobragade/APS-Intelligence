import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPreprocessingStages } from "@/services/dataset-service";
import { PreprocessingPipeline } from "@/components/datasets/preprocessing-pipeline";
import { ModelDetailsPanel } from "@/components/models/model-details-panel";
import type { BackendDatasetAnalyticsResponse } from "@/services/backend-contracts";
import type { ModelEvaluation } from "@/types";

describe("Phase 13.3.2.1 Evidence Accuracy Tests", () => {
  const mockAnalyticsResponse: BackendDatasetAnalyticsResponse = {
    dataset: {
      dataset_id: "training-bb484302e3a3a1c8",
      dataset_name: "aps_failure_training_set",
      dataset_type: "training",
      source_file_name: "aps_failure_training_set.csv",
      fingerprint: "bb484302e3a3a1c8ef5e1f0129c4dc7cbd58f350867f95b575461ca21ab6b9da",
      file_size_bytes: 44669194,
      record_count: 60000,
      feature_count: 170,
      target_column: "class",
      status: "ready",
      imported_at: "2026-10-25T17:04:46",
    },
    profile_available: true,
    profile: {
      dataset: {
        dataset_id: "training-bb484302e3a3a1c8",
        dataset_name: "aps_failure_training_set",
        dataset_type: "training",
        source_file_name: "aps_failure_training_set.csv",
        fingerprint: "bb484302e3a3a1c8ef5e1f0129c4dc7cbd58f350867f95b575461ca21ab6b9da",
        file_size_bytes: 44669194,
        record_count: 60000,
        feature_count: 170,
        target_column: "class",
        status: "ready",
        imported_at: "2026-10-25T17:04:46",
      },
      target_column: "class",
      feature_columns: ["aa_000"],
      numerical_feature_count: 170,
      categorical_feature_count: 0,
      feature_data_types: { aa_000: "numeric" },
      generated_at: "2026-10-25T17:04:50",
      quality: {
        dataset_id: "training-bb484302e3a3a1c8",
        duplicate_row_count: 0,
        duplicate_column_names: [],
        constant_features: [],
        zero_variance_features: [],
        all_missing_features: [],
        infinite_value_counts: {},
        invalid_value_counts: {},
        unexpected_target_labels: [],
        total_missing_values: 850000,
        overall_missing_percentage: 8.33,
        excessive_missingness_threshold: 0.5,
        generated_at: "2026-10-25T17:04:50",
      },
      class_distribution: {
        target_column: "class",
        total_records: 60000,
        class_counts: { neg: 59000, pos: 1000 },
        class_percentages: { neg: 98.33, pos: 1.67 },
        normal_records: 59000,
        failure_records: 1000,
        normal_percentage: 98.33,
        failure_percentage: 1.67,
        imbalance_ratio: "1:59",
        unexpected_labels: [],
      },
      missing_values: {
        features_with_missing_values: 169,
        features_without_missing_values: 1,
        features_with_excessive_missingness: 8,
        total_missing_values: 850000,
        overall_missing_percentage: 8.33,
        items: [{ feature_name: "aa_000", missing_count: 0, missing_percentage: 0, non_missing_count: 60000, status: "none" }],
      },
      profile: {
        items: [{
          feature_name: "aa_000",
          data_type: "numeric",
          missing_count: 0,
          missing_percentage: 0,
          non_missing_count: 60000,
          unique_value_count: 500,
          is_constant: false,
          is_all_missing: false,
          has_excessive_missingness: false,
        }],
        page: 1,
        page_size: 50,
        total: 170,
      },
    },
    feature_page: {
      items: [{
        feature_name: "aa_000",
        data_type: "numeric",
        missing_count: 0,
        missing_percentage: 0,
        non_missing_count: 60000,
        unique_value_count: 500,
        is_constant: false,
        is_all_missing: false,
        has_excessive_missingness: false,
      }],
      page: 1,
      page_size: 50,
      total: 170,
    },
    splits: {
      dataset_id: "training-bb484302e3a3a1c8",
      validation_ratio: 0.2,
      random_seed: 42,
      test_isolation_note: "Strict split isolation: holdout validation and testing partitions are never exposed to training folds.",
      splits: [
        {
          split_name: "training",
          record_count: 48000,
          fingerprint: "fp-train",
          class_counts: { neg: 47200, pos: 800 },
          class_percentages: { neg: 98.33, pos: 1.67 },
          source_dataset_id: "training-bb484302e3a3a1c8",
        },
        {
          split_name: "validation",
          record_count: 12000,
          fingerprint: "fp-val",
          class_counts: { neg: 11800, pos: 200 },
          class_percentages: { neg: 98.33, pos: 1.67 },
          source_dataset_id: "training-bb484302e3a3a1c8",
        },
      ],
    },
    source_available: true,
    availability: [],
  };

  const baseModel: ModelEvaluation = {
    modelId: "experiment:base-model",
    modelName: "test_model",
    modelType: "random_forest",
    evaluationStatus: "completed",
    trainingDataset: "training-bb484302e3a3a1c8",
    evaluationDataset: "training-bb484302e3a3a1c8 / validation",
    hyperparameters: {},
    prAuc: 0.85,
    precision: 0.75,
    recall: 0.70,
    f1Score: 0.72,
    threshold: 0.5,
    evaluatedAt: "2026-10-26T16:00:00",
    artifactIntegrityStatus: "verified",
    artifactAvailable: true,
    featureImportanceAvailable: false,
    sourceDatabase: "phase9_validation.db",
    confusionMatrix: { truePositive: 140, trueNegative: 11750, falsePositive: 50, falseNegative: 60 },
    businessImpact: {
      falsePositiveCount: 50,
      falseNegativeCount: 60,
      falsePositiveCost: 50,
      falseNegativeCost: 600,
      estimatedCost: 650,
      unitFalsePositiveCost: 1,
      unitFalseNegativeCost: 10,
    },
    precisionRecallCurve: [],
  };

  // 1. A tree model with native missing-value handling does not display median imputation as applied.
  it("does not display median imputation as applied for a tree model with native missing-value handling", () => {
    const stages = buildPreprocessingStages(mockAnalyticsResponse, {
      modelName: "CatBoost Native Imbalance",
      modelFamily: "catboost",
      preprocessingStrategy: "native",
      imbalanceStrategy: "class_weight",
    });

    const missingStage = stages.find((s) => s.id === "missing-values");
    expect(missingStage).toBeDefined();
    expect(missingStage?.status).toBe("not_applicable");
    expect(missingStage?.status).not.toBe("applied");
    expect(missingStage?.detail).toContain("Native missing-value routing");
    expect(missingStage?.detail).not.toContain("Median");
  });

  // 2. A tree model does not display StandardScaler as applied.
  it("does not display StandardScaler as applied for a tree model", () => {
    const stages = buildPreprocessingStages(mockAnalyticsResponse, {
      modelName: "Random Forest",
      modelFamily: "random_forest",
      preprocessingStrategy: "median",
      imbalanceStrategy: "original",
    });

    const scalingStage = stages.find((s) => s.id === "feature-scaling");
    expect(scalingStage).toBeDefined();
    expect(scalingStage?.status).toBe("not_applicable");
    expect(scalingStage?.status).not.toBe("applied");
    expect(scalingStage?.description).toContain("Tree ensembles consume unscaled numeric features");
  });

  // 3. An original imbalance strategy does not display SMOTE or class weighting as applied.
  it("does not display SMOTE or class weighting as applied for original imbalance strategy", () => {
    const stages = buildPreprocessingStages(mockAnalyticsResponse, {
      modelName: "Logistic Regression Baseline",
      modelFamily: "logistic_regression",
      imbalanceStrategy: "original",
      preprocessingStrategy: "median",
      configuration: { scaling: true },
    });

    const imbalanceStage = stages.find((s) => s.id === "class-imbalance");
    expect(imbalanceStage).toBeDefined();
    expect(imbalanceStage?.status).toBe("not_applicable");
    expect(imbalanceStage?.status).not.toBe("applied");
    expect(imbalanceStage?.detail).toContain("No resampling or weighting");
  });

  // 4. A linear model displays scaling only when supported by its persisted configuration.
  it("displays scaling as applied for a linear model only when supported by configuration", () => {
    const scaledLinearStages = buildPreprocessingStages(mockAnalyticsResponse, {
      modelName: "Logistic Regression Scaled",
      modelFamily: "logistic_regression",
      preprocessingStrategy: "standard_scaler",
      configuration: { scaling: true },
    });
    const scaledStage = scaledLinearStages.find((s) => s.id === "feature-scaling");
    expect(scaledStage?.status).toBe("applied");

    const unscaledLinearStages = buildPreprocessingStages(mockAnalyticsResponse, {
      modelName: "Logistic Regression Raw",
      modelFamily: "logistic_regression",
      preprocessingStrategy: "median",
      configuration: { scaling: false },
    });
    const unscaledStage = unscaledLinearStages.find((s) => s.id === "feature-scaling");
    expect(unscaledStage?.status).toBe("not_applicable");
    expect(unscaledStage?.status).not.toBe("applied");
  });

  // 5. Missing preprocessing configuration produces an honest unavailable/contract state.
  it("produces an honest unavailable state when preprocessing configuration is missing", () => {
    const stages = buildPreprocessingStages(mockAnalyticsResponse, {
      modelName: "Unknown Legacy Model",
      configuration: null,
    });

    const missingStage = stages.find((s) => s.id === "missing-values");
    expect(missingStage?.status).toBe("unavailable");
    expect(missingStage?.status).not.toBe("completed");
    expect(missingStage?.status).not.toBe("applied");

    const scalingStage = stages.find((s) => s.id === "feature-scaling");
    expect(scalingStage?.status).toBe("unavailable");
    expect(scalingStage?.status).not.toBe("completed");
    expect(scalingStage?.status).not.toBe("applied");
  });

  // 6. Fallback stages are visibly identified as a general contract, not experiment-specific execution evidence.
  it("identifies fallback stages visibly as general contract, not execution evidence", () => {
    const html = renderToStaticMarkup(
      React.createElement(PreprocessingPipeline, { stages: [] })
    );

    expect(html).toContain("General contract");
    expect(html).toContain("General training-pipeline contract · Not an experiment-specific execution record");
    expect(html).toContain("Notice · General pipeline contract");
    expect(html).toContain("Pipeline contract");
    expect(html).not.toContain("Verified execution");
  });

  // 7. Missing evaluation scope is not silently converted into validation.
  it("does not silently convert missing evaluation scope into validation", () => {
    const modelWithoutScope: ModelEvaluation = {
      ...baseModel,
      evaluationScope: undefined,
    };

    const html = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: modelWithoutScope })
    );

    expect(html).toContain("Not recorded");
    expect(html).toContain("Evaluation scope was not recorded in historical metadata.");
    // Group 02 should show "Not recorded", not "validation"
    expect(html).not.toContain("<p class=\"mt-1.5 font-mono text-xs text-signal\">validation</p>");
  });

  // 8. A non-default threshold is not automatically labelled calibrated.
  it("does not automatically label a non-default threshold as calibrated without provenance", () => {
    const modelCustomThreshold: ModelEvaluation = {
      ...baseModel,
      threshold: 0.245,
      calibrationProvenance: undefined,
    };

    const html = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: modelCustomThreshold })
    );

    expect(html).toContain("24.5%");
    expect(html).toContain("Persisted operating threshold");
    expect(html).not.toContain("Calibrated operating point");

    // When calibration provenance is explicitly present
    const modelCalibrated: ModelEvaluation = {
      ...baseModel,
      threshold: 0.115,
      calibrationProvenance: "isotonic",
    };

    const htmlCalibrated = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: modelCalibrated })
    );
    expect(htmlCalibrated).toContain("11.5%");
    expect(htmlCalibrated).toContain("Calibrated operating point (isotonic)");
  });

  // 9. Business-cost weights remain consistent with FP=1 and FN=10 when shown.
  it("maintains business-cost consistency with FP=1 and FN=10 without dollar amounts", () => {
    const modelWithCost: ModelEvaluation = {
      ...baseModel,
      confusionMatrix: { truePositive: 100, trueNegative: 11000, falsePositive: 43, falseNegative: 71 },
      businessImpact: {
        falsePositiveCount: 43,
        falseNegativeCount: 71,
        falsePositiveCost: 43,
        falseNegativeCost: 710,
        estimatedCost: 753, // 43 * 1 + 71 * 10 = 753
        unitFalsePositiveCost: 1,
        unitFalseNegativeCost: 10,
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: modelWithCost })
    );

    expect(html).toContain("Illustrative business cost");
    expect(html).toContain("753");
    expect(html).toContain("43 × 1 + 71 × 10 = 753");
    expect(html).toContain("FP=1, FN=10");
    // Must not introduce $500 or $10 as costs
    expect(html).not.toContain("$500");
    expect(html).not.toContain("$10");
  });
});

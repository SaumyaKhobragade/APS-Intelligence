import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildPreprocessingStages } from "@/services/dataset-service";
import { PreprocessingPipeline } from "@/components/datasets/preprocessing-pipeline";
import { FeatureImportanceChart } from "@/components/models/feature-importance-chart";
import { ModelDetailsPanel } from "@/components/models/model-details-panel";
import type { BackendDatasetAnalyticsResponse } from "@/services/backend-contracts";
import type { ModelEvaluation } from "@/types";

describe("Phase 13.3.2 Evidence Refinement Tests", () => {
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

  // ==========================================
  // Issue 1: Dataset Explorer Section 6 Preprocessing Pipeline
  // ==========================================
  describe("Issue 1: Preprocessing Pipeline Evidence & Display", () => {
    it("generates all 7 distinct pipeline stages from backend analytics evidence", () => {
      const stages = buildPreprocessingStages(mockAnalyticsResponse);
      expect(stages).toHaveLength(7);

      expect(stages[0].id).toBe("raw-ingestion");
      expect(stages[0].status).toBe("completed");
      expect(stages[0].detail).toContain("60,000 records ingested");

      expect(stages[1].id).toBe("schema-validation");
      expect(stages[1].status).toBe("completed");
      expect(stages[1].detail).toContain("170 numeric sensor features");

      expect(stages[2].id).toBe("train-val-split");
      expect(stages[2].status).toBe("completed");
      expect(stages[2].detail).toContain("training: 48,000 rows");
      expect(stages[2].detail).toContain("validation: 12,000 rows");

      expect(stages[3].id).toBe("missing-values");
      expect(stages[3].fittingType).toBe("fitted_train_only");
      expect(stages[3].partition).toContain("Fitted on training only");

      expect(stages[4].id).toBe("feature-scaling");
      expect(stages[4].fittingType).toBe("fitted_train_only");

      expect(stages[5].id).toBe("class-imbalance");
      expect(stages[5].fittingType).toBe("fitted_train_only");
      expect(stages[5].detail).toContain("1:59");

      expect(stages[6].id).toBe("model-ready");
      expect(stages[6].status).toBe("completed");
      expect(stages[6].detail).toContain("170-dimensional");
    });

    it("honestly marks split stage unavailable when splits metadata is missing", () => {
      const responseWithoutSplits: BackendDatasetAnalyticsResponse = {
        ...mockAnalyticsResponse,
        splits: null,
      };
      const stages = buildPreprocessingStages(responseWithoutSplits);
      expect(stages[2].id).toBe("train-val-split");
      expect(stages[2].status).toBe("unavailable");
      expect(stages[2].detail).toBe("Holdout split metadata not persisted for this dataset profile");
    });

    it("renders fallback default contract stages when passed an empty stages array (never a blank panel)", () => {
      const html = renderToStaticMarkup(
        React.createElement(PreprocessingPipeline, { stages: [] }),
      );
      expect(html).toContain("Transformation boundary / Training pipeline contract");
      expect(html).toContain("1. Raw dataset ingestion");
      expect(html).toContain("7. Final model-ready feature representation");
      expect(html).toContain("Training-Only Fitting Boundary");
    });
  });

  // ==========================================
  // Issue 2: Model Comparison Section 5 Feature Importance
  // ==========================================
  describe("Issue 2: Feature Importance Selector & Availability", () => {
    const modelWithoutArtifact: ModelEvaluation = {
      modelId: "experiment:phase9-random_forest__original",
      modelName: "random_forest / original",
      modelType: "random_forest",
      evaluationStatus: "completed",
      trainingDataset: "training-bb484302e3a3a1c8",
      evaluationDataset: "training-bb484302e3a3a1c8 / validation",
      hyperparameters: { n_estimators: 150, max_features: "log2" },
      prAuc: 0.886,
      precision: 0.78,
      recall: 0.72,
      f1Score: 0.75,
      threshold: 0.5,
      evaluatedAt: "2026-10-26T16:00:00",
      confusionMatrix: { truePositive: 144, trueNegative: 11750, falsePositive: 50, falseNegative: 56 },
      businessImpact: {
        falsePositiveCount: 50,
        falseNegativeCount: 56,
        falsePositiveCost: 50,
        falseNegativeCost: 560,
        estimatedCost: 610,
        unitFalsePositiveCost: 1,
        unitFalseNegativeCost: 10,
      },
      precisionRecallCurve: [],
      artifactAvailable: false,
      featureImportanceAvailable: false,
      featureImportance: [],
    };

    const modelWithArtifact: ModelEvaluation = {
      modelId: "experiment:exp-2a0b0d113fba4497ac1c",
      modelName: "random_forest / original (exp-2a0b)",
      modelType: "random_forest",
      evaluationStatus: "completed",
      trainingDataset: "training-bb484302e3a3a1c8",
      evaluationDataset: "training-bb484302e3a3a1c8 / validation",
      hyperparameters: { n_estimators: 100, max_depth: 20 },
      prAuc: 0.890,
      precision: 0.79,
      recall: 0.74,
      f1Score: 0.76,
      threshold: 0.5,
      evaluatedAt: "2026-10-26T03:16:00",
      confusionMatrix: { truePositive: 148, trueNegative: 11760, falsePositive: 40, falseNegative: 52 },
      businessImpact: {
        falsePositiveCount: 40,
        falseNegativeCount: 52,
        falsePositiveCost: 40,
        falseNegativeCost: 520,
        estimatedCost: 560,
        unitFalsePositiveCost: 1,
        unitFalseNegativeCost: 10,
      },
      precisionRecallCurve: [],
      artifactAvailable: true,
      featureImportanceAvailable: true,
      featureImportance: [
        { featureName: "ag_002", importance: 0.082, methodology: "gain" },
        { featureName: "ay_005", importance: 0.071, methodology: "gain" },
      ],
    };

    it("defaults to a model with valid feature importance instead of empty first model", () => {
      // modelWithoutArtifact is first in array, but modelWithArtifact has feature importance
      const html = renderToStaticMarkup(
        React.createElement(FeatureImportanceChart, {
          models: [modelWithoutArtifact, modelWithArtifact],
          selectedModelId: modelWithoutArtifact.modelId,
          onSelectModel: () => {},
        }),
      );

      // Should default to modelWithArtifact because modelWithoutArtifact has no artifact
      expect(html).toContain("Top 15 influential features");
      expect(html).toContain("random_forest / original (exp-2a0b)");
      expect(html).toContain("gain");
    });

    it("renders useful empty state when no compared models have feature importance artifacts", () => {
      const html = renderToStaticMarkup(
        React.createElement(FeatureImportanceChart, {
          models: [modelWithoutArtifact],
          selectedModelId: modelWithoutArtifact.modelId,
          onSelectModel: () => {},
        }),
      );

      expect(html).toContain("No feature-importance artifacts available");
      expect(html).toContain("None of the compared historical model records include persisted feature attribution artifacts.");
    });
  });

  // ==========================================
  // Issue 3: Model Details Panel Grouping & Hyperparameters
  // ==========================================
  describe("Issue 3: Model Details Panel Grouping & Hyperparameters", () => {
    it("renders persisted hyperparameters when available without fabricating defaults", () => {
      const model: ModelEvaluation = {
        modelId: "experiment:phase9-random_forest__original",
        modelName: "random_forest / original",
        modelType: "random_forest",
        strategy: "original",
        evaluationStatus: "completed",
        trainingDataset: "training-bb484302e3a3a1c8",
        evaluationDataset: "training-bb484302e3a3a1c8 / validation",
        evaluationScope: "validation",
        hyperparameters: {
          n_estimators: 150,
          max_features: "log2",
          min_samples_leaf: 2,
        },
        prAuc: 0.886,
        precision: 0.78,
        recall: 0.72,
        f1Score: 0.75,
        threshold: 0.5,
        evaluatedAt: "2026-10-26T16:00:00",
        trainingDurationSeconds: 1.42,
        artifactIntegrityStatus: "verified",
        artifactAvailable: false,
        featureImportanceAvailable: false,
        sourceDatabase: "artifacts/phase9/phase9-final-validation/model_comparison.csv",
        confusionMatrix: { truePositive: 144, trueNegative: 11750, falsePositive: 50, falseNegative: 56 },
        businessImpact: {
          falsePositiveCount: 50,
          falseNegativeCount: 56,
          falsePositiveCost: 50,
          falseNegativeCost: 560,
          estimatedCost: 610,
          unitFalsePositiveCost: 1,
          unitFalseNegativeCost: 10,
        },
        precisionRecallCurve: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(ModelDetailsPanel, { model }),
      );

      // Priority 1: Persisted hyperparameters displayed
      expect(html).toContain("Group 01 / Model configuration &amp; hyperparameters");
      expect(html).toContain("n estimators");
      expect(html).toContain("150");
      expect(html).toContain("max features");
      expect(html).toContain("log2");
      expect(html).toContain("min samples leaf");
      expect(html).toContain("2");

      // Preserves 50% threshold (not substituted by 11.5%)
      expect(html).toContain("50.0%");
      expect(html).toContain("Standard default threshold (50%)");

      // Groups rendered
      expect(html).toContain("Group 02 / Dataset &amp; split provenance");
      expect(html).toContain("Group 03 / Evaluation context &amp; metrics");
      expect(html).toContain("Group 04 / Artifact integrity &amp; governance");
    });

    it("displays honest provenance instead of empty panel when hyperparameters are absent", () => {
      const modelWithoutHp: ModelEvaluation = {
        modelId: "experiment:historical-empty",
        modelName: "catboost / legacy",
        modelType: "catboost",
        evaluationStatus: "completed",
        trainingDataset: "training-bb484302e3a3a1c8",
        evaluationDataset: "training-bb484302e3a3a1c8 / validation",
        evaluationScope: "validation",
        hyperparameters: {},
        prAuc: 0.795,
        precision: 0.65,
        recall: 0.80,
        f1Score: 0.72,
        threshold: 0.25,
        evaluatedAt: "2026-10-25T12:00:00",
        artifactIntegrityStatus: "not_recorded",
        artifactAvailable: false,
        featureImportanceAvailable: false,
        confusionMatrix: { truePositive: 160, trueNegative: 11600, falsePositive: 200, falseNegative: 40 },
        businessImpact: {
          falsePositiveCount: 200,
          falseNegativeCount: 40,
          falsePositiveCost: 200,
          falseNegativeCost: 400,
          estimatedCost: 600,
          unitFalsePositiveCost: 1,
          unitFalseNegativeCost: 10,
        },
        precisionRecallCurve: [],
      };

      const html = renderToStaticMarkup(
        React.createElement(ModelDetailsPanel, { model: modelWithoutHp }),
      );

      // Honest label for missing hyperparameters
      expect(html).toContain("Not recorded in historical metadata");
      // Still renders provenance groups
      expect(html).toContain("Group 02 / Dataset &amp; split provenance");
      expect(html).toContain("Group 03 / Evaluation context &amp; metrics");
      expect(html).toContain("Group 04 / Artifact integrity &amp; governance");
      // Preserves 25% threshold
      expect(html).toContain("25.0%");
    });
  });
});

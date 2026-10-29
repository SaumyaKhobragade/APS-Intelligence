import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelDetailsPanel } from "@/components/models/model-details-panel";
import { ModelMetricsTable } from "@/components/models/model-metrics-table";
import { BusinessImpactComparison } from "@/components/models/business-impact-comparison";
import { computeIllustrativeCost } from "@/lib/business-cost";
import {
  buildPreprocessingStages,
  isCompleteExecutionRecord,
  isSupportedPreprocessingStrategy,
  isSupportedImbalanceStrategy,
  SUPPORTED_PREPROCESSING_STRATEGIES,
  SUPPORTED_IMBALANCE_STRATEGIES,
} from "@/services/dataset-service";
import type { BackendDatasetAnalyticsResponse } from "@/services/backend-contracts";
import type { ModelEvaluation } from "@/types";

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
  modelId: "catboost-native-imbalance",
  modelName: "CatBoost Native Imbalance",
  modelType: "catboost",
  evaluationStatus: "completed",
  trainingDataset: "training-bb484302e3a3a1c8",
  evaluationDataset: "training-bb484302e3a3a1c8 / validation",
  hyperparameters: { iterations: 500, learning_rate: 0.05, depth: 6 },
  prAuc: 0.892,
  rocAuc: 0.985,
  precision: 0.825,
  recall: 0.795,
  f1Score: 0.81,
  specificity: 0.997,
  balancedAccuracy: 0.896,
  threshold: 0.115,
  calibrationMethod: "isotonic",
  calibrationProvenance: "isotonic",
  evaluatedAt: "2026-10-26T16:00:00",
  artifactIntegrityStatus: "verified",
  artifactAvailable: true,
  featureImportanceAvailable: false,
  sourceDatabase: "phase9_validation.db",
  strategy: "class_weight",
  preprocessingStrategy: "native",
  evaluationScope: "validation",
  confusionMatrix: { truePositive: 159, trueNegative: 11765, falsePositive: 35, falseNegative: 41 },
  businessImpact: {
    falsePositiveCount: 35,
    falseNegativeCount: 41,
    falsePositiveCost: 35,
    falseNegativeCost: 410,
    estimatedCost: 445,
    unitFalsePositiveCost: 1,
    unitFalseNegativeCost: 10,
  },
  precisionRecallCurve: [],
};

describe("Phase 13.3.2.3 — Strict Execution Evidence & Cost Explanation Cleanup", () => {
  describe("1. Strict execution-record validation", () => {
    it("validates supported vocabulary constants", () => {
      expect(SUPPORTED_PREPROCESSING_STRATEGIES).toEqual([
        "native",
        "median",
        "mean",
        "constant",
        "missingness_indicators",
        "standard_scaler",
      ]);
      expect(SUPPORTED_IMBALANCE_STRATEGIES).toEqual([
        "original",
        "smote",
        "class_weight",
        "weighted",
      ]);
      expect(isSupportedPreprocessingStrategy("native")).toBe(true);
      expect(isSupportedPreprocessingStrategy("MEDIAN")).toBe(true);
      expect(isSupportedPreprocessingStrategy("quantum_imputer")).toBe(false);
      expect(isSupportedImbalanceStrategy("original")).toBe(true);
      expect(isSupportedImbalanceStrategy("SMOTE")).toBe(true);
      expect(isSupportedImbalanceStrategy("random_undersample")).toBe(false);
    });

    it("requires explicit isExecutionRecord === true to confirm complete execution record", () => {
      // Omitted / undefined isExecutionRecord
      expect(
        isCompleteExecutionRecord({
          modelName: "CatBoost",
          preprocessingStrategy: "native",
          imbalanceStrategy: "original",
        })
      ).toBe(false);

      // Explicitly false
      expect(
        isCompleteExecutionRecord({
          modelName: "CatBoost",
          preprocessingStrategy: "native",
          imbalanceStrategy: "original",
          isExecutionRecord: false,
        })
      ).toBe(false);

      // Explicitly true with valid strategies
      expect(
        isCompleteExecutionRecord({
          modelName: "CatBoost",
          preprocessingStrategy: "native",
          imbalanceStrategy: "original",
          isExecutionRecord: true,
        })
      ).toBe(true);
    });

    it("rejects unknown preprocessing strategies from complete execution record", () => {
      expect(
        isCompleteExecutionRecord({
          modelName: "Experimental Model",
          preprocessingStrategy: "quantum_imputer",
          imbalanceStrategy: "original",
          isExecutionRecord: true,
        })
      ).toBe(false);
    });

    it("rejects unknown imbalance strategies from complete execution record", () => {
      expect(
        isCompleteExecutionRecord({
          modelName: "Experimental Model",
          preprocessingStrategy: "median",
          imbalanceStrategy: "random_undersample",
          isExecutionRecord: true,
        })
      ).toBe(false);
    });

    it("produces unavailable status and never applied for unknown preprocessing strategy", () => {
      const stages = buildPreprocessingStages(mockAnalyticsResponse, {
        modelName: "Custom Model",
        preprocessingStrategy: "experimental_fill",
        imbalanceStrategy: "original",
      });

      const prepStage = stages.find((s) => s.id === "missing-values");
      expect(prepStage?.status).toBe("unavailable");
      expect(prepStage?.status).not.toBe("applied");
      expect(prepStage?.evidenceType).not.toBe("execution_evidence");
      expect(prepStage?.detail).toContain("Evidence unavailable (unrecognized strategy)");
    });

    it("produces unavailable status and never applied for unknown imbalance strategy", () => {
      const stages = buildPreprocessingStages(mockAnalyticsResponse, {
        modelName: "Custom Model",
        preprocessingStrategy: "median",
        imbalanceStrategy: "custom_cluster_downsample",
      });

      const imbStage = stages.find((s) => s.id === "class-imbalance");
      expect(imbStage?.status).toBe("unavailable");
      expect(imbStage?.status).not.toBe("applied");
      expect(imbStage?.evidenceType).not.toBe("execution_evidence");
      expect(imbStage?.detail).toContain("Evidence unavailable (unrecognized strategy)");
    });

    it("does not infer strategy values from model family or model name", () => {
      // Model is CatBoost tree family, but preprocessingStrategy is omitted
      const stages = buildPreprocessingStages(mockAnalyticsResponse, {
        modelName: "CatBoost Native Imbalance",
        modelFamily: "catboost",
        configuration: null,
      });

      const prepStage = stages.find((s) => s.id === "missing-values");
      // Must NOT infer "native"
      expect(prepStage?.status).toBe("unavailable");
      expect(prepStage?.status).not.toBe("not_applicable");
      expect(prepStage?.detail).toContain("Evidence unavailable");
    });

    it("preserves dataset facts independently of execution context", () => {
      // Even with invalid or unknown model context, stages 1, 2, and 3 remain dataset facts
      const stages = buildPreprocessingStages(mockAnalyticsResponse, {
        modelName: "Malformed Context",
        preprocessingStrategy: "invalid_xyz",
        imbalanceStrategy: "invalid_abc",
      });

      const rawStage = stages.find((s) => s.id === "raw-ingestion");
      expect(rawStage?.evidenceType).toBe("dataset_fact");
      expect(rawStage?.status).toBe("completed");
      expect(rawStage?.detail).toContain("60,000 records ingested");

      const schemaStage = stages.find((s) => s.id === "schema-validation");
      expect(schemaStage?.evidenceType).toBe("dataset_fact");
      expect(schemaStage?.status).toBe("completed");
      expect(schemaStage?.detail).toContain("170 numeric sensor features");

      const splitStage = stages.find((s) => s.id === "train-val-split");
      expect(splitStage?.evidenceType).toBe("dataset_fact");
      expect(splitStage?.status).toBe("completed");
      expect(splitStage?.detail).toContain("training: 48,000 rows · validation: 12,000 rows");
    });
  });

  describe("2. Neutral cost discrepancy wording", () => {
    it("formats neutral discrepancy note without speculative assumptions when reason is not explicit", () => {
      const res = computeIllustrativeCost(45, 20, 500);
      expect(res.isAvailable).toBe(true);
      expect(res.calculatedCost).toBe(245);
      expect(res.hasDiscrepancy).toBe(true);
      // Strictly neutral format: Persisted estimate: 500. This differs from the calculated illustrative score of 245.
      expect(res.discrepancyNote).toBe(
        "Persisted estimate: 500. This differs from the calculated illustrative score of 245."
      );
      expect(res.discrepancyNote).not.toContain("differing evaluation scope");
      expect(res.discrepancyNote).not.toContain("threshold assumptions");
    });

    it("appends explicit reason only when explicitly established by caller", () => {
      const res = computeIllustrativeCost(45, 20, 500, "frozen baseline");
      expect(res.hasDiscrepancy).toBe(true);
      expect(res.discrepancyNote).toBe(
        "Persisted estimate: 500. This differs from the calculated illustrative score of 245 (frozen baseline)."
      );
    });

    it("retains calculated score as primary display when discrepancy exists in ModelDetailsPanel", () => {
      const modelWithDiscrepancy: ModelEvaluation = {
        ...baseModel,
        businessImpact: {
          ...baseModel.businessImpact,
          estimatedCost: 800, // differs from 35*1 + 41*10 = 445
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(ModelDetailsPanel, { model: modelWithDiscrepancy })
      );

      // Primary display is calculated illustrative score (445)
      expect(html).toContain("445");
      // Neutral diagnostic note is present
      expect(html).toContain("Persisted estimate: 800. This differs from the calculated illustrative score of 445.");
      expect(html).not.toContain("due to differing evaluation scope");
    });
  });

  describe("3. Business impact and table copy alignment", () => {
    it("explains illustrative scores use established unitless weights (FP × 1 + FN × 10) in business impact comparison", () => {
      const html = renderToStaticMarkup(
        React.createElement(BusinessImpactComparison, {
          models: [baseModel],
          selectedModelId: baseModel.modelId,
          onSelectModel: () => {},
        })
      ).replace(/&#x27;/g, "'");

      expect(html).toContain(
        "The displayed illustrative scores are calculated directly from confusion matrix false positive and false negative counts using the project's established unitless weights (FP × 1 + FN × 10). Use this comparison as an illustrative decision aid, not as actual operational fleet cost."
      );
      expect(html).not.toContain("The displayed costs come from the persisted validation metric configuration");
    });

    it("explains business cost uses unitless weights (FP × 1 + FN × 10) in metrics table footer", () => {
      const html = renderToStaticMarkup(
        React.createElement(ModelMetricsTable, {
          models: [baseModel],
          selectedModelId: baseModel.modelId,
          onSelectModel: () => {},
        })
      ).replace(/&#x27;/g, "'");

      expect(html).toContain(
        "Values use persisted validation evidence and the threshold shown in each row. Business cost uses the project's established unitless weights (FP × 1 + FN × 10)."
      );
    });
  });
});

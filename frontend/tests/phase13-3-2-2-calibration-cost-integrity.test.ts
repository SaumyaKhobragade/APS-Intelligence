import * as React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelDetailsPanel } from "@/components/models/model-details-panel";
import { ModelMetricsTable } from "@/components/models/model-metrics-table";
import { BusinessImpactComparison } from "@/components/models/business-impact-comparison";
import { computeIllustrativeCost } from "@/lib/business-cost";
import { buildPreprocessingStages, isCompleteExecutionRecord } from "@/services/dataset-service";
import { mapHistoricalSummaryToModel } from "@/services/historical-evidence-service";
import type { BackendDatasetAnalyticsResponse, BackendHistoricalRunSummary } from "@/services/backend-contracts";
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
  modelId: "catboost-candidate",
  modelName: "CatBoost Native Imbalance",
  modelType: "CatBoost",
  evaluationStatus: "completed",
  trainingDataset: "APS Train Partition",
  evaluationDataset: "Holdout Validation Partition",
  hyperparameters: { depth: 6, iterations: 500 },
  confusionMatrix: {
    truePositive: 180,
    trueNegative: 11800,
    falsePositive: 45,
    falseNegative: 20,
  },
  businessImpact: {
    falsePositiveCount: 45,
    falseNegativeCount: 20,
    falsePositiveCost: 45,
    falseNegativeCost: 200,
    estimatedCost: 245,
    unitFalsePositiveCost: 1,
    unitFalseNegativeCost: 10,
  },
  precisionRecallCurve: [],
  threshold: 0.115,
  prAuc: 0.85,
  rocAuc: 0.99,
  precision: 0.8,
  recall: 0.9,
  f1Score: 0.85,
  specificity: 0.996,
  balancedAccuracy: 0.948,
  evaluationScope: "validation",
  evaluatedAt: "2026-10-28T00:00:00Z",
};

describe("Phase 13.3.2.2 — Calibration, Cost & Execution Evidence Integrity", () => {
  // 1. Explicit calibration method mapping from API
  it("maps explicit calibration_method from API response without inferring from candidate label", () => {
    const candidateSummary: BackendHistoricalRunSummary = {
      reference_type: "experiment",
      reference_id: "phase9-final-validation-candidate",
      phase: "phase9",
      model_name: "CatBoost",
      model_version: "phase9",
      dataset_id: "aps-dataset",
      status: "completed",
      candidate_label: "Final validation candidate — not production approved",
      threshold: 0.115,
      calibration_method: "isotonic",
      validation_metrics: {
        scope: "validation",
        label: "Validation / frozen threshold 0.115",
        source_reference: "artifacts/phase9/validation_metrics.json",
        pr_auc: 0.85,
        threshold: 0.115,
      },
      artifact_integrity_status: "verified",
      artifact_available: true,
      source_database: "phase9_validation.db",
    };

    const model = mapHistoricalSummaryToModel(candidateSummary);
    expect(model).not.toBeNull();
    expect(model?.calibrationMethod).toBe("isotonic");

    // Candidate with no calibration_method must NOT infer isotonic
    const uncalibratedCandidate: BackendHistoricalRunSummary = {
      ...candidateSummary,
      candidate_label: "Candidate without calibration",
      calibration_method: null,
    };
    const uncalibratedModel = mapHistoricalSummaryToModel(uncalibratedCandidate);
    expect(uncalibratedModel?.calibrationMethod).toBeNull();
  });

  // 2. Explicit calibration method rendering in UI
  it("displays explicit calibration method when present, and Not recorded when absent", () => {
    const calibratedModel: ModelEvaluation = {
      ...baseModel,
      calibrationMethod: "isotonic",
    };
    const htmlCalibrated = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: calibratedModel })
    );
    expect(htmlCalibrated).toContain("Calibration method");
    expect(htmlCalibrated).toContain("isotonic");

    const alternativeMethodModel: ModelEvaluation = {
      ...baseModel,
      calibrationMethod: "sigmoid",
    };
    const htmlAlternative = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: alternativeMethodModel })
    );
    expect(htmlAlternative).toContain("sigmoid");

    const uncalibratedModel: ModelEvaluation = {
      ...baseModel,
      calibrationMethod: null,
      calibrationProvenance: undefined,
    };
    const htmlUncalibrated = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: uncalibratedModel })
    );
    expect(htmlUncalibrated).toContain("Not recorded");
  });

  // 3. Threshold line vs calibration method distinction
  it("maintains strict distinction between operating threshold and calibration method", () => {
    const uncalibratedNonDefault: ModelEvaluation = {
      ...baseModel,
      threshold: 0.25,
      calibrationMethod: null,
      calibrationProvenance: undefined,
    };
    const html = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: uncalibratedNonDefault })
    );
    expect(html).toContain("Persisted operating threshold");
    expect(html).toContain("Not recorded");

    const defaultThreshold: ModelEvaluation = {
      ...baseModel,
      threshold: 0.5,
      calibrationMethod: null,
      calibrationProvenance: undefined,
    };
    const htmlDefault = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: defaultThreshold })
    );
    expect(htmlDefault).toContain("Standard default threshold (50%)");
  });

  // 4. Illustrative business cost calculation formula (FP * 1 + FN * 10)
  it("calculates illustrative business cost directly using FP count × 1 + FN count × 10", () => {
    const res = computeIllustrativeCost(45, 20, 245);
    expect(res.isAvailable).toBe(true);
    expect(res.calculatedCost).toBe(45 * 1 + 20 * 10); // 245
    expect(res.hasDiscrepancy).toBe(false);
    expect(res.discrepancyNote).toBeNull();
  });

  // 5. Persisted cost discrepancy detection without mutating evidence
  it("detects discrepancy between persisted estimate and calculated formula score", () => {
    // Persisted estimate was 500, but FP=45, FN=20 => calculated is 245
    const res = computeIllustrativeCost(45, 20, 500, "validation scope");
    expect(res.isAvailable).toBe(true);
    expect(res.calculatedCost).toBe(245);
    expect(res.persistedCost).toBe(500);
    expect(res.hasDiscrepancy).toBe(true);
    expect(res.discrepancyNote).toContain("Persisted estimate: 500");
    expect(res.discrepancyNote).toContain("differs from illustrative score");

    // Check display in ModelDetailsPanel
    const modelWithDiscrepancy: ModelEvaluation = {
      ...baseModel,
      businessImpact: {
        ...baseModel.businessImpact,
        estimatedCost: 500, // differs from 45*1 + 20*10 = 245
      },
    };
    const html = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: modelWithDiscrepancy })
    );
    // Primary display is calculated illustrative score (245)
    expect(html).toContain("245");
    // Secondary diagnostic note is displayed
    expect(html).toContain("Persisted estimate: 500");
  });

  // 6. Missing confusion counts displays "Unavailable"
  it("displays Unavailable when confusion counts are missing", () => {
    const res = computeIllustrativeCost(undefined, null, 245);
    expect(res.isAvailable).toBe(false);
    expect(res.calculatedCost).toBeUndefined();

    const modelNoCounts: ModelEvaluation = {
      ...baseModel,
      confusionMatrix: undefined as unknown as ModelEvaluation["confusionMatrix"],
      businessImpact: undefined as unknown as ModelEvaluation["businessImpact"],
    };
    const html = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: modelNoCounts })
    );
    expect(html).toContain("Unavailable");
  });

  // 7. No currency symbols ($) across cost views
  it("displays unitless illustrative weights without currency symbols ($)", () => {
    const htmlDetails = renderToStaticMarkup(
      React.createElement(ModelDetailsPanel, { model: baseModel })
    );
    expect(htmlDetails).not.toContain("$");

    const htmlTable = renderToStaticMarkup(
      React.createElement(ModelMetricsTable, {
        models: [baseModel],
        selectedModelId: baseModel.modelId,
        onSelectModel: () => {},
      })
    );
    expect(htmlTable).not.toContain("$");

    const htmlComparison = renderToStaticMarkup(
      React.createElement(BusinessImpactComparison, {
        models: [baseModel],
        selectedModelId: baseModel.modelId,
        onSelectModel: () => {},
      })
    );
    expect(htmlComparison).not.toContain("$");
    expect(htmlComparison).toContain("1 × FP + 10 × FN (illustrative)");
  });

  // 8. Execution evidence requires complete configuration
  it("classifies stages as execution_evidence only when context is a complete execution record", () => {
    // Incomplete: null context
    expect(isCompleteExecutionRecord(null)).toBe(false);
    const nullStages = buildPreprocessingStages(mockAnalyticsResponse, undefined);
    expect(nullStages.find((s) => s.id === "missing-values")?.evidenceType).toBe("pipeline_contract");
    expect(nullStages.find((s) => s.id === "feature-scaling")?.evidenceType).toBe("pipeline_contract");
    expect(nullStages.find((s) => s.id === "class-imbalance")?.evidenceType).toBe("pipeline_contract");
    expect(nullStages.find((s) => s.id === "model-ready")?.evidenceType).toBe("pipeline_contract");

    // Incomplete: empty object {}
    expect(isCompleteExecutionRecord({})).toBe(false);
    const emptyStages = buildPreprocessingStages(mockAnalyticsResponse, {});
    expect(emptyStages.find((s) => s.id === "missing-values")?.evidenceType).toBe("pipeline_contract");
    expect(emptyStages.find((s) => s.id === "feature-scaling")?.evidenceType).toBe("pipeline_contract");
    expect(emptyStages.find((s) => s.id === "class-imbalance")?.evidenceType).toBe("pipeline_contract");
    expect(emptyStages.find((s) => s.id === "model-ready")?.evidenceType).toBe("pipeline_contract");

    // Incomplete: partial context (missing preprocessingStrategy and imbalanceStrategy)
    expect(isCompleteExecutionRecord({ modelName: "CatBoost" })).toBe(false);
    const partialStages = buildPreprocessingStages(mockAnalyticsResponse, { modelName: "CatBoost" });
    expect(partialStages.find((s) => s.id === "missing-values")?.evidenceType).toBe("pipeline_contract");
    expect(partialStages.find((s) => s.id === "missing-values")?.status).toBe("unavailable");
    expect(partialStages.find((s) => s.id === "class-imbalance")?.evidenceType).toBe("pipeline_contract");
    expect(partialStages.find((s) => s.id === "class-imbalance")?.status).toBe("unavailable");

    // Disabled: isExecutionRecord is explicitly false
    expect(
      isCompleteExecutionRecord({
        modelName: "CatBoost",
        preprocessingStrategy: "native",
        imbalanceStrategy: "original",
        isExecutionRecord: false,
      })
    ).toBe(false);

    // Complete valid context
    const completeCtx = {
      modelName: "CatBoost Native Imbalance",
      modelFamily: "catboost",
      preprocessingStrategy: "native",
      imbalanceStrategy: "original",
      isExecutionRecord: true,
    };
    expect(isCompleteExecutionRecord(completeCtx)).toBe(true);
    const completeStages = buildPreprocessingStages(mockAnalyticsResponse, completeCtx);
    expect(completeStages.find((s) => s.id === "missing-values")?.evidenceType).toBe("execution_evidence");
    expect(completeStages.find((s) => s.id === "missing-values")?.status).toBe("not_applicable");
    expect(completeStages.find((s) => s.id === "feature-scaling")?.evidenceType).toBe("execution_evidence");
    expect(completeStages.find((s) => s.id === "feature-scaling")?.status).toBe("not_applicable");
    expect(completeStages.find((s) => s.id === "class-imbalance")?.evidenceType).toBe("execution_evidence");
    expect(completeStages.find((s) => s.id === "class-imbalance")?.status).toBe("not_applicable");
    expect(completeStages.find((s) => s.id === "model-ready")?.evidenceType).toBe("execution_evidence");
    expect(completeStages.find((s) => s.id === "model-ready")?.status).toBe("completed");
  });
});

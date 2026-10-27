import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDashboardSnapshot } from "@/services/dashboard-service";
import { fetchDatasetEvidenceByType } from "@/services/dataset-service";
import { fetchModelComparison } from "@/services/model-service";
import { fetchExperiments, fetchExperiment } from "@/services/experiment-service";
import { fetchThresholdSnapshot } from "@/services/threshold-service";
import { fetchOfficialTestEvidence } from "@/services/historical-evidence-service";
import { fetchPredictionModels, fetchPredictionHistory } from "@/services/prediction-service";
import { apiFetch } from "@/services/api-client";
import type {
  BackendDatasetListResponse,
  BackendHistoricalOverviewResponse,
  BackendHistoricalRunDetail,
  BackendHistoricalThresholdResponse,
  BackendHistoricalCalibrationResponse,
  BackendHistoricalValidationComparisonResponse,
  BackendHistoricalValidationResponse,
  BackendOfficialTestEvidenceResponse,
  BackendPredictionModelListResponse,
  BackendPolicyListResponse,
  BackendRegistryListResponse,
  BackendPredictionHistoryResponse,
} from "@/services/backend-contracts";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("Phase 11 Historical Evidence & Acceptance Integration Tests", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // 1. Dashboard Historical Evidence Integration
  describe("1. Dashboard historical evidence integration", () => {
    it("connects dashboard to real persisted historical evidence without mock fallback", async () => {
      const mockDatasets: BackendDatasetListResponse = {
        items: [{
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
          imported_at: "2026-10-25T17:04:46.686116",
        }],
        total: 1,
        page: 1,
        page_size: 100,
      };

      const mockCandidateSummary = {
        reference_type: "experiment" as const,
        reference_id: "phase9-final-validation-candidate",
        phase: "phase9",
        model_name: "catboost",
        model_version: "phase9.1.0",
        imbalance_strategy: "class_weight",
        preprocessing_strategy: "native",
        dataset_id: "training-bb484302e3a3a1c8",
        dataset_fingerprint: "fingerprint",
        status: "completed",
        lifecycle_status: "evaluated",
        threshold: 0.115,
        created_at: "2026-10-26T16:37:18",
        completed_at: "2026-10-26T16:41:34",
        primary_metric: 0.8011077,
        validation_metrics: {
          scope: "validation",
          label: "External validation",
          threshold: 0.115,
          pr_auc: 0.8011077,
          roc_auc: 0.994072,
          precision: 0.488,
          recall: 0.915,
          f1_score: 0.6365,
          false_positive_cost: 1.0,
          false_negative_cost: 10.0,
          estimated_business_cost: 362.0,
          confusion_matrix: { true_negative: 11608, false_positive: 192, false_negative: 17, true_positive: 183 },
          source_reference: "artifacts/phase9/validation_metrics.json",
        },
        cross_validation: null,
        artifact_integrity_status: "verified",
        artifact_available: true,
        source_database: "data/phase9_validation.db",
        candidate_label: "Final validation candidate — not production approved",
        curves: null,
        training_duration_seconds: 12.0,
        inference_duration_seconds: 0.05,
      };

      const mockOverview = {
        evidence_version: "phase11.3.v1",
        training_runs: [],
        experiments: [mockCandidateSummary],
        validation_comparison: [mockCandidateSummary],
        candidate_id: "phase9-final-validation-candidate",
        candidate_lifecycle_status: "evaluated",
        candidate_label: "Final validation candidate — not production approved",
        availability: [{ name: "phase9_candidate", status: "available" as const, message: "Available" }],
      } as unknown as BackendHistoricalOverviewResponse;

      const mockCandidateDetail = {
        evidence_version: "phase11.3.v1",
        reference: mockCandidateSummary,
        dataset_and_split: {
          training_class_counts: { neg: 46432, pos: 800 },
          validation_class_counts: { neg: 11800, pos: 200 },
          split_identifier: "phase9-train-val-split",
        },
        metrics: [mockCandidateSummary.validation_metrics],
        curves: null,
        feature_importance: [],
        calibration: null,
        availability: [{ name: "candidate", status: "available" as const, message: "Ready" }],
        provenance: ["Phase 9 external validation"],
      } as unknown as BackendHistoricalValidationResponse;

      const mockComparison = {
        evidence_version: "phase11.3.v1",
        normalization_version: "phase9-validation-nested-v1",
        items: [mockCandidateSummary],
        total: 1,
        page: 1,
        page_size: 100,
        evaluation_scope: "validation",
        availability: [],
      } as unknown as BackendHistoricalValidationComparisonResponse;

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/datasets?dataset_type=training")) return Promise.resolve(jsonResponse(mockDatasets));
        if (url.includes("/analytics/datasets/")) return Promise.resolve(jsonResponse({ profile: null, feature_page: null }));
        if (url.includes("/historical-evidence/overview")) return Promise.resolve(jsonResponse(mockOverview));
        if (url.includes("/historical-evidence/validation/phase9-final-validation-candidate")) return Promise.resolve(jsonResponse(mockCandidateDetail));
        if (url.includes("/historical-evidence/validation/comparison")) return Promise.resolve(jsonResponse(mockComparison));
        return Promise.reject(new Error(`Unhandled route: ${url}`));
      }));

      const snapshot = await fetchDashboardSnapshot();

      expect(snapshot.dataset?.rowCount).toBe(60000);
      expect(snapshot.dataset?.featureCount).toBe(170);
      expect(snapshot.candidateLabel).toBe("Final validation candidate — not production approved");
      expect(snapshot.candidateStatus).toBe("evaluated");
      expect(snapshot.candidateThreshold).toBeCloseTo(0.115);
      expect(snapshot.candidateValidation?.prAuc).toBeCloseTo(0.8011077);
      expect(snapshot.candidateValidation?.rocAuc).toBeCloseTo(0.994072);
      expect(snapshot.candidateValidation?.precision).toBeCloseTo(0.488);
      expect(snapshot.candidateValidation?.recall).toBeCloseTo(0.915);
      expect(snapshot.candidateValidation?.confusionMatrix).toEqual({
        trueNegative: 11608,
        falsePositive: 192,
        falseNegative: 17,
        truePositive: 183,
      });
      expect(snapshot.businessImpact?.estimatedCost).toBe(362.0);
      expect(snapshot.businessImpact?.unitFalsePositiveCost).toBe(1.0);
      expect(snapshot.businessImpact?.unitFalseNegativeCost).toBe(10.0);
      expect(snapshot.businessImpact?.falsePositiveCost).toBe(192.0);
      expect(snapshot.businessImpact?.falseNegativeCost).toBe(170.0);
    });
  });

  // 2. Dataset Profile Display & Train/Val Split Lineage
  describe("2. Dataset profile display & historical preprocessing evidence", () => {
    it("reads persisted training metadata and split evidence without accessing raw test CSV", async () => {
      const mockDatasets: BackendDatasetListResponse = {
        items: [{
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
          imported_at: "2026-10-25T17:04:46.686116",
        }],
        total: 1,
        page: 1,
        page_size: 100,
      };

      const mockCandidateValidation = {
        evidence_version: "phase11.3.v1",
        reference: {},
        dataset_and_split: {
          training_class_counts: { neg: 46432, pos: 800 },
          validation_class_counts: { neg: 11800, pos: 200 },
          training_fingerprint: "train-fingerprint-sha256",
          validation_fingerprint: "val-fingerprint-sha256",
          split_identifier: "phase9-stratified-split",
        },
        metrics: [],
        curves: null,
        feature_importance: [],
        calibration: null,
        availability: [{ name: "profile", status: "unavailable" as const, message: "No persisted training profile artifact; raw CSV not reprofiled." }],
        provenance: ["Phase 9 split lineage"],
      } as unknown as BackendHistoricalValidationResponse;

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/datasets?dataset_type=training")) return Promise.resolve(jsonResponse(mockDatasets));
        if (url.includes("/analytics/datasets/")) return Promise.resolve(jsonResponse({ profile: null, feature_page: null }));
        if (url.includes("/historical-evidence/validation/phase9-final-validation-candidate")) return Promise.resolve(jsonResponse(mockCandidateValidation));
        return Promise.reject(new Error(`Unhandled route: ${url}`));
      }));

      const evidence = await fetchDatasetEvidenceByType("training");

      expect(evidence.metadata).not.toBeNull();
      expect(evidence.metadata?.rowCount).toBe(60000);
      expect(evidence.metadata?.featureCount).toBe(170);
      expect(evidence.metadata?.fingerprint).toBe("bb484302e3a3a1c8ef5e1f0129c4dc7cbd58f350867f95b575461ca21ab6b9da");
      expect(evidence.splitEvidence).not.toBeNull();
      expect(evidence.splitEvidence?.training_class_counts).toEqual({ neg: 46432, pos: 800 });
      expect(evidence.snapshot).toBeNull();
      expect(evidence.availability.some((a) => a.name.includes("profile"))).toBe(true);
    });
  });

  // 3. Model Comparison Integration
  describe("3. Model comparison integration across 4 model families", () => {
    it("distinguishes CV metrics from validation metrics and keeps scopes clean", async () => {
      const mockComparison = {
        evidence_version: "phase11.3.v1",
        normalization_version: "phase9-validation-nested-v1",
        items: [
          {
            reference_type: "experiment" as const,
            reference_id: "phase9-final-validation-candidate",
            phase: "phase9",
            model_name: "catboost",
            model_version: "phase9.1.0",
            imbalance_strategy: "class_weight",
            preprocessing_strategy: "native",
            dataset_id: "training-bb484302e3a3a1c8",
            dataset_fingerprint: "fingerprint",
            status: "completed",
            lifecycle_status: "evaluated",
            threshold: 0.115,
            created_at: "2026-10-26T16:37:18",
            completed_at: "2026-10-26T16:41:34",
            primary_metric: 0.8011,
            validation_metrics: {
              scope: "validation",
              label: "Validation",
              threshold: 0.115,
              pr_auc: 0.8011,
              roc_auc: 0.9941,
              precision: 0.488,
              recall: 0.915,
              f1_score: 0.6365,
              specificity: 0.9837,
              balanced_accuracy: 0.9494,
              false_positive_cost: 1.0,
              false_negative_cost: 10.0,
              estimated_business_cost: 362.0,
              confusion_matrix: { true_negative: 11608, false_positive: 192, false_negative: 17, true_positive: 183 },
              source_reference: "artifacts/phase9/validation_metrics.json",
            },
            cross_validation: {
              pr_auc_mean: 0.8263,
              pr_auc_std: 0.0101,
              folds: 3,
              search_budget: 6,
              source_reference: "phase9_validation.db",
            },
            artifact_integrity_status: "verified",
            artifact_available: true,
            source_database: "data/phase9_validation.db",
            candidate_label: "Final validation candidate — not production approved",
            curves: {
              precision_recall: { precision: [0.3, 0.488], recall: [1.0, 0.915], thresholds: [0.01, 0.115] },
              roc: { false_positive_rate: [0.0, 0.016], true_positive_rate: [0.0, 0.915], thresholds: [1.0, 0.115] },
            },
            training_duration_seconds: 12.0,
            inference_duration_seconds: 0.05,
          },
          {
            reference_type: "experiment" as const,
            reference_id: "exp-xgboost",
            phase: "phase4",
            model_name: "xgboost",
            model_version: "1.0.0",
            imbalance_strategy: "scale_pos_weight",
            preprocessing_strategy: "median_impute",
            dataset_id: "training-bb484302e3a3a1c8",
            dataset_fingerprint: "fingerprint",
            status: "completed",
            lifecycle_status: "evaluated",
            threshold: 0.5,
            created_at: "2026-10-25T20:00:00",
            completed_at: "2026-10-25T20:05:00",
            primary_metric: 0.725,
            validation_metrics: {
              scope: "validation",
              label: "Validation",
              threshold: 0.5,
              pr_auc: 0.725,
              roc_auc: 0.985,
              precision: 0.35,
              recall: 0.88,
              f1_score: 0.50,
              false_positive_cost: 1.0,
              false_negative_cost: 10.0,
              estimated_business_cost: 450.0,
              confusion_matrix: { true_negative: 11400, false_positive: 400, false_negative: 24, true_positive: 176 },
              source_reference: "phase4.db",
            },
            cross_validation: null,
            artifact_integrity_status: "not_recorded",
            artifact_available: true,
            source_database: "data/phase4.db",
            candidate_label: null,
            curves: null,
            training_duration_seconds: 8.0,
            inference_duration_seconds: 0.03,
          },
        ],
        total: 2,
        page: 1,
        page_size: 100,
        evaluation_scope: "validation",
        availability: [],
      } as unknown as BackendHistoricalValidationComparisonResponse;

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockComparison)));

      const snapshot = await fetchModelComparison();

      expect(snapshot.models).toHaveLength(2);
      const catboost = snapshot.models.find((m) => m.modelType === "catboost");
      expect(catboost).toBeDefined();
      expect(catboost?.evaluationScope).toBe("validation");
      expect(catboost?.prAuc).toBeCloseTo(0.8011);
      expect(catboost?.crossValidation?.prAucMean).toBeCloseTo(0.8263);
      expect(catboost?.precisionRecallCurve).toHaveLength(2);
      expect(catboost?.rocCurve).toHaveLength(2);
      expect(catboost?.candidateLabel).toContain("not production approved");
    });
  });

  // 4. Experiment History Integration
  describe("4. Experiment history integration & failed runs retention", () => {
    it("displays experiments with hyperparameters, duration, integrity, and retains failed experiments", async () => {
      const mockExperiments = {
        items: [
          {
            reference_type: "experiment" as const,
            reference_id: "phase4-failed-run",
            phase: "phase4",
            model_name: "random_forest",
            model_version: "1.0.0",
            imbalance_strategy: "smote",
            preprocessing_strategy: "standard",
            dataset_id: "training-bb484302e3a3a1c8",
            dataset_fingerprint: "fingerprint",
            status: "failed",
            lifecycle_status: "failed",
            threshold: null,
            created_at: "2026-10-25T18:00:00",
            completed_at: null,
            primary_metric: null,
            validation_metrics: null,
            cross_validation: null,
            artifact_integrity_status: "unavailable",
            artifact_available: false,
            source_database: "data/phase4.db",
            candidate_label: null,
            curves: null,
            training_duration_seconds: null,
            inference_duration_seconds: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
        availability: [],
      };

      const mockTrainingRuns = {
        items: [],
        total: 0,
        page: 1,
        page_size: 100,
        availability: [],
      };

      const mockFailedDetail = {
        ...mockExperiments.items[0],
        configuration: { n_estimators: 100 },
        hyperparameters: { max_depth: 10 },
        search_results: [],
        feature_importance: [],
        metrics: [],
        artifacts: [],
        error_message: "SMOTE memory allocation failed during synthetic generation.",
        availability: [],
        provenance: ["Historical Phase 4 experiment record."],
      } as unknown as BackendHistoricalRunDetail;

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/historical-evidence/experiments?")) return Promise.resolve(jsonResponse(mockExperiments));
        if (url.includes("/historical-evidence/training-runs?")) return Promise.resolve(jsonResponse(mockTrainingRuns));
        if (url.includes("/historical-evidence/experiments/phase4-failed-run")) return Promise.resolve(jsonResponse(mockFailedDetail));
        return Promise.reject(new Error(`Unhandled route: ${url}`));
      }));

      const registry = await fetchExperiments();
      expect(registry.experiments).toHaveLength(1);
      const failed = registry.experiments[0];
      expect(failed.status).toBe("failed");
      expect(failed.artifactAvailable).toBe(false);
      expect(failed.isDemonstration).toBe(false);
      expect(failed.source).toBe("historical");

      const detail = await fetchExperiment("phase4-failed-run");
      expect(detail.status).toBe("failed");
      expect(detail.errorMessage).toContain("SMOTE memory allocation failed");
      expect(detail.details.modelConfiguration.hyperparameters).toEqual({ max_depth: 10 });
    });
  });

  // 5. Threshold Optimization & Calibration Evidence
  describe("5. Threshold optimization & calibration evidence", () => {
    it("loads frozen threshold 0.115, isotonic calibration, and enforces read-only mode", async () => {
      const mockThreshold = {
        evidence_version: "phase11.3.v1",
        reference_id: "phase9-final-validation-candidate",
        model_name: "catboost",
        imbalance_strategy: "class_weight",
        calibration_method: "isotonic",
        frozen_threshold: 0.115,
        threshold_objective: "Minimum illustrative cost",
        selection_scope: "Phase 9 OOF cross-validation policy tuning",
        validation: {
          scope: "validation",
          label: "External validation",
          threshold: 0.115,
          pr_auc: 0.8011077,
          roc_auc: 0.994072,
          precision: 0.488,
          recall: 0.915,
          f1_score: 0.6365,
          false_positive_cost: 1.0,
          false_negative_cost: 10.0,
          estimated_business_cost: 362.0,
          confusion_matrix: { true_negative: 11608, false_positive: 192, false_negative: 17, true_positive: 183 },
          source_reference: "artifacts/phase9/validation_metrics.json",
        },
        threshold_points: [{
          threshold: 0.115,
          precision: 0.488,
          recall: 0.915,
          f1_score: 0.6365,
          false_positive: 192,
          false_negative: 17,
          true_positive: 183,
          true_negative: 11608,
          business_cost: 362.0,
          source_reference: "minimum_cost",
        }],
        availability: [],
        provenance: ["Threshold frozen from Phase 9 OOF evaluation."],
      } as unknown as BackendHistoricalThresholdResponse;

      const mockCalibration = {
        evidence_version: "phase11.3.v1",
        reference_id: "phase9-final-validation-candidate",
        model_name: "catboost",
        model_version: "phase9.1.0",
        selected_method: "isotonic",
        evaluation_scope: "External validation",
        metrics: { brier_score: 0.0071, log_loss: 0.025, expected_calibration_error: 0.0015 },
        reliability_curve: [{ bin_label: "bin_1", predicted_probability: 0.1, observed_failure_rate: 0.09, sample_count: 500 }],
        artifacts: [],
        availability: [],
        provenance: ["Isotonic calibration applied."],
      } as unknown as BackendHistoricalCalibrationResponse;

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/historical-evidence/thresholds/")) return Promise.resolve(jsonResponse(mockThreshold));
        if (url.includes("/historical-evidence/calibration/")) return Promise.resolve(jsonResponse(mockCalibration));
        return Promise.reject(new Error(`Unhandled route: ${url}`));
      }));

      const snapshot = await fetchThresholdSnapshot();

      expect(snapshot.models).toHaveLength(1);
      const model = snapshot.models[0];
      expect(model.frozenThreshold).toBeCloseTo(0.115);
      expect(model.defaultThreshold).toBeCloseTo(0.115);
      expect(model.readOnly).toBe(true);
      expect(model.calibrationStatusLabel).toContain("isotonic");
      expect(model.brierScore).toBeCloseTo(0.0071);
      expect(model.calibrationCurve).toHaveLength(1);
      expect(model.costWeights).toEqual({ falsePositive: 1.0, falseNegative: 10.0 });
    });
  });

  // 6. Phase 10 Official Test Evidence Separation
  describe("6. Phase 10 official test evidence separation", () => {
    it("fetches dedicated official-test evidence with bootstrap CIs, calibration, and isolation notice", async () => {
      const mockOfficialTest: BackendOfficialTestEvidenceResponse = {
        evidence_version: "phase11.3.v1",
        evaluation_id: "phase10-official-test-evaluation",
        candidate_id: "phase9-final-validation-candidate",
        evaluation_scope: "official_test",
        model_name: "catboost",
        imbalance_strategy: "class_weight",
        calibration_method: "isotonic",
        frozen_threshold: 0.115,
        candidate_label: "Final validation candidate — not production approved",
        metrics: {
          scope: "official_test",
          label: "Official test evaluation",
          threshold: 0.115,
          pr_auc: 0.863806,
          roc_auc: 0.993536,
          precision: 0.613718,
          recall: 0.906667,
          f1_score: 0.731970,
          specificity: 0.986304,
          balanced_accuracy: 0.946485,
          accuracy: 0.984438,
          false_positive_cost: 1.0,
          false_negative_cost: 10.0,
          estimated_business_cost: 564.0,
          confusion_matrix: { true_negative: 15411, false_positive: 214, false_negative: 35, true_positive: 340 },
          source_reference: "artifacts/phase10/official-test-evaluation/official_test_metrics.json",
        },
        confidence_intervals: {
          pr_auc: { lower: 0.836307, upper: 0.890892 },
          roc_auc: { lower: 0.988409, upper: 0.996406 },
          precision: { lower: 0.583909, upper: 0.649626 },
          recall: { lower: 0.877267, upper: 0.936000 },
          f1: { lower: 0.705994, upper: 0.761166 },
        },
        confidence_interval_method: "stratified percentile bootstrap",
        confidence_interval_replicates: 1000,
        calibration_metrics: {
          brier_score: 0.006978,
          log_loss: 0.024511,
          expected_calibration_error: 0.001427,
        },
        precision_recall_curve: {
          precision: [0.5, 0.6137],
          recall: [1.0, 0.9067],
          thresholds: [0.01, 0.115],
        },
        roc_curve: {
          false_positive_rate: [0.0, 0.0137],
          true_positive_rate: [0.0, 0.9067],
          thresholds: [1.0, 0.115],
        },
        reliability_curve: [{ predicted_probability: 0.1, observed_failure_rate: 0.098 }],
        integrity_flags: {
          official_test_evaluated: true,
          retraining_performed: false,
          calibration_refit: false,
          threshold_changed: false,
          promotion_performed: false,
        },
        artifacts: [],
        availability: [{ name: "official_test_artifacts", status: "available", message: "All official test artifacts verified." }],
        provenance: ["Persisted official-test evaluation from Phase 10. Raw CSV was not read by API."],
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockOfficialTest)));

      const evidence = await fetchOfficialTestEvidence();

      expect(evidence.evaluation_scope).toBe("official_test");
      expect(evidence.frozen_threshold).toBeCloseTo(0.115);
      expect(evidence.metrics.pr_auc).toBeCloseTo(0.863806);
      expect(evidence.metrics.roc_auc).toBeCloseTo(0.993536);
      expect(evidence.metrics.precision).toBeCloseTo(0.613718);
      expect(evidence.metrics.recall).toBeCloseTo(0.906667);
      expect(evidence.metrics.f1_score).toBeCloseTo(0.731970);
      expect(evidence.metrics.confusion_matrix).toEqual({
        true_negative: 15411,
        false_positive: 214,
        false_negative: 35,
        true_positive: 340,
      });
      expect(evidence.confidence_intervals.pr_auc).toEqual({ lower: 0.836307, upper: 0.890892 });
      expect(evidence.confidence_intervals.f1).toEqual({ lower: 0.705994, upper: 0.761166 });
      expect(evidence.calibration_metrics.brier_score).toBeCloseTo(0.006978);
      expect(evidence.calibration_metrics.expected_calibration_error).toBeCloseTo(0.001427);
      expect(evidence.integrity_flags.promotion_performed).toBe(false);
      expect(evidence.integrity_flags.retraining_performed).toBe(false);
      expect(evidence.candidate_label).toBe("Final validation candidate — not production approved");
    });
  });

  // 7. API Error States
  describe("7. API error state handling", () => {
    it("propagates structured ApiError on 500 or 404 without silently converting to empty data", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: "artifact_missing", message: "Artifact integrity verification failed." } }, { status: 500 })
      ));

      await expect(apiFetch("/historical-evidence/overview")).rejects.toMatchObject({
        name: "ApiError",
        status: 500,
        code: "artifact_missing",
        message: "Artifact integrity verification failed.",
      });
    });
  });

  // 8. Empty States
  describe("8. Empty state handling", () => {
    it("handles empty validation comparisons gracefully without substituting unapproved models", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
        evidence_version: "phase11.3.v1",
        normalization_version: "phase9-validation-nested-v1",
        items: [],
        total: 0,
        page: 1,
        page_size: 100,
        evaluation_scope: "validation",
        availability: [],
      })));

      const snapshot = await fetchModelComparison();
      expect(snapshot.models).toHaveLength(0);
      expect(snapshot.evaluationSplit).toBe("Persisted external validation evidence");
    });
  });

  // 9. Inference Gating
  describe("9. Production inference gating", () => {
    it("reports models as unapproved and preserves inference gate without shortcuts", async () => {
      const mockModels = {
        items: [{
          model_reference_type: "experiment" as const,
          model_reference_id: "phase9-final-validation-candidate",
          model_name: "catboost",
          model_version: "phase9.1.0",
          default_threshold: 0.115,
          feature_count: 170,
          status: "evaluated",
          availability: "not_loaded",
          availability_note: "Model is evaluated on validation split; not promoted to production.",
          decision_policies: [],
        }],
        total: 1,
        page: 1,
        page_size: 100,
      } as unknown as BackendPredictionModelListResponse;

      const mockPolicies: BackendPolicyListResponse = {
        items: [],
        total: 0,
        page: 1,
        page_size: 100,
      };

      const mockRegistry = {
        items: [{
          model_reference_type: "experiment" as const,
          model_reference_id: "phase9-final-validation-candidate",
          lifecycle_status: "evaluated",
        }],
        total: 1,
        page: 1,
        page_size: 100,
      } as unknown as BackendRegistryListResponse;

      const mockPromotions = {
        items: [],
        total: 0,
        page: 1,
        page_size: 100,
      };

      const mockHistory: BackendPredictionHistoryResponse = {
        items: [],
        total: 0,
        page: 1,
        page_size: 50,
      };

      vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
        if (url.includes("/predictions/models")) return Promise.resolve(jsonResponse(mockModels));
        if (url.includes("/predictions/policies")) return Promise.resolve(jsonResponse(mockPolicies));
        if (url.includes("/models/registry")) return Promise.resolve(jsonResponse(mockRegistry));
        if (url.includes("/models/promotions")) return Promise.resolve(jsonResponse(mockPromotions));
        if (url.includes("/predictions?page=1")) return Promise.resolve(jsonResponse(mockHistory));
        return Promise.reject(new Error(`Unhandled route: ${url}`));
      }));

      const models = await fetchPredictionModels();
      const history = await fetchPredictionHistory();

      expect(models).toHaveLength(1);
      expect(models[0].availability).toBe("not_loaded");
      expect(models[0].availabilityNote).toContain("Inference unavailable until an approved model/policy pair is registered");
      expect(history).toHaveLength(0);
    });
  });
});

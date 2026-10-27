import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOfficialTestEvidence,
  mapHistoricalComparisonToSnapshot,
  mapHistoricalSummaryToModel,
} from "@/services/historical-evidence-service";
import type {
  BackendHistoricalRunSummary,
  BackendOfficialTestEvidenceResponse,
} from "@/services/backend-contracts";

const validationMetric = {
  scope: "validation" as const,
  label: "External validation / frozen threshold 0.115",
  threshold: 0.115,
  pr_auc: 0.8011077174714956,
  roc_auc: 0.9940724576271186,
  precision: 0.488,
  recall: 0.915,
  f1_score: 0.6365217391304347,
  specificity: 0.9837288135593221,
  balanced_accuracy: 0.949364406779661,
  accuracy: 0.9825833333333334,
  false_positive_cost: 1,
  false_negative_cost: 10,
  estimated_business_cost: 362,
  business_cost_note: "Illustrative validation cost",
  confusion_matrix: { true_negative: 11608, false_positive: 192, false_negative: 17, true_positive: 183 },
  source_reference: "validation_metrics.json",
};

function summary(overrides: Partial<BackendHistoricalRunSummary> = {}): BackendHistoricalRunSummary {
  return {
    reference_type: "experiment",
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
    created_at: "2026-10-26T16:37:18.715890",
    completed_at: "2026-10-26T16:41:34.804628",
    primary_metric: validationMetric.pr_auc,
    validation_metrics: validationMetric,
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
      precision_recall: { precision: [0.2, 0.488], recall: [1, 0.915], thresholds: [0.01, 0.115] },
      roc: { false_positive_rate: [0, 0.016], true_positive_rate: [0, 0.915], thresholds: [1, 0.115] },
    },
    training_duration_seconds: 12,
    inference_duration_seconds: 2,
    ...overrides,
  };
}

describe("historical evidence adapters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("maps validation evidence without mixing CV or official-test scope", () => {
    const model = mapHistoricalSummaryToModel(summary());

    expect(model).not.toBeNull();
    expect(model?.evaluationScope).toBe("validation");
    expect(model?.threshold).toBe(0.115);
    expect(model?.prAuc).toBe(validationMetric.pr_auc);
    expect(model?.crossValidation?.prAucMean).toBe(0.8263);
    expect(model?.precisionRecallCurve).toHaveLength(2);
    expect(model?.confusionMatrix.falseNegative).toBe(17);
    expect(model?.candidateLabel).toContain("not production approved");
  });

  it("keeps unavailable validation records out of the metric ranking", () => {
    const snapshot = mapHistoricalComparisonToSnapshot({
      evidence_version: "phase11.3.v1",
      normalization_version: "phase9-validation-nested-v1",
      items: [summary(), summary({ reference_id: "failed-experiment", validation_metrics: null, status: "failed" })],
      total: 2,
      page: 1,
      page_size: 100,
      evaluation_scope: "validation",
      availability: [],
    });

    expect(snapshot.models).toHaveLength(1);
    expect(snapshot.models[0].evaluationScope).toBe("validation");
  });

  it("requests the separate official-test route", async () => {
    const payload = {
      evaluation_scope: "official_test",
      frozen_threshold: 0.115,
      candidate_label: "Final validation candidate — not production approved",
    } as BackendOfficialTestEvidenceResponse;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", { setTimeout, clearTimeout });

    await expect(fetchOfficialTestEvidence()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/historical-evidence/official-test", expect.anything());
  });
});

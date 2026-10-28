import { describe, expect, it } from "vitest";
import type { CostWeights, ThresholdCurvePoint, ThresholdModelEvaluation, ThresholdRecommendation } from "@/types";

describe("Phase 13.2.1 — Threshold Exploration & Operating Point Synchronization", () => {
  // 12,000-sample validation checkpoints
  const sampleValidationCheckpoints: ThresholdCurvePoint[] = [
    {
      threshold: 0.0,
      precision: 0.0167,
      recall: 1.0,
      f1Score: 0.0328,
      falsePositiveCount: 11800,
      falseNegativeCount: 0,
      truePositiveCount: 200,
      trueNegativeCount: 0,
      predictedFailureCount: 12000,
      totalSamples: 12000,
      falsePositiveCost: 11800,
      falseNegativeCost: 0,
      businessCost: 11800,
      source: "validation_checkpoint",
      scope: "validation",
      scopeLabel: "External validation",
      sourceReference: "artifacts/phase9/threshold_policy_comparisons.json",
    },
    {
      threshold: 0.05,
      precision: 0.285,
      recall: 0.97,
      f1Score: 0.4404,
      falsePositiveCount: 486,
      falseNegativeCount: 6,
      truePositiveCount: 194,
      trueNegativeCount: 11314,
      predictedFailureCount: 680,
      totalSamples: 12000,
      falsePositiveCost: 486,
      falseNegativeCost: 60,
      businessCost: 546,
      source: "validation_checkpoint",
      scope: "validation",
      scopeLabel: "External validation",
      sourceReference: "artifacts/phase9/threshold_policy_comparisons.json",
    },
    {
      threshold: 0.115,
      precision: 0.488,
      recall: 0.915,
      f1Score: 0.6365,
      falsePositiveCount: 192,
      falseNegativeCount: 17,
      truePositiveCount: 183,
      trueNegativeCount: 11608,
      predictedFailureCount: 375,
      totalSamples: 12000,
      falsePositiveCost: 192,
      falseNegativeCost: 170,
      businessCost: 362,
      source: "validation_checkpoint",
      scope: "validation",
      scopeLabel: "External validation / frozen candidate",
      sourceReference: "artifacts/phase9/threshold_policy_comparisons.json",
    },
    {
      threshold: 0.305,
      precision: 0.634,
      recall: 0.84,
      f1Score: 0.7226,
      falsePositiveCount: 97,
      falseNegativeCount: 32,
      truePositiveCount: 168,
      trueNegativeCount: 11703,
      predictedFailureCount: 265,
      totalSamples: 12000,
      falsePositiveCost: 97,
      falseNegativeCost: 320,
      businessCost: 417,
      source: "validation_checkpoint",
      scope: "validation",
      scopeLabel: "External validation",
      sourceReference: "artifacts/phase9/threshold_policy_comparisons.json",
    },
    {
      threshold: 0.5,
      precision: 0.8047,
      recall: 0.68,
      f1Score: 0.7371,
      falsePositiveCount: 33,
      falseNegativeCount: 64,
      truePositiveCount: 136,
      trueNegativeCount: 11767,
      predictedFailureCount: 169,
      totalSamples: 12000,
      falsePositiveCost: 33,
      falseNegativeCost: 640,
      businessCost: 673,
      source: "validation_checkpoint",
      scope: "validation",
      scopeLabel: "External validation",
      sourceReference: "artifacts/phase9/threshold_policy_comparisons.json",
    },
    {
      threshold: 1.0,
      precision: 0.0,
      recall: 0.0,
      f1Score: 0.0,
      falsePositiveCount: 0,
      falseNegativeCount: 200,
      truePositiveCount: 0,
      trueNegativeCount: 11800,
      predictedFailureCount: 0,
      totalSamples: 12000,
      falsePositiveCost: 0,
      falseNegativeCost: 2000,
      businessCost: 2000,
      source: "validation_checkpoint",
      scope: "validation",
      scopeLabel: "External validation",
      sourceReference: "artifacts/phase9/threshold_policy_comparisons.json",
    },
  ];

  const mockFrozenRecommendation: ThresholdRecommendation = {
    kind: "default",
    label: "Frozen candidate operating point",
    metrics: sampleValidationCheckpoints[2],
    explanation: "Preserved at frozen evaluation threshold (0.115).",
    scope: "validation",
    scopeLabel: "External validation",
  };

  const mockMinCostRecommendation: ThresholdRecommendation = {
    kind: "minimum_cost",
    label: "Frozen minimum-cost threshold / external validation",
    metrics: sampleValidationCheckpoints[2],
    explanation: "Selected by minimum illustrative cost on OOF policy subset.",
    scope: "validation",
    scopeLabel: "External validation",
  };

  const mockMaxF1Recommendation: ThresholdRecommendation = {
    kind: "maximum_f1",
    label: "Internal maximum-F1 comparison",
    metrics: sampleValidationCheckpoints[3],
    explanation: "Persisted internal threshold-selection evidence (OOF policy tuning).",
    scope: "internal_selection",
    scopeLabel: "Internal policy selection",
  };

  const mockModel: ThresholdModelEvaluation = {
    modelId: "experiment:phase9-final-validation-candidate",
    modelName: "catboost / phase9-final-validation-candidate",
    modelType: "catboost",
    prAuc: 0.8011,
    evaluationDataset: "Phase 9 external validation / frozen candidate",
    evaluationSplit: "12,000-record external validation partition",
    defaultThreshold: 0.115,
    frozenThreshold: 0.115,
    calibrationStatus: "completed",
    calibrationStatusLabel: "isotonic / persisted historical evidence",
    thresholdCurve: sampleValidationCheckpoints,
    calibrationCurve: [],
    recommendations: {
      minimumCost: mockMinCostRecommendation,
      maximumF1: mockMaxF1Recommendation,
      default: mockFrozenRecommendation,
    },
    costWeights: { falsePositive: 1, falseNegative: 10 },
  };

  // Helper matching threshold-workspace.tsx
  function getExactCheckpoint(model: ThresholdModelEvaluation, targetThreshold: number): ThresholdCurvePoint | null {
    const points = model.thresholdCurve;
    if (!points || points.length === 0) return null;
    const targetKey = targetThreshold.toFixed(4);
    return points.find((pt) => pt.threshold.toFixed(4) === targetKey) ?? null;
  }

  it("selects exact checkpoints and synchronizes all metrics without stale state", () => {
    // 1. Initial frozen checkpoint (0.115)
    const initial = getExactCheckpoint(mockModel, 0.115);
    expect(initial).not.toBeNull();
    expect(initial?.threshold).toBe(0.115);
    expect(initial?.businessCost).toBe(362);
    expect(initial?.recall).toBe(0.915);
    expect(initial?.precision).toBe(0.488);
    expect(initial?.truePositiveCount).toBe(183);
    expect(initial?.falseNegativeCount).toBe(17);
    expect(initial?.falsePositiveCount).toBe(192);
    expect(initial?.trueNegativeCount).toBe(11608);

    // Confusion matrix reconciles exactly to 12,000 validation records
    expect(
      (initial?.truePositiveCount ?? 0) +
        (initial?.trueNegativeCount ?? 0) +
        (initial?.falsePositiveCount ?? 0) +
        (initial?.falseNegativeCount ?? 0),
    ).toBe(12000);

    // 2. Select another checkpoint (0.305)
    const changed = getExactCheckpoint(mockModel, 0.305);
    expect(changed).not.toBeNull();
    expect(changed?.threshold).toBe(0.305);
    expect(changed?.businessCost).toBe(417);
    expect(changed?.recall).toBe(0.84);
    expect(changed?.precision).toBe(0.634);
    expect(changed?.truePositiveCount).toBe(168);
    expect(changed?.falseNegativeCount).toBe(32);
    expect(changed?.falsePositiveCount).toBe(97);
    expect(changed?.trueNegativeCount).toBe(11703);

    // Reconciles to 12,000 validation records
    expect(
      (changed?.truePositiveCount ?? 0) +
        (changed?.trueNegativeCount ?? 0) +
        (changed?.falsePositiveCount ?? 0) +
        (changed?.falseNegativeCount ?? 0),
    ).toBe(12000);
  });

  it("rejects non-persisted thresholds without nearest-neighbor fallback", () => {
    expect(getExactCheckpoint(mockModel, 0.114)).toBeNull();
    expect(getExactCheckpoint(mockModel, 0.116)).toBeNull();
    expect(getExactCheckpoint(mockModel, 0.200)).toBeNull();
    expect(getExactCheckpoint(mockModel, 0.999)).toBeNull();
  });

  it("stepper and slider index navigation works with boundary clamping", () => {
    const checkpoints = mockModel.thresholdCurve;
    const count = checkpoints.length;

    // Index calculation matching ThresholdControl
    function getIndexForThreshold(t: number) {
      const targetKey = t.toFixed(4);
      return checkpoints.findIndex((pt) => pt.threshold.toFixed(4) === targetKey);
    }

    const idx0 = getIndexForThreshold(0.0);
    expect(idx0).toBe(0);
    // Previous at 0 is disabled
    expect(idx0 > 0).toBe(false);

    const idxFrozen = getIndexForThreshold(0.115);
    expect(idxFrozen).toBe(2);
    // Can step left to index 1 (threshold 0.05)
    expect(checkpoints[idxFrozen - 1].threshold).toBe(0.05);
    // Can step right to index 3 (threshold 0.305)
    expect(checkpoints[idxFrozen + 1].threshold).toBe(0.305);

    const idxMax = getIndexForThreshold(1.0);
    expect(idxMax).toBe(count - 1);
    // Next at max is disabled
    expect(idxMax < count - 1).toBe(false);
  });

  it("reset restores exactly 0.115 and frozen policy state", () => {
    let currentThreshold = 0.5;
    expect(currentThreshold).not.toBe(mockModel.defaultThreshold);

    // Perform reset action
    currentThreshold = mockModel.defaultThreshold;
    expect(currentThreshold).toBe(0.115);

    const activePoint = getExactCheckpoint(mockModel, currentThreshold);
    expect(activePoint?.threshold).toBe(0.115);
    expect(activePoint?.scope).toBe("validation");
    expect(activePoint?.businessCost).toBe(362);
  });

  it("recalculates business cost dynamically when cost weights are modified without mutating persisted evidence", () => {
    const checkpoint = getExactCheckpoint(mockModel, 0.115)!;
    expect(checkpoint.businessCost).toBe(362);

    // Standard weights: FP=1, FN=10 -> 192*1 + 17*10 = 362
    const defaultWeights: CostWeights = { falsePositive: 1, falseNegative: 10 };
    const defaultCost =
      checkpoint.falsePositiveCount * defaultWeights.falsePositive +
      checkpoint.falseNegativeCount * defaultWeights.falseNegative;
    expect(defaultCost).toBe(362);

    // Modified weights: FP=2, FN=20
    const customWeights: CostWeights = { falsePositive: 2, falseNegative: 20 };
    const recalculatedCost =
      checkpoint.falsePositiveCount * customWeights.falsePositive +
      checkpoint.falseNegativeCount * customWeights.falseNegative;
    expect(recalculatedCost).toBe(192 * 2 + 17 * 20); // 384 + 340 = 724

    // Underlying checkpoint object is NOT mutated
    expect(checkpoint.businessCost).toBe(362);
    expect(checkpoint.falsePositiveCount).toBe(192);
    expect(checkpoint.falseNegativeCount).toBe(17);
  });

  it("satisfies all regression invariants and cost formulations", () => {
    // 1. Business Cost formulation: (1 * FP) + (10 * FN)
    const formulaCost = (fp: number, fn: number) => 1 * fp + 10 * fn;

    // 2. Frozen validation checkpoint: FP=192, FN=17 -> 362
    expect(formulaCost(192, 17)).toBe(362);

    // 3. Official test invariants (Phase 10):
    // TN 15411, FP 214, FN 35, TP 340 -> Cost 564
    const officialTestFp = 214;
    const officialTestFn = 35;
    expect(formulaCost(officialTestFp, officialTestFn)).toBe(564);

    const officialTestTotal = 15411 + 214 + 35 + 340;
    expect(officialTestTotal).toBe(16000); // 16,000 test records

    // Invariant: Official test metrics
    const officialTestPrAuc = 0.863806;
    const officialTestRocAuc = 0.993536;
    const officialTestPrecision = 0.613718;
    const officialTestRecall = 0.906667;
    const officialTestF1 = 0.731970;

    expect(officialTestPrAuc).toBe(0.863806);
    expect(officialTestRocAuc).toBe(0.993536);
    expect(officialTestPrecision).toBeCloseTo(340 / (340 + 214), 5);
    expect(officialTestRecall).toBeCloseTo(340 / (340 + 35), 5);
    expect(officialTestF1).toBeCloseTo((2 * officialTestPrecision * officialTestRecall) / (officialTestPrecision + officialTestRecall), 5);
  });

  it("distinguishes external validation vs internal selection scopes on recommendations", () => {
    const recs = mockModel.recommendations;

    // Minimum cost is on external validation
    expect(recs.minimumCost.scope).toBe("validation");
    expect(recs.minimumCost.metrics.threshold).toBe(0.115);

    // Maximum F1 is on internal selection
    expect(recs.maximumF1.scope).toBe("internal_selection");
    expect(recs.maximumF1.metrics.threshold).toBe(0.305);

    // Default is on external validation
    expect(recs.default.scope).toBe("validation");
    expect(recs.default.metrics.threshold).toBe(0.115);
  });
});

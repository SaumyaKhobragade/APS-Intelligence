import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchThresholdSnapshot } from "@/services/threshold-service";
import type {
  BackendHistoricalCalibrationResponse,
  BackendHistoricalThresholdResponse,
} from "@/services/backend-contracts";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Phase 13.1.2 — Threshold Evidence Scope & Frozen Policy Identification", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mockThresholdResponse: BackendHistoricalThresholdResponse = {
    evidence_version: "phase11.3.v1",
    reference_id: "phase9-final-validation-candidate",
    model_name: "catboost",
    model_version: "phase9.1.0",
    calibration_method: "isotonic",
    frozen_threshold: 0.115,
    selection_objective: "minimum_cost",
    selection_scope: "Internal OOF policy subset derived from the training partition",
    validation: {
      scope: "validation",
      label: "External validation / frozen threshold 0.115",
      threshold: 0.115,
      pr_auc: 0.8011,
      roc_auc: 0.994,
      precision: 0.488,
      recall: 0.915,
      f1_score: 0.6365,
      false_positive_cost: 1.0,
      false_negative_cost: 10.0,
      estimated_business_cost: 362.0,
      confusion_matrix: { true_negative: 11608, false_positive: 192, false_negative: 17, true_positive: 183 },
      source_reference: "artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
    },
    threshold_points: [
      {
        threshold: 0.115,
        precision: 0.50,
        recall: 0.941,
        f1_score: 0.6507,
        false_positive: 187,
        false_negative: 21,
        true_positive: 189,
        true_negative: 11613,
        business_cost: 397.0,
        source_reference: "artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
      },
      {
        threshold: 0.305,
        precision: 0.738,
        recall: 0.772,
        f1_score: 0.7549,
        false_positive: 62,
        false_negative: 45,
        true_positive: 153,
        true_negative: 11738,
        business_cost: 514.0,
        source_reference: "artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
        scope: "internal_selection",
        scope_label: "Internal policy selection",
      },
      {
        threshold: 0.0,
        precision: 0.0167,
        recall: 1.0,
        f1_score: 0.0328,
        false_positive: 11800,
        false_negative: 0,
        true_positive: 200,
        true_negative: 0,
        business_cost: 11800.0,
        source_reference: "artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
        scope: "internal_selection",
        scope_label: "Internal policy selection",
      },
    ],
    internal_points: [
      {
        threshold: 0.305,
        precision: 0.738,
        recall: 0.772,
        f1_score: 0.7549,
        false_positive: 62,
        false_negative: 45,
        true_positive: 153,
        true_negative: 11738,
        business_cost: 514.0,
        source_reference: "artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
        scope: "internal_selection",
        scope_label: "Internal policy selection",
      },
    ],
    calibration_metrics: { brier_score: 0.0071 },
    artifacts: [],
    availability: [],
    provenance: ["Threshold evidence from Phase 9."],
  };

  const mockCalibrationResponse: BackendHistoricalCalibrationResponse = {
    evidence_version: "phase11.3.v1",
    reference_id: "phase9-final-validation-candidate",
    model_name: "catboost",
    model_version: "phase9.1.0",
    selected_method: "isotonic",
    evaluation_scope: "External validation",
    metrics: { brier_score: 0.0071 },
    reliability_curve: [
      { bin_label: "bin_1", predicted_probability: 0.1, observed_failure_rate: 0.09, sample_count: 500 },
    ],
    artifacts: [],
    availability: [],
    provenance: ["Isotonic calibration applied."],
  };

  it("strictly separates external validation and internal selection evidence scopes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/historical-evidence/thresholds/")) return Promise.resolve(jsonResponse(mockThresholdResponse));
      if (url.includes("/historical-evidence/calibration/")) return Promise.resolve(jsonResponse(mockCalibrationResponse));
      return Promise.reject(new Error(`Unhandled route: ${url}`));
    }));

    const snapshot = await fetchThresholdSnapshot();
    const model = snapshot.models[0];
    expect(model).toBeDefined();

    // 1. Frozen operating point (0.115) must have validation scope
    const frozenPoint = model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === (0.115).toFixed(4));
    expect(frozenPoint).toBeDefined();
    expect(frozenPoint?.scope).toBe("validation");
    expect(frozenPoint?.scopeLabel).toContain("External validation");
    expect(frozenPoint?.businessCost).toBe(362.0); // Exact external validation metric
    expect(frozenPoint?.recall).toBeCloseTo(0.915);
    expect(frozenPoint?.precision).toBeCloseTo(0.488);

    // 2. Internal selection checkpoints must never be labeled as external validation
    const internalPoint305 = model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === (0.305).toFixed(4));
    expect(internalPoint305).toBeDefined();
    expect(internalPoint305?.scope).toBe("internal_selection");
    expect(internalPoint305?.scopeLabel).toContain("Internal policy selection");
    expect(internalPoint305?.businessCost).toBe(514.0);

    const internalPoint0 = model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === (0.0).toFixed(4));
    expect(internalPoint0).toBeDefined();
    expect(internalPoint0?.scope).toBe("internal_selection");
    expect(internalPoint0?.scopeLabel).toContain("Internal policy selection");
    expect(internalPoint0?.businessCost).toBe(11800.0);

    // 3. Recommendations must clearly identify whether they originate from external validation or internal selection
    expect(model.recommendations.default.scope).toBe("validation");
    expect(model.recommendations.default.scopeLabel).toBe("External validation");
    expect(model.recommendations.default.metrics.threshold).toBeCloseTo(0.115);

    expect(model.recommendations.minimumCost.scope).toBe("validation");
    expect(model.recommendations.minimumCost.scopeLabel).toBe("External validation");
    expect(model.recommendations.minimumCost.metrics.threshold).toBeCloseTo(0.115);

    expect(model.recommendations.maximumF1.scope).toBe("internal_selection");
    expect(model.recommendations.maximumF1.scopeLabel).toBe("Internal policy selection");
    expect(model.recommendations.maximumF1.metrics.threshold).toBeCloseTo(0.305);
  });

  it("does not falsely identify nearby exploratory threshold values as frozen evaluation policy", async () => {
    // Inject a nearby exploratory checkpoint, e.g. 0.114 and 0.118
    const mockWithNearby = {
      ...mockThresholdResponse,
      threshold_points: [
        ...mockThresholdResponse.threshold_points,
        {
          threshold: 0.114,
          precision: 0.485,
          recall: 0.916,
          f1_score: 0.634,
          false_positive: 194,
          false_negative: 16,
          true_positive: 184,
          true_negative: 11606,
          business_cost: 354.0,
          source_reference: "exploratory_nearby",
        },
        {
          threshold: 0.118,
          precision: 0.492,
          recall: 0.910,
          f1_score: 0.638,
          false_positive: 190,
          false_negative: 19,
          true_positive: 181,
          true_negative: 11610,
          business_cost: 380.0,
          source_reference: "exploratory_nearby",
        },
      ],
    };

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/historical-evidence/thresholds/")) return Promise.resolve(jsonResponse(mockWithNearby));
      if (url.includes("/historical-evidence/calibration/")) return Promise.resolve(jsonResponse(mockCalibrationResponse));
      return Promise.reject(new Error(`Unhandled route: ${url}`));
    }));

    const snapshot = await fetchThresholdSnapshot();
    const model = snapshot.models[0];

    const pt114 = model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === (0.114).toFixed(4));
    const pt118 = model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === (0.118).toFixed(4));
    const pt115 = model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === (0.115).toFixed(4));

    expect(pt114).toBeDefined();
    expect(pt118).toBeDefined();
    expect(pt115).toBeDefined();

    // Verify exact matching helper behavior
    function isFrozenPolicy(pt: typeof pt115, defaultThreshold: number) {
      if (!pt) return false;
      return pt.threshold.toFixed(4) === defaultThreshold.toFixed(4) && pt.scope === "validation";
    }

    expect(isFrozenPolicy(pt115, model.defaultThreshold)).toBe(true);
    expect(isFrozenPolicy(pt114, model.defaultThreshold)).toBe(false);
    expect(isFrozenPolicy(pt118, model.defaultThreshold)).toBe(false);
  });

  it("handles missing frozen checkpoint explicitly without falling back to nearest checkpoint", async () => {
    // Validation point has threshold 0.115, but threshold_points only has 0.200 and 0.400, and validation is missing
    const mockMissingValidation = {
      ...mockThresholdResponse,
      validation: null,
    };

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/historical-evidence/thresholds/")) return Promise.resolve(jsonResponse(mockMissingValidation));
      if (url.includes("/historical-evidence/calibration/")) return Promise.resolve(jsonResponse(mockCalibrationResponse));
      return Promise.reject(new Error(`Unhandled route: ${url}`));
    }));

    const snapshot = await fetchThresholdSnapshot();
    expect(snapshot.models).toHaveLength(0);
    expect(snapshot.evaluationDataset).toBe("Historical validation evidence unavailable");
  });

  it("preserves exact record metrics for all checkpoints without interpolation or nearest substitution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("/historical-evidence/thresholds/")) return Promise.resolve(jsonResponse(mockThresholdResponse));
      if (url.includes("/historical-evidence/calibration/")) return Promise.resolve(jsonResponse(mockCalibrationResponse));
      return Promise.reject(new Error(`Unhandled route: ${url}`));
    }));

    const snapshot = await fetchThresholdSnapshot();
    const model = snapshot.models[0];

    // Exact lookup function matching the workspace and control implementation
    function getExactCheckpoint(target: number) {
      const targetKey = target.toFixed(4);
      return model.thresholdCurve.find((pt) => pt.threshold.toFixed(4) === targetKey) ?? null;
    }

    // 1. Known checkpoints return exact underlying records
    const exact0 = getExactCheckpoint(0.0);
    expect(exact0).not.toBeNull();
    expect(exact0?.businessCost).toBe(11800.0);
    expect(exact0?.recall).toBe(1.0);

    const exact115 = getExactCheckpoint(0.115);
    expect(exact115).not.toBeNull();
    expect(exact115?.businessCost).toBe(362.0);
    expect(exact115?.recall).toBe(0.915);
    expect(exact115?.scope).toBe("validation");

    const exact305 = getExactCheckpoint(0.305);
    expect(exact305).not.toBeNull();
    expect(exact305?.businessCost).toBe(514.0);
    expect(exact305?.recall).toBe(0.772);
    expect(exact305?.scope).toBe("internal_selection");

    // 2. Unregistered threshold returns null — NOT nearest neighbor
    expect(getExactCheckpoint(0.120)).toBeNull();
    expect(getExactCheckpoint(0.200)).toBeNull();
    expect(getExactCheckpoint(0.500)).toBeNull();
  });
});

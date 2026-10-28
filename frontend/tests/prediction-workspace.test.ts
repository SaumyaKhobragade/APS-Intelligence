import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CANONICAL_APS_FEATURES,
  fetchFeatureSchema,
  fetchPredictionHistory,
  fetchPredictionModels,
  parseAndValidateBatchCsv,
  parseNumericSensorValue,
  predictBatch,
  predictSingle,
  validateSensorPayload,
} from "@/services/prediction-service";
import type {
  BackendBatchPredictionResponse,
  BackendFeatureSchemaResponse,
  BackendPolicyListResponse,
  BackendPredictionHistoryResponse,
  BackendPredictionModelListResponse,
  BackendPredictionResponse,
  BackendRegistryListResponse,
} from "@/services/backend-contracts";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Phase 13.2.3 — Failure Prediction Workspace & Sensor Schema Validation", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("1. Canonical 170 Sensor Feature Contract", () => {
    it("has exactly 170 authoritative feature identifiers", () => {
      expect(CANONICAL_APS_FEATURES).toHaveLength(170);
    });

    it("starts with aa_000 and ends with eg_000 in correct order", () => {
      expect(CANONICAL_APS_FEATURES[0]).toBe("aa_000");
      expect(CANONICAL_APS_FEATURES[1]).toBe("ab_000");
      expect(CANONICAL_APS_FEATURES[CANONICAL_APS_FEATURES.length - 1]).toBe("eg_000");
    });

    it("contains no duplicate feature names", () => {
      const unique = new Set(CANONICAL_APS_FEATURES);
      expect(unique.size).toBe(170);
    });

    it("falls back to canonical schema if backend features endpoint fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      const schema = await fetchFeatureSchema({ experimentId: "phase9-final-validation-candidate" });
      expect(schema).toHaveLength(170);
      expect(schema[0]?.id).toBe("aa_000");
      expect(schema[0]?.group).toBe("aa");
    });

    it("uses backend schema when endpoint returns valid 170 features", async () => {
      const mockSchemaResponse: BackendFeatureSchemaResponse = {
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        feature_count: 170,
        feature_names: [...CANONICAL_APS_FEATURES],
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockSchemaResponse)));

      const schema = await fetchFeatureSchema({ modelRunId: "run-001" });
      expect(schema).toHaveLength(170);
      expect(schema[0]?.id).toBe("aa_000");
    });
  });

  describe("2. Single-Record Numeric Sensor Value Parsing & Validation", () => {
    it("correctly parses empty or missing values as null without coercing to zero", () => {
      expect(parseNumericSensorValue("")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("   ")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("na")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("NA")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("null")).toEqual({ valid: true, value: null });
    });

    it("preserves valid zero values and does not convert to null", () => {
      expect(parseNumericSensorValue("0")).toEqual({ valid: true, value: 0 });
      expect(parseNumericSensorValue("0.0")).toEqual({ valid: true, value: 0 });
      expect(parseNumericSensorValue("-0")).toEqual({ valid: true, value: -0 });
    });

    it("correctly parses positive and negative floating-point numbers", () => {
      expect(parseNumericSensorValue("42.5")).toEqual({ valid: true, value: 42.5 });
      expect(parseNumericSensorValue("-12.375")).toEqual({ valid: true, value: -12.375 });
      expect(parseNumericSensorValue("1e-4")).toEqual({ valid: true, value: 0.0001 });
      expect(parseNumericSensorValue(".5")).toEqual({ valid: true, value: 0.5 });
    });

    it("strictly rejects NaN and positive/negative Infinity", () => {
      expect(parseNumericSensorValue("NaN").valid).toBe(false);
      expect(parseNumericSensorValue("nan").valid).toBe(false);
      expect(parseNumericSensorValue("Infinity").valid).toBe(false);
      expect(parseNumericSensorValue("-Infinity").valid).toBe(false);
      expect(parseNumericSensorValue("+Infinity").valid).toBe(false);
    });

    it("strictly rejects malformed numeric strings", () => {
      expect(parseNumericSensorValue("abc").valid).toBe(false);
      expect(parseNumericSensorValue("12.3.4").valid).toBe(false);
      expect(parseNumericSensorValue("12a").valid).toBe(false);
      expect(parseNumericSensorValue("++5").valid).toBe(false);
    });

    it("validates entire sensor record payload", () => {
      const validRecord: Record<string, number | null> = {};
      for (const id of CANONICAL_APS_FEATURES) {
        validRecord[id] = id === "aa_000" ? 0 : id === "ab_000" ? 12.5 : null;
      }
      expect(validateSensorPayload(validRecord).valid).toBe(true);

      const invalidRecord = { ...validRecord, aa_000: Number.NaN };
      expect(validateSensorPayload(invalidRecord).valid).toBe(false);

      const infinityRecord = { ...validRecord, ab_000: Number.POSITIVE_INFINITY };
      expect(validateSensorPayload(infinityRecord).valid).toBe(false);
    });
  });

  describe("3. Batch CSV Parsing & Schema Pre-Validation", () => {
    function generateValidCsv(rowCount = 2): string {
      const header = CANONICAL_APS_FEATURES.join(",");
      const rows: string[] = [];
      for (let r = 0; r < rowCount; r++) {
        rows.push(CANONICAL_APS_FEATURES.map((_, idx) => (idx % 2 === 0 ? "0" : idx % 5 === 0 ? "na" : "1.23")).join(","));
      }
      return [header, ...rows].join("\n");
    }

    it("validates a conforming 170-column CSV with valid rows and nulls", () => {
      const csv = generateValidCsv(3);
      const res = parseAndValidateBatchCsv(csv, "valid.csv", csv.length);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.summary?.rowCount).toBe(3);
      expect(res.summary?.featureCount).toBe(170);
      expect(res.records).toHaveLength(3);
      expect(res.records?.[0]?.features.aa_000).toBe(0);
    });

    it("detects missing required columns", () => {
      const subsetHeaders = CANONICAL_APS_FEATURES.slice(2).join(",");
      const row = CANONICAL_APS_FEATURES.slice(2).map(() => "1.0").join(",");
      const csv = `${subsetHeaders}\n${row}`;

      const res = parseAndValidateBatchCsv(csv, "missing.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Missing 2 required sensor column"))).toBe(true);
      expect(res.errors.some((e) => e.includes("aa_000"))).toBe(true);
    });

    it("detects unexpected columns forbidden by backend schema", () => {
      const extraHeaders = `${CANONICAL_APS_FEATURES.join(",")},unexpected_sensor_x,extra_metric`;
      const row = `${CANONICAL_APS_FEATURES.map(() => "1.0").join(",")},10.0,20.0`;
      const csv = `${extraHeaders}\n${row}`;

      const res = parseAndValidateBatchCsv(csv, "extra.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Unexpected column(s) detected"))).toBe(true);
      expect(res.errors.some((e) => e.includes("unexpected_sensor_x"))).toBe(true);
    });

    it("detects duplicate column headers", () => {
      const duplicateHeaders = `aa_000,${CANONICAL_APS_FEATURES.join(",")}`;
      const row = `1.0,${CANONICAL_APS_FEATURES.map(() => "1.0").join(",")}`;
      const csv = `${duplicateHeaders}\n${row}`;

      const res = parseAndValidateBatchCsv(csv, "duplicate.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Duplicate column header(s) detected"))).toBe(true);
    });

    it("detects invalid numeric cells, NaN, and Infinity in rows", () => {
      const header = CANONICAL_APS_FEATURES.join(",");
      const badRow = CANONICAL_APS_FEATURES.map((id) => (id === "aa_000" ? "corrupted_text" : id === "ab_000" ? "Infinity" : "0.5")).join(",");
      const csv = `${header}\n${badRow}`;

      const res = parseAndValidateBatchCsv(csv, "corrupt.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("invalid numeric value 'corrupted_text'"))).toBe(true);
      expect(res.errors.some((e) => e.includes("invalid numeric value 'Infinity'"))).toBe(true);
    });

    it("rejects empty CSV and header-only CSV", () => {
      expect(parseAndValidateBatchCsv("", "empty.csv", 0).valid).toBe(false);
      expect(parseAndValidateBatchCsv("   \n\n", "whitespace.csv", 3).valid).toBe(false);

      const headerOnly = CANONICAL_APS_FEATURES.join(",");
      const res = parseAndValidateBatchCsv(headerOnly, "header_only.csv", headerOnly.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("no data rows"))).toBe(true);
    });

    it("enforces maximum 1,000 records backend limit", () => {
      const csv = generateValidCsv(1005);
      const res = parseAndValidateBatchCsv(csv, "large.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("maximum is 1,000 records"))).toBe(true);
    });

    it("detects malformed row with mismatched column count", () => {
      const header = CANONICAL_APS_FEATURES.join(",");
      const malformedRow = "1.0,2.0,3.0"; // Only 3 values instead of 170
      const csv = `${header}\n${malformedRow}`;

      const res = parseAndValidateBatchCsv(csv, "malformed.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("fields; expected 170"))).toBe(true);
    });
  });

  describe("4. Model Selector & Lifecycle Gated State", () => {
    it("lists validation candidate in unpromoted / gated state when no models are promoted", async () => {
      const emptyModels: BackendPredictionModelListResponse = { items: [], total: 0, page: 1, page_size: 100 };
      const emptyPolicies: BackendPolicyListResponse = { items: [], total: 0, page: 1, page_size: 100 };
      const emptyRegistry: BackendRegistryListResponse = { items: [], total: 0, page: 1, page_size: 100 };
      const emptyPromotions = { items: [] };

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse(emptyModels))
          .mockResolvedValueOnce(jsonResponse(emptyPolicies))
          .mockResolvedValueOnce(jsonResponse(emptyRegistry))
          .mockResolvedValueOnce(jsonResponse(emptyPromotions))
      );

      const options = await fetchPredictionModels();
      expect(options.length).toBeGreaterThanOrEqual(1);

      const candidate = options.find((opt) => opt.referenceId === "phase9-final-validation-candidate");
      expect(candidate).toBeDefined();
      expect(candidate?.availability).toBe("not_loaded");
      expect(candidate?.defaultThreshold).toBe(0.115);
      expect(candidate?.featureCount).toBe(170);
      expect(candidate?.availabilityNote).toContain("Candidate model is unapproved (promotions: 0)");
    });
  });

  describe("5. Prediction API Service & History Verification", () => {
    it("calls single prediction endpoint and maps response accurately", async () => {
      const mockResponse: BackendPredictionResponse = {
        prediction_id: "pred-test-123",
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        predicted_class: "pos",
        failure_probability: 0.8524,
        applied_threshold: 0.115,
        risk_classification: "high",
        prediction_timestamp: "2026-10-28T12:00:00Z",
        inference_duration_ms: 12.5,
        warnings: [],
        calibration_method: "isotonic",
        explanation: {
          method: "global_model_feature_importance",
          warning: "Global feature importance is not a per-record causal explanation.",
          top_features: [{ feature_name: "aa_000", importance: 0.45, importance_type: "feature_importance" }],
        },
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockResponse)));

      const readings: Record<string, number | null> = { aa_000: 1.0 };
      const result = await predictSingle({ modelId: "run-001", readings }, { modelRunId: "run-001" });

      expect(result.predictionId).toBe("pred-test-123");
      expect(result.predictedLabel).toBe("failure");
      expect(result.failureProbability).toBe(0.8524);
      expect(result.threshold).toBe(0.115);
      expect(result.featureContributions).toHaveLength(1);
      expect(result.featureContributions?.[0]?.featureId).toBe("aa_000");
    });

    it("calls batch prediction endpoint and maps itemized records and counts", async () => {
      const mockBatchResponse: BackendBatchPredictionResponse = {
        batch_id: "batch-test-456",
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        total_records: 2,
        successful_count: 2,
        failed_count: 0,
        positive_count: 1,
        negative_count: 1,
        total_inference_duration_ms: 25.0,
        average_inference_duration_ms: 12.5,
        warnings: [],
        items: [
          {
            index: 0,
            prediction: {
              prediction_id: "pred-1",
              model_reference_type: "training_run",
              model_reference_id: "run-001",
              model_version: "1.0.0",
              predicted_class: "pos",
              failure_probability: 0.9,
              applied_threshold: 0.115,
              risk_classification: "high",
              prediction_timestamp: "2026-10-28T12:00:00Z",
              inference_duration_ms: 12.5,
              calibration_method: "uncalibrated",
              warnings: [],
            },
          },
          {
            index: 1,
            prediction: {
              prediction_id: "pred-2",
              model_reference_type: "training_run",
              model_reference_id: "run-001",
              model_version: "1.0.0",
              predicted_class: "neg",
              failure_probability: 0.05,
              applied_threshold: 0.115,
              risk_classification: "low",
              prediction_timestamp: "2026-10-28T12:00:00Z",
              inference_duration_ms: 12.5,
              calibration_method: "uncalibrated",
              warnings: [],
            },
          },
        ],
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockBatchResponse)));

      const res = await predictBatch({
        modelRunId: "run-001",
        records: [{ features: { aa_000: 1.0 } }, { features: { aa_000: 0.0 } }],
      });

      expect(res.batchId).toBe("batch-test-456");
      expect(res.rowCount).toBe(2);
      expect(res.completedCount).toBe(2);
      expect(res.failedCount).toBe(0);
      expect(res.positiveCount).toBe(1);
      expect(res.negativeCount).toBe(1);
      expect(res.items).toHaveLength(2);
      expect(res.items?.[0]?.prediction?.predictedLabel).toBe("failure");
      expect(res.items?.[1]?.prediction?.predictedLabel).toBe("normal");
    });

    it("fetches genuine prediction history from /predictions endpoint", async () => {
      const mockHistory: BackendPredictionHistoryResponse = {
        total: 1,
        page: 1,
        page_size: 100,
        items: [
          {
            prediction_id: "pred-persisted-999",
            model_reference_type: "training_run",
            model_reference_id: "run-001",
            model_version: "1.0.0",
            predicted_class: "neg",
            failure_probability: 0.02,
            applied_threshold: 0.115,
            risk_classification: "low",
            prediction_timestamp: "2026-10-28T10:00:00Z",
            inference_duration_ms: 8.0,
            calibration_method: "uncalibrated",
            warnings: [],
          },
        ],
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockHistory)));

      const history = await fetchPredictionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]?.predictionId).toBe("pred-persisted-999");
      expect(history[0]?.predictedLabel).toBe("normal");
    });
  });
});

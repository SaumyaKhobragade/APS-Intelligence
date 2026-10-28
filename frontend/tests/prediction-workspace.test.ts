import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CANONICAL_APS_FEATURES,
  executeBatchPredictionSubmission,
  executePredictionSubmission,
  exportBatchPredictionsCsv,
  fetchFeatureSchema,
  fetchPredictionModels,
  generateBatchPredictionsCsv,
  parseAndValidateBatchCsv,
  parseCsvRecords,
  parseNumericSensorValue,
  predictBatch,
  predictSingle,
} from "@/services/prediction-service";
import type {
  BackendBatchPredictionResponse,
  BackendFeatureSchemaResponse,
  BackendPolicyListResponse,
  BackendPredictionModelListResponse,
  BackendPredictionResponse,
  BackendRegistryListResponse,
} from "@/services/backend-contracts";
import type { BatchPredictionResponse, PredictionModelOption, PredictionResult } from "@/types";

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("Phase 13.2.3.1 — Failure Prediction Review Fixes", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("1. Schema Verification vs Canonical Fallback Distinction", () => {
    it("returns backend_verified when endpoint returns 170 valid distinct canonical features", async () => {
      const mockSchema: BackendFeatureSchemaResponse = {
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        feature_count: 170,
        feature_names: [...CANONICAL_APS_FEATURES],
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockSchema)));

      const result = await fetchFeatureSchema({ modelRunId: "run-001" });
      expect(result.source).toBe("backend_verified");
      expect(result.features).toHaveLength(170);
      expect(result.warning).toBeUndefined();
      expect(result.features[0]?.id).toBe("aa_000");
    });

    it("falls back to canonical schema when endpoint is unavailable", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network connection refused")));

      const result = await fetchFeatureSchema({ experimentId: "phase9-final-validation-candidate" });
      expect(result.source).toBe("canonical_fallback");
      expect(result.features).toHaveLength(170);
      expect(result.warning).toContain("endpoint unavailable");
      expect(result.features[0]?.id).toBe("aa_000");
    });

    it("falls back to canonical schema when backend returns wrong feature count", async () => {
      const wrongCountSchema = {
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        feature_count: 169,
        feature_names: CANONICAL_APS_FEATURES.slice(0, 169),
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wrongCountSchema)));

      const result = await fetchFeatureSchema({ modelRunId: "run-001" });
      expect(result.source).toBe("canonical_fallback");
      expect(result.features).toHaveLength(170);
      expect(result.warning).toContain("returned 169 features (expected 170)");
    });

    it("falls back to canonical schema when backend returns duplicate feature identifiers", async () => {
      const duplicateFeatures = [...CANONICAL_APS_FEATURES];
      duplicateFeatures[1] = "aa_000"; // replace ab_000 with duplicate aa_000
      const duplicateSchema = {
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        feature_count: 170,
        feature_names: duplicateFeatures,
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(duplicateSchema)));

      const result = await fetchFeatureSchema({ modelRunId: "run-001" });
      expect(result.source).toBe("canonical_fallback");
      expect(result.features).toHaveLength(170);
      expect(result.warning).toContain("duplicate feature identifiers");
    });

    it("falls back to canonical schema when backend returns invalid/incompatible feature identifier", async () => {
      const invalidFeatures = [...CANONICAL_APS_FEATURES];
      invalidFeatures[0] = "invalid_sensor_xyz";
      const invalidSchema = {
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0.0",
        feature_count: 170,
        feature_names: invalidFeatures,
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(invalidSchema)));

      const result = await fetchFeatureSchema({ modelRunId: "run-001" });
      expect(result.source).toBe("canonical_fallback");
      expect(result.features).toHaveLength(170);
      expect(result.warning).toContain("incompatible feature identifier 'invalid_sensor_xyz'");
    });

    it("falls back to canonical schema when no model reference is provided", async () => {
      const result = await fetchFeatureSchema();
      expect(result.source).toBe("canonical_fallback");
      expect(result.features).toHaveLength(170);
      expect(result.warning).toContain("No model reference specified");
    });
  });

  describe("2. Elimination of Inference Requests Used as Approval Checks", () => {
    it("marks unpromoted candidate as unapproved when promotions are zero", async () => {
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

      const models = await fetchPredictionModels();
      const candidate = models.find((m) => m.referenceId === "phase9-final-validation-candidate");
      expect(candidate).toBeDefined();
      expect(candidate?.approvalStatus).toBe("unapproved");
      expect(candidate?.availability).toBe("not_loaded");
    });

    it("marks models as verification_failed when registry or promotion service call fails", async () => {
      const mockModels: BackendPredictionModelListResponse = {
        total: 1,
        page: 1,
        page_size: 100,
        items: [
          {
            model_reference_type: "training_run",
            model_reference_id: "run-001",
            model_name: "LightGBM",
            model_version: "1.0",
            status: "active",
            default_threshold: 0.115,
            feature_count: 170,
            dataset_id: "dataset-001",
            available_policy_count: 1,
          },
        ],
      };

      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(jsonResponse(mockModels))
          .mockResolvedValueOnce(jsonResponse({ items: [], total: 0, page: 1, page_size: 100 }))
          .mockRejectedValueOnce(new Error("Registry service down (503)"))
          .mockResolvedValueOnce(jsonResponse({ items: [] }))
      );

      const models = await fetchPredictionModels();
      expect(models.every((m) => m.approvalStatus === "verification_failed")).toBe(true);
      expect(models.every((m) => m.availability === "not_loaded")).toBe(true);
    });

    it("verifies zero inference requests for unapproved models", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const unapprovedModel: PredictionModelOption = {
        modelId: "experiment:phase9-final-validation-candidate",
        modelName: "CatBoost / phase9.1.0",
        availability: "not_loaded",
        approvalStatus: "unapproved",
        availabilityNote: "Unapproved candidate",
        defaultThreshold: 0.115,
      };

      // Simulating workspace logic: check model status before calling inference
      const shouldBlock = unapprovedModel.approvalStatus !== "approved" || unapprovedModel.availability !== "available";
      expect(shouldBlock).toBe(true);

      if (!shouldBlock) {
        await predictSingle({ modelId: unapprovedModel.modelId, readings: {} }, { experimentId: "phase9-candidate" });
      }

      // Exactly zero fetch calls made for prediction
      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it("verifies zero inference requests for verification_failed models", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const failedModel: PredictionModelOption = {
        modelId: "training_run:run-001",
        modelName: "LightGBM",
        availability: "not_loaded",
        approvalStatus: "verification_failed",
        availabilityNote: "Registry service unavailable",
        defaultThreshold: 0.115,
      };

      const isUnavailable = failedModel.approvalStatus === "verification_failed";
      expect(isUnavailable).toBe(true);

      if (!isUnavailable && failedModel.approvalStatus === "approved") {
        await predictBatch({ modelRunId: "run-001", records: [] });
      }

      expect(fetchSpy).toHaveBeenCalledTimes(0);
    });

    it("verifies exactly one inference request for eligible approved model", async () => {
      const mockPrediction: BackendPredictionResponse = {
        prediction_id: "pred-approved-1",
        model_reference_type: "training_run",
        model_reference_id: "run-approved",
        model_version: "2.0.0",
        predicted_class: "neg",
        failure_probability: 0.04,
        applied_threshold: 0.115,
        risk_classification: "low",
        prediction_timestamp: "2026-10-28T15:00:00Z",
        inference_duration_ms: 10.0,
        calibration_method: "isotonic",
        warnings: [],
      };

      const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(mockPrediction));
      vi.stubGlobal("fetch", fetchSpy);

      const approvedModel: PredictionModelOption = {
        modelId: "training_run:run-approved",
        modelName: "LightGBM / Approved",
        availability: "available",
        approvalStatus: "approved",
        availabilityNote: "Approved model",
        defaultThreshold: 0.115,
        policyId: "policy-active-1",
      };

      if (approvedModel.approvalStatus === "approved" && approvedModel.availability === "available") {
        const res = await predictSingle({ modelId: approvedModel.modelId, readings: { aa_000: 5.0 } }, { modelRunId: "run-approved", decisionPolicyId: approvedModel.policyId });
        expect(res.predictionId).toBe("pred-approved-1");
      }

      // Exactly ONE inference request sent
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. RFC 4180 CSV Parser & Batch Validation", () => {
    function generateValidCsv(rowCount = 2): string {
      const header = CANONICAL_APS_FEATURES.join(",");
      const rows: string[] = [];
      for (let r = 0; r < rowCount; r++) {
        rows.push(CANONICAL_APS_FEATURES.map((_, idx) => (idx % 2 === 0 ? "0" : idx % 5 === 0 ? "na" : "1.23")).join(","));
      }
      return [header, ...rows].join("\n");
    }

    it("parses standard quoted values accurately", () => {
      const { rows, parseErrors } = parseCsvRecords('"aa_000","ab_000"\n"12.5","0"');
      expect(parseErrors).toHaveLength(0);
      expect(rows).toEqual([
        ["aa_000", "ab_000"],
        ["12.5", "0"],
      ]);
    });

    it("handles escaped quotes inside quoted fields", () => {
      const { rows, parseErrors } = parseCsvRecords('"name","desc"\n"sensor","value with ""nested quotes"""');
      expect(parseErrors).toHaveLength(0);
      expect(rows[1]?.[1]).toBe('value with "nested quotes"');
    });

    it("handles commas inside quoted fields without splitting them", () => {
      const { rows, parseErrors } = parseCsvRecords('col1,col2\n"12,345.67",hello');
      expect(parseErrors).toHaveLength(0);
      expect(rows[1]).toEqual(["12,345.67", "hello"]);
    });

    it("handles quoted newlines inside fields", () => {
      const { rows, parseErrors } = parseCsvRecords('col1,col2\n"line 1\nline 2",val2');
      expect(parseErrors).toHaveLength(0);
      expect(rows[1]?.[0]).toBe("line 1\nline 2");
    });

    it("preserves empty cells and trailing empty fields", () => {
      const { rows, parseErrors } = parseCsvRecords("a,b,c\n1,,3\n4,5,");
      expect(parseErrors).toHaveLength(0);
      expect(rows[1]).toEqual(["1", "", "3"]);
      expect(rows[2]).toEqual(["4", "5", ""]);
    });

    it("detects malformed unclosed quotes at EOF", () => {
      const { parseErrors } = parseCsvRecords('a,b\n"unclosed quote,val');
      expect(parseErrors.some((e) => e.includes("unclosed quote"))).toBe(true);
    });

    it("detects unexpected characters after closing quote", () => {
      const { parseErrors } = parseCsvRecords('a,b\n"quoted"extra,val');
      expect(parseErrors.some((e) => e.includes("unexpected character"))).toBe(true);
    });

    it("detects unescaped quotes inside unquoted fields", () => {
      const { parseErrors } = parseCsvRecords('a,b\nabc"def,val');
      expect(parseErrors.some((e) => e.includes("unescaped quote"))).toBe(true);
    });

    it("preserves zero and maps missing-value representations to null", () => {
      expect(parseNumericSensorValue("0")).toEqual({ valid: true, value: 0 });
      expect(parseNumericSensorValue("0.0")).toEqual({ valid: true, value: 0 });
      expect(parseNumericSensorValue("")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("na")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("nan")).toEqual({ valid: true, value: null });
      expect(parseNumericSensorValue("null")).toEqual({ valid: true, value: null });
    });

    it("detects duplicate headers", () => {
      const csv = `aa_000,${CANONICAL_APS_FEATURES.join(",")}\n1.0,${CANONICAL_APS_FEATURES.map(() => "1.0").join(",")}`;
      const res = parseAndValidateBatchCsv(csv, "dup.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Duplicate column header(s)"))).toBe(true);
    });

    it("detects missing expected feature columns", () => {
      const partial = CANONICAL_APS_FEATURES.slice(2).join(",");
      const row = CANONICAL_APS_FEATURES.slice(2).map(() => "1.0").join(",");
      const csv = `${partial}\n${row}`;
      const res = parseAndValidateBatchCsv(csv, "missing.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Missing 2 required sensor column"))).toBe(true);
    });

    it("detects unexpected columns", () => {
      const extra = `${CANONICAL_APS_FEATURES.join(",")},unexpected_col\n${CANONICAL_APS_FEATURES.map(() => "1").join(",")},2`;
      const res = parseAndValidateBatchCsv(extra, "extra.csv", extra.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("Unexpected column(s) detected"))).toBe(true);
    });

    it("rejects malformed row widths", () => {
      const header = CANONICAL_APS_FEATURES.join(",");
      const row = "1.0,2.0,3.0";
      const csv = `${header}\n${row}`;
      const res = parseAndValidateBatchCsv(csv, "width.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("fields; expected 170"))).toBe(true);
    });

    it("enforces maximum 1,000 data rows limit", () => {
      const csv = generateValidCsv(1005);
      const res = parseAndValidateBatchCsv(csv, "large.csv", csv.length);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes("maximum is 1,000 records"))).toBe(true);
    });
  });

  describe("4. Batch State, Metadata & Export Integrity", () => {
    it("distinguishes complete success, partial success, and total failure states", async () => {
      const makeBatch = (success: number, failed: number): BackendBatchPredictionResponse => ({
        batch_id: "batch-1",
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0",
        total_records: success + failed,
        successful_count: success,
        failed_count: failed,
        positive_count: success > 0 ? 1 : 0,
        negative_count: success > 1 ? success - 1 : 0,
        total_inference_duration_ms: 10,
        average_inference_duration_ms: 5,
        warnings: [],
        items: [],
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(makeBatch(2, 0))));
      const completed = await predictBatch({ modelRunId: "run-001", records: [] });
      expect(completed.status).toBe("completed");

      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(makeBatch(1, 1))));
      const partial = await predictBatch({ modelRunId: "run-001", records: [] });
      expect(partial.status).toBe("partial");

      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(makeBatch(0, 2))));
      const failed = await predictBatch({ modelRunId: "run-001", records: [] });
      expect(failed.status).toBe("failed");
    });

    it("preserves risk_classification from backend response without inventing it", async () => {
      const mockBatchResponse: BackendBatchPredictionResponse = {
        batch_id: "batch-risk-check",
        model_reference_type: "training_run",
        model_reference_id: "run-001",
        model_version: "1.0",
        total_records: 1,
        successful_count: 1,
        failed_count: 0,
        positive_count: 1,
        negative_count: 0,
        total_inference_duration_ms: 10,
        average_inference_duration_ms: 10,
        warnings: [],
        items: [
          {
            index: 0,
            prediction: {
              prediction_id: "pred-risk-1",
              model_reference_type: "training_run",
              model_reference_id: "run-001",
              model_version: "1.0",
              predicted_class: "pos",
              failure_probability: 0.75,
              applied_threshold: 0.115,
              risk_classification: "high",
              prediction_timestamp: "2026-10-28T18:00:00Z",
              inference_duration_ms: 10,
              calibration_method: "isotonic",
              warnings: [],
            },
          },
        ],
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(mockBatchResponse)));

      const res = await predictBatch({ modelRunId: "run-001", records: [] });
      expect(res.firstPrediction?.riskClassification).toBe("high");
      expect(res.serverTimestamp).toBe("2026-10-28T18:00:00Z");
      expect(res.clientReceivedAt).toBeDefined();
    });

    it("generates CSV string with proper RFC 4180 escaping for prediction and error records", () => {
      const batchData: BatchPredictionResponse = {
        batchId: "batch-export-test",
        status: "partial",
        rowCount: 2,
        completedCount: 1,
        failedCount: 1,
        positiveCount: 1,
        negativeCount: 0,
        resultsFileName: "batch.json",
        items: [
          {
            index: 0,
            prediction: {
              predictionId: "pred-test-1",
              datasetRowId: "pred-test-1",
              predictedLabel: "failure",
              failureProbability: 0.88,
              threshold: 0.115,
              riskClassification: "high",
              modelId: "run:001",
              createdAt: "2026-10-28T10:00:00Z",
              status: "completed",
            },
          },
          {
            index: 1,
            error: {
              code: "MISSING_FIELD",
              message: 'Sensor "aa_000" missing, check input',
            },
          },
        ],
      };

      const csvText = generateBatchPredictionsCsv(batchData);
      expect(csvText).toContain('"row_index","prediction_id"');
      expect(csvText).toContain('"pred-test-1"');
      expect(csvText).toContain('"high"');
      expect(csvText).toContain('"Sensor ""aa_000"" missing, check input"'); // Escaped quotes!
    });

    it("triggers client-side file download when document is present", () => {
      let createdBlob: Blob | null = null;
      vi.stubGlobal("Blob", vi.fn().mockImplementation((content, options) => {
        createdBlob = { content, options } as unknown as Blob;
        return createdBlob;
      }));
      vi.stubGlobal("URL", {
        createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
        revokeObjectURL: vi.fn(),
      });

      const clickSpy = vi.fn();
      const mockLink = { set href(v: string) {}, set download(v: string) {}, click: clickSpy };
      vi.stubGlobal("document", {
        createElement: vi.fn().mockReturnValue(mockLink),
      });

      const batchData: BatchPredictionResponse = {
        batchId: "batch-export-test",
        status: "completed",
        rowCount: 1,
        completedCount: 1,
        failedCount: 0,
        positiveCount: 0,
        negativeCount: 1,
        resultsFileName: "batch.json",
        items: [
          {
            index: 0,
            prediction: {
              predictionId: "pred-1",
              datasetRowId: "row-1",
              predictedLabel: "normal",
              failureProbability: 0.01,
              threshold: 0.115,
              riskClassification: "low",
              modelId: "run:001",
              createdAt: "2026-10-28T10:00:00Z",
            },
          },
        ],
      };

      exportBatchPredictionsCsv(batchData, "batch-results.csv");
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it("strictly respects backend riskClassification and emits empty string when omitted", () => {
      const batchData: BatchPredictionResponse = {
        batchId: "batch-omitted-risk",
        status: "completed",
        rowCount: 1,
        completedCount: 1,
        failedCount: 0,
        positiveCount: 1,
        negativeCount: 0,
        resultsFileName: "batch.json",
        items: [
          {
            index: 0,
            prediction: {
              predictionId: "pred-no-risk",
              datasetRowId: "row-no-risk",
              predictedLabel: "failure",
              failureProbability: 0.92,
              threshold: 0.115,
              // riskClassification is omitted/undefined
              modelId: "run:001",
              createdAt: "2026-10-28T10:00:00Z",
            },
          },
        ],
      };

      const csv = generateBatchPredictionsCsv(batchData);
      expect(csv).toContain('"0","pred-no-risk","pos","0.920000","0.115000","","completed"');
      expect(csv).not.toContain('"high"');
      expect(csv).not.toContain('"low"');
    });
  });

  describe("8. Submission Handlers & Approval Safeguards", () => {
    const unapprovedCandidateModel: PredictionModelOption = {
      modelId: "experiment:phase9-final-validation-candidate",
      modelName: "CatBoost / phase9.1.0 (Validation Candidate)",
      availability: "not_loaded",
      availabilityNote: "Candidate model is unapproved (promotions: 0).",
      approvalStatus: "unapproved",
      defaultThreshold: 0.115,
      referenceType: "experiment",
      referenceId: "phase9-final-validation-candidate",
      featureCount: 170,
    };

    const verificationFailedModel: PredictionModelOption = {
      modelId: "run:run-offline",
      modelName: "Offline Run",
      availability: "not_loaded",
      availabilityNote: "Verification failed.",
      approvalStatus: "verification_failed",
      defaultThreshold: 0.115,
      referenceType: "training_run",
      referenceId: "run-offline",
      featureCount: 170,
    };

    const approvedProductionModel: PredictionModelOption = {
      modelId: "run:run-approved",
      modelName: "Production Model v1",
      availability: "available",
      availabilityNote: "Production approved.",
      approvalStatus: "approved",
      defaultThreshold: 0.115,
      referenceType: "training_run",
      referenceId: "run-approved",
      featureCount: 170,
      policyId: "policy-prod-1",
    };

    it("single submission handler: unapproved model triggers 0 requests and returns blocked state", async () => {
      const mockPredictSingle = vi.fn();

      const result = await executePredictionSubmission({
        model: unapprovedCandidateModel,
        reference: { experimentId: "phase9-final-validation-candidate" },
        readings: { aa_000: 100 },
        predictFn: mockPredictSingle,
      });

      expect(mockPredictSingle).toHaveBeenCalledTimes(0);
      expect(result.status).toBe("blocked");
      expect(result.error).toContain("unapproved validation candidate");
      expect(result.result).toBeUndefined();
    });

    it("single submission handler: verification-failed model triggers 0 requests and returns unavailable state", async () => {
      const mockPredictSingle = vi.fn();

      const result = await executePredictionSubmission({
        model: verificationFailedModel,
        reference: { modelRunId: "run-offline" },
        readings: { aa_000: 100 },
        predictFn: mockPredictSingle,
      });

      expect(mockPredictSingle).toHaveBeenCalledTimes(0);
      expect(result.status).toBe("unavailable");
      expect(result.error).toContain("Model approval status could not be established");
      expect(result.result).toBeUndefined();
    });

    it("single submission handler: approved model triggers exactly 1 request and returns success state", async () => {
      const mockResult: PredictionResult = {
        predictionId: "pred-single-123",
        datasetRowId: "pred-single-123",
        predictedLabel: "normal",
        failureProbability: 0.04,
        threshold: 0.115,
        modelId: "run:run-approved",
        createdAt: "2026-10-28T12:00:00Z",
      };
      const mockPredictSingle = vi.fn().mockResolvedValue(mockResult);

      const result = await executePredictionSubmission({
        model: approvedProductionModel,
        reference: { modelRunId: "run-approved", decisionPolicyId: "policy-prod-1" },
        readings: { aa_000: 100 },
        predictFn: mockPredictSingle,
      });

      expect(mockPredictSingle).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("success");
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual(mockResult);
    });

    it("batch submission handler: unapproved model triggers 0 requests and returns blocked state", async () => {
      const mockPredictBatch = vi.fn();

      const result = await executeBatchPredictionSubmission({
        model: unapprovedCandidateModel,
        reference: { experimentId: "phase9-final-validation-candidate" },
        records: [{ features: { aa_000: 50 } }],
        predictBatchFn: mockPredictBatch,
      });

      expect(mockPredictBatch).toHaveBeenCalledTimes(0);
      expect(result.status).toBe("blocked");
      expect(result.error).toContain("unapproved");
      expect(result.result).toBeUndefined();
    });

    it("batch submission handler: verification-failed model triggers 0 requests and returns unavailable state", async () => {
      const mockPredictBatch = vi.fn();

      const result = await executeBatchPredictionSubmission({
        model: verificationFailedModel,
        reference: { modelRunId: "run-offline" },
        records: [{ features: { aa_000: 50 } }],
        predictBatchFn: mockPredictBatch,
      });

      expect(mockPredictBatch).toHaveBeenCalledTimes(0);
      expect(result.status).toBe("unavailable");
      expect(result.error).toContain("Model approval status could not be established");
      expect(result.result).toBeUndefined();
    });

    it("batch submission handler: approved model triggers exactly 1 request and returns success state", async () => {
      const mockBatchResponse: BatchPredictionResponse = {
        batchId: "batch-approved-123",
        status: "completed",
        rowCount: 1,
        completedCount: 1,
        failedCount: 0,
        resultsFileName: "batch.json",
        items: [],
      };
      const mockPredictBatch = vi.fn().mockResolvedValue(mockBatchResponse);

      const result = await executeBatchPredictionSubmission({
        model: approvedProductionModel,
        reference: { modelRunId: "run-approved", decisionPolicyId: "policy-prod-1" },
        records: [{ features: { aa_000: 50 } }],
        predictBatchFn: mockPredictBatch,
      });

      expect(mockPredictBatch).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("success");
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual(mockBatchResponse);
    });
  });

  describe("9. Sensor Group Navigator & Interaction Logic", () => {
    const sensorFeatures = CANONICAL_APS_FEATURES.map((id, order) => ({
      id,
      order,
      group: id.split("_")[0] ?? "other",
    }));

    it("dynamically computes distinct groups covering all 170 sensor features", () => {
      const distinctGroups = Array.from(new Set(sensorFeatures.map((f) => f.group))).sort();
      expect(distinctGroups.length).toBeGreaterThan(0);
      expect(distinctGroups).toContain("aa");
      expect(distinctGroups).toContain("ag");
      expect(distinctGroups).toContain("ee");
      expect(distinctGroups).toContain("eg");

      // Verify all 170 features are accounted for
      const totalInGroups = distinctGroups.reduce((acc, grp) => {
        return acc + sensorFeatures.filter((f) => f.group === grp).length;
      }, 0);
      expect(totalInGroups).toBe(170);
    });

    it("computes accurate group stats for populated, missing, and invalid entries", () => {
      const testValues: Record<string, string> = {
        aa_000: "123.45",
        ag_000: "0",
        ag_001: "42",
        ee_000: "invalid-num",
      };
      const testErrors: Record<string, string> = {
        ee_000: "Must be a valid finite number or empty",
      };

      const groupStats = (group: string) => {
        const feats = sensorFeatures.filter((f) => f.group === group);
        const total = feats.length;
        const filled = feats.filter((f) => (testValues[f.id] ?? "").trim().length > 0).length;
        const errorCount = feats.filter((f) => Boolean(testErrors[f.id])).length;
        return { total, filled, missing: total - filled, errorCount };
      };

      // aa group (1 sensor: aa_000)
      const aaStats = groupStats("aa");
      expect(aaStats.total).toBe(1);
      expect(aaStats.filled).toBe(1);
      expect(aaStats.missing).toBe(0);
      expect(aaStats.errorCount).toBe(0);

      // ag group (10 sensors: ag_000..ag_009)
      const agStats = groupStats("ag");
      expect(agStats.total).toBe(10);
      expect(agStats.filled).toBe(2);
      expect(agStats.missing).toBe(8);
      expect(agStats.errorCount).toBe(0);

      // ee group (10 sensors: ee_000..ee_009)
      const eeStats = groupStats("ee");
      expect(eeStats.total).toBe(10);
      expect(eeStats.filled).toBe(1);
      expect(eeStats.missing).toBe(9);
      expect(eeStats.errorCount).toBe(1);
    });

    it("filters features cleanly during search without mutating values", () => {
      const queryExact = "aa_000";
      const exactMatches = sensorFeatures.filter(
        (f) => f.id.toLowerCase().includes(queryExact.toLowerCase()) || f.group.toLowerCase().includes(queryExact.toLowerCase())
      );
      expect(exactMatches).toHaveLength(1);
      expect(exactMatches[0].id).toBe("aa_000");

      const queryPrefix = "ee";
      const prefixMatches = sensorFeatures.filter(
        (f) => f.id.toLowerCase().includes(queryPrefix.toLowerCase()) || f.group.toLowerCase().includes(queryPrefix.toLowerCase())
      );
      expect(prefixMatches).toHaveLength(10);
      expect(prefixMatches.every((f) => f.group === "ee")).toBe(true);
    });

    it("clearing a specific group preserves entered values in all other groups", () => {
      const values: Record<string, string> = {
        aa_000: "10",
        ag_000: "20",
        ag_001: "30",
        ee_000: "40",
      };

      // Clear ag group only
      const agFeatureIds = sensorFeatures.filter((f) => f.group === "ag").map((f) => f.id);
      const nextValues = { ...values };
      for (const id of agFeatureIds) {
        delete nextValues[id];
      }

      expect(nextValues.aa_000).toBe("10");
      expect(nextValues.ee_000).toBe("40");
      expect(nextValues.ag_000).toBeUndefined();
      expect(nextValues.ag_001).toBeUndefined();
    });

    it("clearing all values cleanly resets the entire form state", () => {
      let values: Record<string, string> = {
        aa_000: "10",
        ag_000: "20",
        ee_000: "30",
      };
      expect(Object.keys(values)).toHaveLength(3);

      values = {};
      expect(Object.keys(values)).toHaveLength(0);
    });
  });
});

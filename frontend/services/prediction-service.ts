import { apiDownload, apiFetch } from "@/services/api-client";
import type {
  BackendBatchPredictionResponse,
  BackendFeatureSchemaResponse,
  BackendPolicyListResponse,
  BackendPredictionHistoryResponse,
  BackendPredictionModelListResponse,
  BackendPredictionResponse,
  BackendReferenceType,
  BackendRegistryListResponse,
} from "@/services/backend-contracts";
import type {
  BatchPredictionResponse,
  BatchUploadSummary,
  FeatureContribution,
  PredictionModelOption,
  PredictionRequest,
  PredictionResult,
  SensorFeatureDefinition,
} from "@/types";

export const CANONICAL_APS_FEATURES: readonly string[] = [
  "aa_000", "ab_000", "ac_000", "ad_000", "ae_000", "af_000", "ag_000", "ag_001", "ag_002", "ag_003",
  "ag_004", "ag_005", "ag_006", "ag_007", "ag_008", "ag_009", "ah_000", "ai_000", "aj_000", "ak_000",
  "al_000", "am_0",   "an_000", "ao_000", "ap_000", "aq_000", "ar_000", "as_000", "at_000", "au_000",
  "av_000", "ax_000", "ay_000", "ay_001", "ay_002", "ay_003", "ay_004", "ay_005", "ay_006", "ay_007",
  "ay_008", "ay_009", "az_000", "az_001", "az_002", "az_003", "az_004", "az_005", "az_006", "az_007",
  "az_008", "az_009", "ba_000", "ba_001", "ba_002", "ba_003", "ba_004", "ba_005", "ba_006", "ba_007",
  "ba_008", "ba_009", "bb_000", "bc_000", "bd_000", "be_000", "bf_000", "bg_000", "bh_000", "bi_000",
  "bj_000", "bk_000", "bl_000", "bm_000", "bn_000", "bo_000", "bp_000", "bq_000", "br_000", "bs_000",
  "bt_000", "bu_000", "bv_000", "bx_000", "by_000", "bz_000", "ca_000", "cb_000", "cc_000", "cd_000",
  "ce_000", "cf_000", "cg_000", "ch_000", "ci_000", "cj_000", "ck_000", "cl_000", "cm_000", "cn_000",
  "cn_001", "cn_002", "cn_003", "cn_004", "cn_005", "cn_006", "cn_007", "cn_008", "cn_009", "co_000",
  "cp_000", "cq_000", "cr_000", "cs_000", "cs_001", "cs_002", "cs_003", "cs_004", "cs_005", "cs_006",
  "cs_007", "cs_008", "cs_009", "ct_000", "cu_000", "cv_000", "cx_000", "cy_000", "cz_000", "da_000",
  "db_000", "dc_000", "dd_000", "de_000", "df_000", "dg_000", "dh_000", "di_000", "dj_000", "dk_000",
  "dl_000", "dm_000", "dn_000", "do_000", "dp_000", "dq_000", "dr_000", "ds_000", "dt_000", "du_000",
  "dv_000", "dx_000", "dy_000", "dz_000", "ea_000", "eb_000", "ec_00",  "ed_000", "ee_000", "ee_001",
  "ee_002", "ee_003", "ee_004", "ee_005", "ee_006", "ee_007", "ee_008", "ee_009", "ef_000", "eg_000"
];

export interface PredictionReference {
  modelRunId?: string;
  experimentId?: string;
  decisionPolicyId?: string;
}

export interface BackendPredictionRequest extends PredictionReference {
  features: Record<string, number | null>;
  include_explanation?: boolean;
}

export interface BackendBatchRequest extends PredictionReference {
  records: Array<{ features: Record<string, number | null> }>;
  include_explanation?: boolean;
}

export async function fetchPredictionModels(): Promise<PredictionModelOption[]> {
  try {
    const [models, policies, registry, promotions] = await Promise.all([
      apiFetch<BackendPredictionModelListResponse>("/predictions/models?page=1&page_size=100").catch(() => ({ items: [], total: 0, page: 1, page_size: 100 })),
      apiFetch<BackendPolicyListResponse>("/predictions/policies?page=1&page_size=100").catch(() => ({ items: [], total: 0, page: 1, page_size: 100 })),
      apiFetch<BackendRegistryListResponse>("/models/registry?page=1&page_size=100").catch(() => ({ items: [], total: 0, page: 1, page_size: 100 })),
      apiFetch<{ items: Array<{ promotion_id: string; model_reference_type: BackendReferenceType; model_reference_id: string; decision_policy_id: string; status: string }> }>("/models/promotions?page=1&page_size=100").catch(() => ({ items: [] })),
    ]);

    const activePromotion = promotions.items.find((promotion) => promotion.status === "active");
    const mapped: PredictionModelOption[] = models.items.map((model) => {
      const registered = registry.items.find(
        (item) => item.model_reference_type === model.model_reference_type && item.model_reference_id === model.model_reference_id
      );
      const policy = policies.items.find(
        (item) => item.model_reference_type === model.model_reference_type && item.model_reference_id === model.model_reference_id && item.status === "active"
      );
      const isApproved =
        registered?.lifecycle_status === "approved" &&
        activePromotion?.model_reference_type === model.model_reference_type &&
        activePromotion.model_reference_id === model.model_reference_id &&
        activePromotion.decision_policy_id === policy?.policy_id;

      return {
        modelId: `${model.model_reference_type}:${model.model_reference_id}`,
        modelName: `${model.model_name} / ${model.model_version}`,
        availability: isApproved ? "available" : "not_loaded",
        availabilityNote: isApproved
          ? "Approved model and active decision policy are available."
          : `Inference unavailable until an approved model/policy pair is registered. Current lifecycle: ${registered?.lifecycle_status ?? model.status}.`,
        defaultThreshold: model.default_threshold,
        referenceType: model.model_reference_type,
        referenceId: model.model_reference_id,
        featureCount: model.feature_count,
        policyId: isApproved ? policy?.policy_id : undefined,
      };
    });

    const candidateId = "experiment:phase9-final-validation-candidate";
    if (!mapped.some((item) => item.modelId === candidateId)) {
      mapped.push({
        modelId: candidateId,
        modelName: "CatBoost / phase9.1.0 (Validation Candidate)",
        availability: "not_loaded",
        availabilityNote: "Candidate model is unapproved (promotions: 0). Production promotion required for live inference.",
        defaultThreshold: 0.115,
        referenceType: "experiment",
        referenceId: "phase9-final-validation-candidate",
        featureCount: 170,
        policyId: undefined,
      });
    }

    return mapped;
  } catch {
    return [
      {
        modelId: "experiment:phase9-final-validation-candidate",
        modelName: "CatBoost / phase9.1.0 (Validation Candidate)",
        availability: "not_loaded",
        availabilityNote: "Candidate model is unapproved (promotions: 0). Production promotion required for live inference.",
        defaultThreshold: 0.115,
        referenceType: "experiment",
        referenceId: "phase9-final-validation-candidate",
        featureCount: 170,
        policyId: undefined,
      },
    ];
  }
}

export async function fetchFeatureSchema(reference?: PredictionReference): Promise<SensorFeatureDefinition[]> {
  if (reference?.modelRunId || reference?.experimentId) {
    try {
      const { referenceType, referenceId } = referenceParts(reference);
      const response = await apiFetch<BackendFeatureSchemaResponse>(
        `/predictions/models/${referenceType}/${encodeURIComponent(referenceId)}/features`
      );
      if (response?.feature_names && response.feature_names.length === 170) {
        return response.feature_names.map((id, order) => ({
          id,
          order,
          group: id.split("_")[0] ?? "other",
        }));
      }
    } catch {
      // Endpoint failed or model is unapproved candidate; fallback to authoritative canonical schema
    }
  }

  return CANONICAL_APS_FEATURES.map((id, order) => ({
    id,
    order,
    group: id.split("_")[0] ?? "other",
  }));
}

export function parseNumericSensorValue(raw: string): { valid: boolean; value: number | null; error?: string } {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "na" || trimmed.toLowerCase() === "null") {
    return { valid: true, value: null };
  }
  if (/^(nan|infinity|-infinity|\+infinity)$/i.test(trimmed)) {
    return { valid: false, value: null, error: "NaN and Infinity values are not accepted" };
  }
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed) && !/^-?\.\d+([eE][+-]?\d+)?$/.test(trimmed)) {
    return { valid: false, value: null, error: "Numeric value expected" };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) {
    return { valid: false, value: null, error: "Finite numeric value expected" };
  }
  return { valid: true, value: num };
}

export function validateSensorPayload(
  readings: Record<string, number | null>,
  expectedFeatureIds: readonly string[] = CANONICAL_APS_FEATURES
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  for (const id of expectedFeatureIds) {
    const val = readings[id];
    if (val !== null && val !== undefined) {
      if (typeof val !== "number" || !Number.isFinite(val)) {
        errors[id] = "Must be a finite numeric value or null";
      }
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export interface BatchValidationResult {
  valid: boolean;
  errors: string[];
  summary?: BatchUploadSummary;
  records?: Array<{ features: Record<string, number | null> }>;
  previewHeaders: string[];
  previewRows: Record<string, string>[];
}

export function parseAndValidateBatchCsv(
  csvText: string,
  fileName: string,
  fileSizeBytes: number,
  expectedFeatureIds: readonly string[] = CANONICAL_APS_FEATURES
): BatchValidationResult {
  const errors: string[] = [];
  const lines = csvText.trim().split(/\r?\n/).filter(Boolean);

  if (lines.length === 0) {
    return {
      valid: false,
      errors: ["CSV file contains no data or headers."],
      previewHeaders: [],
      previewRows: [],
    };
  }

  const rawHeader = lines[0] ?? "";
  const headers = rawHeader.split(",").map((h) => h.trim());

  if (headers.length === 0 || headers.every((h) => !h)) {
    return {
      valid: false,
      errors: ["CSV header row is empty or malformed."],
      previewHeaders: [],
      previewRows: [],
    };
  }

  const headerCounts = new Map<string, number>();
  const duplicateHeaders: string[] = [];
  for (const h of headers) {
    const count = (headerCounts.get(h) ?? 0) + 1;
    headerCounts.set(h, count);
    if (count === 2) duplicateHeaders.push(h);
  }
  if (duplicateHeaders.length > 0) {
    errors.push(`Duplicate column header(s) detected: ${duplicateHeaders.join(", ")}.`);
  }

  const missingColumns = expectedFeatureIds.filter((id) => !headerCounts.has(id));
  if (missingColumns.length > 0) {
    const sample = missingColumns.slice(0, 5).join(", ");
    const more = missingColumns.length > 5 ? ` and ${missingColumns.length - 5} more` : "";
    errors.push(`Missing ${missingColumns.length} required sensor column(s): ${sample}${more}.`);
  }

  const unexpectedColumns = headers.filter((h) => !expectedFeatureIds.includes(h));
  if (unexpectedColumns.length > 0) {
    const sample = unexpectedColumns.slice(0, 5).join(", ");
    const more = unexpectedColumns.length > 5 ? ` and ${unexpectedColumns.length - 5} more` : "";
    errors.push(`Unexpected column(s) detected: ${sample}${more}. The backend schema forbids unexpected columns.`);
  }

  const dataLines = lines.slice(1);
  if (dataLines.length === 0) {
    errors.push("CSV file contains a header but no data rows.");
  }

  if (dataLines.length > 1000) {
    errors.push(`File contains ${dataLines.length} data rows. The backend batch inference maximum is 1,000 records.`);
  }

  const previewRows: Record<string, string>[] = [];
  const records: Array<{ features: Record<string, number | null> }> = [];
  let missingValueCount = 0;
  let cellErrorCount = 0;

  for (let rIdx = 0; rIdx < dataLines.length; rIdx++) {
    const line = dataLines[rIdx]!;
    const cells = line.split(",").map((c) => c.trim());

    if (cells.length !== headers.length) {
      if (cellErrorCount < 5) {
        errors.push(`Row ${rIdx + 1} has ${cells.length} fields; expected ${headers.length}.`);
      }
      cellErrorCount++;
      continue;
    }

    const rowObj: Record<string, string> = {};
    for (let cIdx = 0; cIdx < headers.length; cIdx++) {
      rowObj[headers[cIdx]!] = cells[cIdx] ?? "";
    }
    if (rIdx < 5) {
      previewRows.push(rowObj);
    }

    if (errors.length === 0 || errors.every((e) => !e.startsWith("Missing") && !e.startsWith("Unexpected") && !e.startsWith("Duplicate"))) {
      const recordFeatures: Record<string, number | null> = {};
      for (const featureId of expectedFeatureIds) {
        const cellValue = rowObj[featureId] ?? "";
        const parsed = parseNumericSensorValue(cellValue);
        if (!parsed.valid) {
          if (cellErrorCount < 5) {
            errors.push(`Row ${rIdx + 1}, column '${featureId}': invalid numeric value '${cellValue}'.`);
          }
          cellErrorCount++;
        } else {
          if (parsed.value === null) {
            missingValueCount++;
          }
          recordFeatures[featureId] = parsed.value;
        }
      }
      records.push({ features: recordFeatures });
    }
  }

  if (cellErrorCount > 5) {
    errors.push(`... and ${cellErrorCount - 5} additional row validation errors.`);
  }

  const isValid = errors.length === 0;
  const summary: BatchUploadSummary = {
    fileName,
    fileSizeBytes,
    rowCount: dataLines.length,
    featureCount: headers.filter((h) => expectedFeatureIds.includes(h)).length,
    missingFeatureCount: missingColumns.length,
    missingValueCount,
    status: isValid ? "ready" : "error",
    errorMessage: isValid ? undefined : errors[0],
  };

  return {
    valid: isValid,
    errors,
    summary,
    records: isValid ? records : undefined,
    previewHeaders: headers.slice(0, 6),
    previewRows,
  };
}

export function predictSingle(request: PredictionRequest, reference: PredictionReference): Promise<PredictionResult> {
  return apiFetch<BackendPredictionResponse>("/predictions", {
    method: "POST",
    body: JSON.stringify({ ...referencePayload(reference), features: request.readings, include_explanation: true }),
  }).then(mapPrediction);
}

export function predictBatch(request: BackendBatchRequest): Promise<BatchPredictionResponse> {
  return apiFetch<BackendBatchPredictionResponse>("/predictions/batch", {
    method: "POST",
    body: JSON.stringify({ ...referencePayload(request), records: request.records, include_explanation: true }),
  }).then(mapBatchPrediction);
}

export function fetchPredictionHistory(): Promise<PredictionResult[]> {
  return apiFetch<BackendPredictionHistoryResponse>("/predictions?page=1&page_size=100").then((response) =>
    response.items.map(mapPrediction)
  );
}

export function fetchPrediction(predictionId: string): Promise<PredictionResult> {
  return apiFetch<BackendPredictionResponse>(`/predictions/${encodeURIComponent(predictionId)}`).then(mapPrediction);
}

export function downloadPredictionHistoryCsv(): Promise<void> {
  return apiDownload("/exports/predictions.csv?page_size=5000", "aps-prediction-history.csv");
}

export function exportBatchPredictionsCsv(batch: BatchPredictionResponse, originalFileName = "batch"): void {
  const header = "row_index,prediction_id,predicted_class,failure_probability,applied_threshold,risk_classification,status,error_code,error_message";
  const rows: string[] = [];

  if (batch.items && batch.items.length > 0) {
    for (const item of batch.items) {
      if (item.prediction) {
        const pred = item.prediction;
        rows.push(
          [
            item.index,
            pred.predictionId,
            pred.predictedLabel === "failure" ? "pos" : "neg",
            pred.failureProbability.toFixed(6),
            pred.threshold.toFixed(6),
            pred.predictedLabel === "failure" ? "high" : "low",
            pred.status,
            "",
            "",
          ]
            .map((val) => `"${String(val).replaceAll('"', '""')}"`)
            .join(",")
        );
      } else if (item.error) {
        rows.push(
          [
            item.index,
            "",
            "",
            "",
            "",
            "",
            "failed",
            item.error.code,
            item.error.message,
          ]
            .map((val) => `"${String(val).replaceAll('"', '""')}"`)
            .join(",")
        );
      }
    }
  }

  const csvContent = [header, ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const baseName = originalFileName.replace(/\.csv$/i, "");
  link.download = `${baseName}-prediction-results.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function referenceParts(reference: PredictionReference): { referenceType: BackendReferenceType; referenceId: string } {
  if (reference.modelRunId) return { referenceType: "training_run", referenceId: reference.modelRunId };
  if (reference.experimentId) return { referenceType: "experiment", referenceId: reference.experimentId };
  throw new Error("A model reference is required for inference.");
}

function referencePayload(reference: PredictionReference): Record<string, string> {
  if (reference.modelRunId) {
    return {
      model_run_id: reference.modelRunId,
      ...(reference.decisionPolicyId ? { decision_policy_id: reference.decisionPolicyId } : {}),
    };
  }
  if (reference.experimentId) {
    return {
      experiment_id: reference.experimentId,
      ...(reference.decisionPolicyId ? { decision_policy_id: reference.decisionPolicyId } : {}),
    };
  }
  throw new Error("A model reference is required for inference.");
}

function mapPrediction(response: BackendPredictionResponse): PredictionResult {
  const featureContributions: FeatureContribution[] =
    response.explanation?.top_features.map((feature) => ({
      featureId: feature.feature_name,
      contribution: feature.importance,
      direction: "increase_risk",
      method: feature.importance_type === "absolute_coefficient" ? "backend_coefficient" : "backend_shap",
    })) ?? [];

  return {
    predictionId: response.prediction_id,
    datasetRowId: response.request_reference ?? response.prediction_id,
    predictedLabel: response.predicted_class === "pos" ? "failure" : "normal",
    failureProbability: response.failure_probability,
    threshold: response.applied_threshold,
    modelId: `${response.model_reference_type}:${response.model_reference_id}`,
    modelName: response.model_version,
    createdAt: response.prediction_timestamp,
    status: "completed",
    source: "single",
    featureContributions,
  };
}

function mapBatchPrediction(response: BackendBatchPredictionResponse): BatchPredictionResponse {
  const mappedItems = response.items.map((item) => ({
    index: item.index,
    prediction: item.prediction ? mapPrediction(item.prediction) : null,
    error: item.error ? { code: item.error.code, message: item.error.message, details: item.error.details } : null,
  }));

  const firstSuccess = mappedItems.find((item) => item.prediction)?.prediction;

  return {
    batchId: response.batch_id,
    status: response.failed_count === 0 ? "completed" : "completed",
    rowCount: response.total_records,
    completedCount: response.successful_count,
    failedCount: response.failed_count,
    positiveCount: response.positive_count,
    negativeCount: response.negative_count,
    totalInferenceDurationMs: response.total_inference_duration_ms,
    averageInferenceDurationMs: response.average_inference_duration_ms,
    resultsFileName: `${response.batch_id}.json`,
    completedAt: new Date().toISOString(),
    warnings: response.warnings,
    firstPrediction: firstSuccess ? { ...firstSuccess, source: "batch", batchRowCount: response.total_records } : undefined,
    items: mappedItems,
  };
}

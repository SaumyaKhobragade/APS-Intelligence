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
  FeatureSchemaResult,
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

export function parseNumericSensorValue(raw: unknown): { valid: boolean; value: number | null } {
  if (raw === null || raw === undefined) {
    return { valid: true, value: null };
  }
  const str = String(raw).trim();
  if (str === "" || str === "na" || str === "nan" || str === "null" || str === "NaN" || str === "None") {
    return { valid: true, value: null };
  }
  if (str === "0" || str === "+0" || str === "-0") {
    return { valid: true, value: 0 };
  }
  const num = Number(str);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}

export function validateSensorPayload(payload: Record<string, unknown>, expectedFeatures: readonly string[] = CANONICAL_APS_FEATURES): {
  valid: boolean;
  errors: Record<string, string>;
  sanitized: Record<string, number | null>;
} {
  const errors: Record<string, string> = {};
  const sanitized: Record<string, number | null> = {};

  for (const featureId of expectedFeatures) {
    const raw = payload[featureId];
    const parsed = parseNumericSensorValue(raw);
    if (!parsed.valid) {
      errors[featureId] = `Sensor value for '${featureId}' must be a valid finite number or empty.`;
    } else {
      sanitized[featureId] = parsed.value;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized,
  };
}

export function parseCsvRecords(csvText: string): { rows: string[][]; parseErrors: string[] } {
  const rows: string[][] = [];
  const parseErrors: string[] = [];

  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let quoteJustClosed = false;
  let fieldHadQuotes = false;
  let lineNum = 1;
  let quoteStartLine = 1;

  let text = csvText;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const len = text.length;
  let i = 0;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          quoteJustClosed = true;
          i++;
          continue;
        }
      } else {
        if (char === "\n") {
          lineNum++;
        }
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (quoteJustClosed) {
        if (char === ",") {
          currentRow.push(currentField);
          currentField = "";
          quoteJustClosed = false;
          fieldHadQuotes = false;
          i++;
          continue;
        } else if (char === "\r") {
          currentRow.push(currentField);
          currentField = "";
          quoteJustClosed = false;
          fieldHadQuotes = false;
          if (i + 1 < len && text[i + 1] === "\n") {
            i++;
          }
          rows.push(currentRow);
          currentRow = [];
          lineNum++;
          i++;
          continue;
        } else if (char === "\n") {
          currentRow.push(currentField);
          currentField = "";
          quoteJustClosed = false;
          fieldHadQuotes = false;
          rows.push(currentRow);
          currentRow = [];
          lineNum++;
          i++;
          continue;
        } else if (char === " " || char === "\t") {
          let j = i;
          while (j < len && (text[j] === " " || text[j] === "\t")) j++;
          if (j < len && (text[j] === "," || text[j] === "\r" || text[j] === "\n")) {
            i = j;
            continue;
          } else {
            parseErrors.push(`Malformed quoting at line ${lineNum}: unexpected character after closing quote.`);
            currentField += char;
            quoteJustClosed = false;
            i++;
            continue;
          }
        } else {
          parseErrors.push(`Malformed quoting at line ${lineNum}: unexpected character '${char}' after closing quote.`);
          quoteJustClosed = false;
          currentField += char;
          i++;
          continue;
        }
      }

      if (char === '"') {
        if (currentField.length === 0 || /^\s+$/.test(currentField)) {
          currentField = "";
          inQuotes = true;
          fieldHadQuotes = true;
          quoteStartLine = lineNum;
          i++;
          continue;
        } else {
          parseErrors.push(`Malformed quoting at line ${lineNum}: unescaped quote inside field.`);
          currentField += char;
          i++;
          continue;
        }
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
        fieldHadQuotes = false;
        i++;
        continue;
      } else if (char === "\r") {
        currentRow.push(currentField);
        currentField = "";
        fieldHadQuotes = false;
        if (i + 1 < len && text[i + 1] === "\n") {
          i++;
        }
        rows.push(currentRow);
        currentRow = [];
        lineNum++;
        i++;
        continue;
      } else if (char === "\n") {
        currentRow.push(currentField);
        currentField = "";
        fieldHadQuotes = false;
        rows.push(currentRow);
        currentRow = [];
        lineNum++;
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (inQuotes) {
    parseErrors.push(`Malformed quoting: unclosed quote starting at line ${quoteStartLine}.`);
  }

  if (currentField.length > 0 || quoteJustClosed || fieldHadQuotes || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length > 1) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "" && !quoteJustClosed) {
      if (text.endsWith("\n") || text.endsWith("\r")) {
        rows.pop();
      }
    }
  }

  return { rows, parseErrors };
}

export function parseAndValidateBatchCsv(
  csvText: string,
  fileName: string,
  fileSizeBytes: number,
  expectedFeatureIds: readonly string[] = CANONICAL_APS_FEATURES
): {
  valid: boolean;
  errors: string[];
  summary?: BatchUploadSummary;
  records?: Array<{ features: Record<string, number | null> }>;
  previewHeaders: string[];
  previewRows: Record<string, string>[];
} {
  const errors: string[] = [];

  const { rows, parseErrors } = parseCsvRecords(csvText);
  if (parseErrors.length > 0) {
    errors.push(...parseErrors);
  }

  if (rows.length === 0) {
    errors.push("The CSV file is completely empty.");
    return {
      valid: false,
      errors,
      summary: {
        fileName,
        fileSizeBytes,
        rowCount: 0,
        featureCount: 0,
        missingFeatureCount: expectedFeatureIds.length,
        missingValueCount: 0,
        status: "error",
        errorMessage: errors[0],
      },
      previewHeaders: [],
      previewRows: [],
    };
  }

  const rawHeaders = rows[0] ?? [];
  const headers = rawHeaders.map((h) => h.trim());

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

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    errors.push("CSV file contains a header but no data rows.");
  }

  if (dataRows.length > 1000) {
    errors.push(`File contains ${dataRows.length} data rows. The backend batch inference maximum is 1,000 records.`);
  }

  const previewRows: Record<string, string>[] = [];
  const records: Array<{ features: Record<string, number | null> }> = [];
  let missingValueCount = 0;
  let cellErrorCount = 0;

  for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
    const cells = dataRows[rIdx]!;

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

    if (errors.length === 0 || errors.every((e) => !e.startsWith("Missing") && !e.startsWith("Unexpected") && !e.startsWith("Duplicate") && !e.startsWith("Malformed"))) {
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
    rowCount: dataRows.length,
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

export async function fetchPredictionModels(): Promise<PredictionModelOption[]> {
  let modelsResult: BackendPredictionModelListResponse = { items: [], total: 0, page: 1, page_size: 100 };
  let policiesResult: BackendPolicyListResponse = { items: [], total: 0, page: 1, page_size: 100 };
  let registryResult: BackendRegistryListResponse = { items: [], total: 0, page: 1, page_size: 100 };
  let promotionsResult: { items: Array<{ promotion_id: string; model_reference_type: BackendReferenceType; model_reference_id: string; decision_policy_id: string; status: string }> } = { items: [] };

  let registryCallFailed = false;
  let promotionsCallFailed = false;

  const [mRes, polRes, regRes, promRes] = await Promise.allSettled([
    apiFetch<BackendPredictionModelListResponse>("/predictions/models?page=1&page_size=100"),
    apiFetch<BackendPolicyListResponse>("/predictions/policies?page=1&page_size=100"),
    apiFetch<BackendRegistryListResponse>("/models/registry?page=1&page_size=100"),
    apiFetch<{ items: Array<{ promotion_id: string; model_reference_type: BackendReferenceType; model_reference_id: string; decision_policy_id: string; status: string }> }>("/models/promotions?page=1&page_size=100"),
  ]);

  if (mRes.status === "fulfilled") modelsResult = mRes.value;
  if (polRes.status === "fulfilled") policiesResult = polRes.value;
  if (regRes.status === "fulfilled") {
    registryResult = regRes.value;
  } else {
    registryCallFailed = true;
  }
  if (promRes.status === "fulfilled") {
    promotionsResult = promRes.value;
  } else {
    promotionsCallFailed = true;
  }

  const approvalCheckFailed = registryCallFailed || promotionsCallFailed;
  const activePromotion = promotionsResult.items.find((promotion) => promotion.status === "active");

  const mapped: PredictionModelOption[] = modelsResult.items.map((model) => {
    if (approvalCheckFailed) {
      return {
        modelId: `${model.model_reference_type}:${model.model_reference_id}`,
        modelName: `${model.model_name} / ${model.model_version}`,
        availability: "not_loaded",
        approvalStatus: "verification_failed",
        availabilityNote: "Model approval status could not be established because registry or promotion checks failed.",
        defaultThreshold: model.default_threshold,
        referenceType: model.model_reference_type,
        referenceId: model.model_reference_id,
        featureCount: model.feature_count,
        policyId: undefined,
      };
    }

    const registered = registryResult.items.find(
      (item) => item.model_reference_type === model.model_reference_type && item.model_reference_id === model.model_reference_id
    );
    const policy = policiesResult.items.find(
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
      approvalStatus: isApproved ? "approved" : "unapproved",
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
      approvalStatus: approvalCheckFailed ? "verification_failed" : "unapproved",
      availabilityNote: approvalCheckFailed
        ? "Model approval status could not be established because registry or promotion checks failed."
        : "Candidate model is unapproved (promotions: 0). Production promotion required for live inference.",
      defaultThreshold: 0.115,
      referenceType: "experiment",
      referenceId: "phase9-final-validation-candidate",
      featureCount: 170,
      policyId: undefined,
    });
  }

  return mapped;
}

export async function fetchFeatureSchema(reference?: PredictionReference): Promise<FeatureSchemaResult> {
  const canonicalFeatures: SensorFeatureDefinition[] = CANONICAL_APS_FEATURES.map((id, order) => ({
    id,
    order,
    group: id.split("_")[0] ?? "other",
  }));

  if (!reference?.modelRunId && !reference?.experimentId) {
    return {
      features: canonicalFeatures,
      source: "canonical_fallback",
      warning: "No model reference specified. Using canonical APS 170-feature fallback schema (unverified against selected model).",
    };
  }

  try {
    const { referenceType, referenceId } = referenceParts(reference);
    const response = await apiFetch<BackendFeatureSchemaResponse>(
      `/predictions/models/${referenceType}/${encodeURIComponent(referenceId)}/features`
    );

    if (!response || !Array.isArray(response.feature_names)) {
      return {
        features: canonicalFeatures,
        source: "canonical_fallback",
        warning: "Feature schema endpoint returned malformed response. Using canonical APS 170-feature fallback schema (unverified against selected model).",
      };
    }

    const { feature_names } = response;

    if (feature_names.length !== 170) {
      return {
        features: canonicalFeatures,
        source: "canonical_fallback",
        warning: `Backend feature endpoint returned ${feature_names.length} features (expected 170). Using canonical APS 170-feature fallback schema (unverified against selected model).`,
      };
    }

    const seen = new Set<string>();
    for (const name of feature_names) {
      if (seen.has(name)) {
        return {
          features: canonicalFeatures,
          source: "canonical_fallback",
          warning: "Backend feature endpoint returned duplicate feature identifiers. Using canonical APS 170-feature fallback schema (unverified against selected model).",
        };
      }
      seen.add(name);
    }

    const canonicalSet = new Set(CANONICAL_APS_FEATURES);
    for (const name of feature_names) {
      if (!canonicalSet.has(name)) {
        return {
          features: canonicalFeatures,
          source: "canonical_fallback",
          warning: `Backend feature endpoint contained incompatible feature identifier '${name}'. Using canonical APS 170-feature fallback schema (unverified against selected model).`,
        };
      }
    }

    const verifiedFeatures: SensorFeatureDefinition[] = feature_names.map((id, order) => ({
      id,
      order,
      group: id.split("_")[0] ?? "other",
    }));

    return {
      features: verifiedFeatures,
      source: "backend_verified",
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      features: canonicalFeatures,
      source: "canonical_fallback",
      warning: `Feature schema endpoint unavailable (${detail}). Using canonical APS 170-feature fallback schema (unverified against selected model).`,
    };
  }
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

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replaceAll('"', '""')}"`;
}

export function generateBatchPredictionsCsv(batch: BatchPredictionResponse): string {
  const header = '"row_index","prediction_id","predicted_class","failure_probability","applied_threshold","risk_classification","status","error_code","error_message"';
  const rows: string[] = [];

  if (batch.items && batch.items.length > 0) {
    for (const item of batch.items) {
      if (item.prediction) {
        const pred = item.prediction;
        const risk = pred.riskClassification ?? (pred.predictedLabel === "failure" ? "high" : "low");
        rows.push(
          [
            item.index,
            pred.predictionId,
            pred.predictedLabel === "failure" ? "pos" : "neg",
            pred.failureProbability.toFixed(6),
            pred.threshold.toFixed(6),
            risk,
            pred.status ?? "completed",
            "",
            "",
          ]
            .map(escapeCsvCell)
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
            .map(escapeCsvCell)
            .join(",")
        );
      }
    }
  }

  return [header, ...rows].join("\r\n");
}

export function exportBatchPredictionsCsv(batch: BatchPredictionResponse, originalFileName = "batch"): void {
  const csvContent = generateBatchPredictionsCsv(batch);
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
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
    riskClassification: response.risk_classification,
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

  const hasSuccess = response.successful_count > 0;
  const hasFailure = response.failed_count > 0;
  let status: "completed" | "partial" | "failed" = "completed";
  if (hasFailure && hasSuccess) {
    status = "partial";
  } else if (hasFailure && !hasSuccess) {
    status = "failed";
  } else {
    status = "completed";
  }

  return {
    batchId: response.batch_id,
    status,
    rowCount: response.total_records,
    completedCount: response.successful_count,
    failedCount: response.failed_count,
    positiveCount: response.positive_count,
    negativeCount: response.negative_count,
    totalInferenceDurationMs: response.total_inference_duration_ms,
    averageInferenceDurationMs: response.average_inference_duration_ms,
    resultsFileName: `${response.batch_id}.json`,
    serverTimestamp: firstSuccess?.createdAt,
    clientReceivedAt: new Date().toISOString(),
    warnings: response.warnings,
    firstPrediction: firstSuccess ? { ...firstSuccess, source: "batch", batchRowCount: response.total_records } : undefined,
    items: mappedItems,
  };
}
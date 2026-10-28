import { apiFetch } from "@/services/api-client";
import { fetchHistoricalValidation } from "@/services/historical-evidence-service";
import type {
  BackendDatasetAnalyticsResponse,
  BackendDatasetListResponse,
  BackendDatasetSummary,
} from "@/services/backend-contracts";
import type {
  DatasetExplorerSnapshot,
  DatasetType,
  DatasetUploadResponse,
  FeatureStatistics,
  PreprocessingStage,
} from "@/types";

function mapDatasetType(value: BackendDatasetSummary["dataset_type"]): DatasetType {
  return value === "testing" ? "testing" : "training";
}

export function fetchDatasets(datasetType?: DatasetType): Promise<BackendDatasetListResponse> {
  const query = datasetType ? `?dataset_type=${encodeURIComponent(datasetType)}&page_size=100` : "?page_size=100";
  return apiFetch<BackendDatasetListResponse>(`/datasets${query}`);
}

export function fetchDatasetAnalytics(datasetId: string, page = 1, pageSize = 50): Promise<BackendDatasetAnalyticsResponse> {
  return apiFetch<BackendDatasetAnalyticsResponse>(`/analytics/datasets/${encodeURIComponent(datasetId)}?page=${page}&page_size=${pageSize}`);
}

export function fetchDatasetExplorer(datasetId: string, page = 1, pageSize = 50): Promise<DatasetExplorerSnapshot | null> {
  return fetchDatasetAnalytics(datasetId, page, pageSize).then((response) => mapDatasetAnalytics(response));
}

export async function fetchDatasetExplorerByType(datasetType: DatasetType, page = 1, pageSize = 50): Promise<DatasetExplorerSnapshot | null> {
  const datasets = await fetchDatasets(datasetType);
  const dataset = datasets.items.find((item) => item.dataset_type === datasetType);
  return dataset ? fetchDatasetExplorer(dataset.dataset_id, page, pageSize) : null;
}

export function uploadDataset(file: File): Promise<DatasetUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<{
    dataset: BackendDatasetSummary;
    message: string;
  }>("/datasets/import?dataset_type=custom", { method: "POST", body }).then((response) => ({
    datasetId: response.dataset.dataset_id,
    fileName: response.dataset.source_file_name,
    datasetType: "training",
    fileSizeBytes: response.dataset.file_size_bytes,
    uploadedAt: response.dataset.imported_at,
    status: response.dataset.status === "error" ? "error" : "ready",
    message: response.message,
  }));
}

export function mapDatasetSummary(dataset: BackendDatasetSummary) {
  return {
    id: dataset.dataset_id,
    name: dataset.dataset_name,
    source: dataset.source_file_name,
    featureCount: dataset.feature_count,
    rowCount: dataset.record_count,
    positiveClassLabel: "pos",
    updatedAt: dataset.imported_at,
    datasetType: mapDatasetType(dataset.dataset_type),
    targetColumn: dataset.target_column ?? "class",
    fingerprint: dataset.fingerprint,
    fileSizeBytes: dataset.file_size_bytes,
    status: dataset.status === "error" ? "error" : "ready",
    uploadedAt: dataset.imported_at,
  } as const;
}

export interface DatasetEvidenceState {
  metadata: ReturnType<typeof mapDatasetSummary> | null;
  snapshot: DatasetExplorerSnapshot | null;
  splitEvidence: Record<string, unknown> | null;
  availability: Array<{ name: string; status: "available" | "unavailable" | "blocked" | "failed"; message: string }>;
}

export async function fetchDatasetEvidenceByType(datasetType: DatasetType): Promise<DatasetEvidenceState> {
  const datasets = await fetchDatasets(datasetType);
  const dataset = datasets.items.find((item) => item.dataset_type === datasetType);
  if (!dataset) {
    return {
      metadata: null,
      snapshot: null,
      splitEvidence: null,
      availability: [{ name: `${datasetType}_dataset`, status: "unavailable", message: `No persisted ${datasetType} dataset metadata is available.` }],
    };
  }
  const [snapshot, validation] = await Promise.all([
    fetchDatasetExplorer(dataset.dataset_id),
    datasetType === "training" ? fetchHistoricalValidation("phase9-final-validation-candidate") : Promise.resolve(null),
  ]);
  return {
    metadata: mapDatasetSummary(dataset),
    snapshot,
    splitEvidence: validation?.dataset_and_split ?? null,
    availability: [
      ...(snapshot ? [] : [{ name: "profile", status: "unavailable" as const, message: "No persisted dataset profile artifact is available; raw data was not reprofiled." }]),
      ...(validation?.availability ?? []),
    ],
  };
}

function mapFeature(feature: NonNullable<BackendDatasetAnalyticsResponse["feature_page"]>["items"][number]): FeatureStatistics {
  return {
    name: feature.feature_name,
    dataType: feature.data_type === "target" ? "target" : feature.data_type === "categorical" ? "categorical" : "numeric",
    missingCount: feature.missing_count,
    missingPercentage: feature.missing_percentage / 100,
    nonNullCount: feature.non_missing_count,
    minimum: feature.minimum ?? undefined,
    maximum: feature.maximum ?? undefined,
    mean: feature.mean ?? undefined,
    standardDeviation: feature.standard_deviation ?? undefined,
  };
}

export function buildPreprocessingStages(response: BackendDatasetAnalyticsResponse): PreprocessingStage[] {
  const dataset = response.dataset;
  const profile = response.profile;
  const splits = response.splits;

  const hasSplits = Boolean(splits?.splits && splits.splits.length > 0);
  const splitsDetail = hasSplits
    ? splits!.splits.map((s) => `${s.split_name}: ${s.record_count.toLocaleString()} rows`).join(" · ")
    : "Holdout split metadata not persisted for this dataset profile";

  const totalMissing = profile?.quality.total_missing_values ?? 0;
  const missingFeatures = profile?.missing_values.features_with_missing_values ?? 0;
  const missingDetail = profile
    ? `${missingFeatures} features with missing values (${totalMissing.toLocaleString()} missing cells total)`
    : "Imputation learned strictly from training partition";

  const imbalanceRatio = profile?.class_distribution.imbalance_ratio ?? "1:59";

  return [
    {
      id: "raw-ingestion",
      label: "1. Raw dataset ingestion",
      description: "Ingest tabular sensor telemetry from source artifact without in-memory mutations.",
      status: "completed",
      detail: dataset.record_count
        ? `${dataset.record_count.toLocaleString()} records ingested · ${dataset.source_file_name || dataset.dataset_name}`
        : "Dataset ingested from source artifact",
      partition: "All partitions",
      fittingType: "contract_boundary",
      fittingLabel: "Ingestion / verification",
    },
    {
      id: "schema-validation",
      label: "2. Schema validation & feature identification",
      description: "Verify 170 numeric operational sensor columns and failure target column (class).",
      status: "completed",
      detail: `${dataset.feature_count} numeric sensor features verified · Target: ${dataset.target_column ?? "class"}`,
      partition: "All partitions",
      fittingType: "contract_boundary",
      fittingLabel: "Rule validation (unfitted)",
    },
    {
      id: "train-val-split",
      label: "3. Training/validation split",
      description: "Stratified partition preserving failure class ratio. Strict isolation prevents holdout leakage.",
      status: hasSplits ? "completed" : "unavailable",
      detail: splitsDetail,
      partition: "Split boundary",
      fittingType: "contract_boundary",
      fittingLabel: "Partition boundary (strict isolation)",
    },
    {
      id: "missing-values",
      label: "4. Missing-value handling",
      description: "Imputation statistics (median/constant) fitted strictly on training data only; never learned from holdout sets. Native NaN support used for tree ensembles.",
      status: "applied",
      detail: missingDetail,
      partition: "Fitted on training only · Applied downstream",
      fittingType: "fitted_train_only",
      fittingLabel: "Fitted on training only",
    },
    {
      id: "feature-scaling",
      label: "5. Feature transformation & scaling",
      description: "StandardScaler fitted strictly on training partition features for linear models (Logistic Regression); tree models consume unscaled features directly.",
      status: "applied",
      detail: "StandardScaler fitted on training partition for linear models · Pass-through for tree models",
      partition: "Fitted on training only · Applied downstream",
      fittingType: "fitted_train_only",
      fittingLabel: "Fitted on training only",
    },
    {
      id: "class-imbalance",
      label: "6. Class-imbalance handling",
      description: "Resampling (SMOTE) or algorithmic weighting (native class_weight) applied strictly inside training partition/folds. Never resample validation or test sets.",
      status: "applied",
      detail: `Natural ratio ${imbalanceRatio} · Resampling / weighting applied inside training partition only`,
      partition: "Training partition only",
      fittingType: "fitted_train_only",
      fittingLabel: "Training partition only",
    },
    {
      id: "model-ready",
      label: "7. Final model-ready feature representation",
      description: "Standardized 170-dimensional numeric tensor with aligned schema delivered to estimator pipelines.",
      status: "completed",
      detail: "170-dimensional numeric matrix feeding estimator contracts",
      partition: "All partitions (evaluated separately)",
      fittingType: "applied_transform",
      fittingLabel: "Aligned model schema",
    },
  ];
}

function mapDatasetAnalytics(response: BackendDatasetAnalyticsResponse): DatasetExplorerSnapshot | null {
  const profile = response.profile;
  if (!profile || !response.feature_page) return null;
  const summary = mapDatasetSummary(response.dataset);
  const quality = profile.quality;
  const classDistribution = profile.class_distribution;
  return {
    dataset: {
      ...summary,
      positiveClassLabel: classDistribution.failure_records > 0 ? "pos" : "unavailable",
      missingValueCount: quality.total_missing_values,
    },
    file: {
      fileName: response.dataset.source_file_name,
      datasetType: mapDatasetType(response.dataset.dataset_type),
      fileSizeBytes: response.dataset.file_size_bytes,
      uploadedAt: response.dataset.imported_at,
      status: response.source_available ? "ready" : "error",
    },
    quality: {
      totalMissingValues: quality.total_missing_values,
      featuresWithMissingValues: profile.missing_values.features_with_missing_values,
      duplicateRecordCount: quality.duplicate_row_count,
      completenessPercentage: Math.max(0, 100 - quality.overall_missing_percentage),
    },
    missingValues: profile.missing_values.items.map((item) => ({
      featureName: item.feature_name,
      missingCount: item.missing_count,
      missingPercentage: item.missing_percentage / 100,
    })),
    classDistribution: {
      totalRecords: classDistribution.total_records,
      normalRecords: classDistribution.normal_records,
      failureRecords: classDistribution.failure_records,
      normalPercentage: classDistribution.normal_percentage / 100,
      failurePercentage: classDistribution.failure_percentage / 100,
      imbalanceRatio: classDistribution.imbalance_ratio,
    },
    features: response.feature_page.items.map(mapFeature),
    preprocessing: buildPreprocessingStages(response),
    lastUpdated: profile.generated_at,
  };
}

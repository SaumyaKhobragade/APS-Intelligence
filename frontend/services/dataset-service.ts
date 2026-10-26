import { apiFetch } from "@/services/api-client";
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

function mapDatasetSummary(dataset: BackendDatasetSummary) {
  return {
    id: dataset.dataset_id,
    name: dataset.dataset_name,
    source: dataset.source_file_name,
    featureCount: dataset.feature_count,
    rowCount: dataset.record_count,
    positiveClassLabel: "pos",
    missingValueCount: 0,
    updatedAt: dataset.imported_at,
    datasetType: mapDatasetType(dataset.dataset_type),
    targetColumn: dataset.target_column ?? "class",
    fileSizeBytes: dataset.file_size_bytes,
    status: dataset.status === "error" ? "error" : "ready",
    uploadedAt: dataset.imported_at,
  } as const;
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
    preprocessing: response.splits
      ? response.splits.splits.map((split) => ({
          id: split.split_name,
          label: split.split_name,
          description: response.splits?.test_isolation_note ?? "Persisted split metadata.",
          status: "completed" as const,
          detail: `${split.record_count.toLocaleString()} records / ${split.fingerprint}`,
        }))
      : [],
    lastUpdated: profile.generated_at,
  };
}

import { apiFetch } from "@/services/api-client";
import type { DatasetExplorerSnapshot, DatasetType, DatasetUploadResponse } from "@/types";

/** Future FastAPI boundary. The Dataset Explorer currently uses lib/dataset-mock-data.ts. */
export function fetchDatasetExplorer(datasetType: DatasetType): Promise<DatasetExplorerSnapshot> {
  return apiFetch<DatasetExplorerSnapshot>(`/datasets/explorer?dataset_type=${datasetType}`);
}

/** Future FastAPI boundary for multipart CSV uploads. */
export function uploadDataset(file: File, datasetType: DatasetType): Promise<DatasetUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  body.append("dataset_type", datasetType);

  return apiFetch<DatasetUploadResponse>("/datasets/upload", {
    method: "POST",
    body,
  });
}

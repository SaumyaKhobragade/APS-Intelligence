import { apiDownload } from "@/services/api-client";
import { fetchHistoricalValidationComparison, mapHistoricalComparisonToSnapshot } from "@/services/historical-evidence-service";
import type { ModelComparisonSnapshot } from "@/types";

export interface ModelComparisonFilters {
  page?: number;
  pageSize?: number;
  modelName?: string;
  experimentId?: string;
  imbalanceStrategy?: string;
  evaluationType?: "validation" | "official_test" | "production";
}

export function fetchModelComparison(filters: ModelComparisonFilters = {}): Promise<ModelComparisonSnapshot> {
  if (filters.evaluationType && filters.evaluationType !== "validation") {
    return Promise.resolve({ models: [], evaluationSplit: "Historical validation only", lastUpdated: new Date().toISOString() });
  }
  return fetchHistoricalValidationComparison(filters.pageSize ?? 100).then((response) => {
    const filtered = response.items.filter((item) =>
      (!filters.modelName || item.model_name === filters.modelName)
      && (!filters.experimentId || item.reference_id === filters.experimentId)
      && (!filters.imbalanceStrategy || item.imbalance_strategy === filters.imbalanceStrategy),
    );
    return mapHistoricalComparisonToSnapshot({ ...response, items: filtered, total: filtered.length });
  });
}

export function downloadModelComparisonCsv(evaluationType: "validation" | "official_test" | "production" = "validation"): Promise<void> {
  return apiDownload(`/exports/models/comparison.csv?evaluation_type=${evaluationType}`, "aps-model-comparison.csv");
}

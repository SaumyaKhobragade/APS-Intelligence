import { apiFetch } from "@/services/api-client";
import type { ModelComparisonSnapshot } from "@/types";

/** Future FastAPI boundary. The Model Comparison page currently uses mock artifacts. */
export function fetchModelComparison(): Promise<ModelComparisonSnapshot> {
  return apiFetch<ModelComparisonSnapshot>("/models/comparison");
}

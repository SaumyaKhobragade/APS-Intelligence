export interface IllustrativeCostResult {
  isAvailable: boolean;
  fpCount?: number;
  fnCount?: number;
  calculatedCost?: number;
  persistedCost?: number | null;
  hasDiscrepancy: boolean;
  discrepancyNote?: string | null;
}

/**
 * Calculates illustrative business cost from confusion matrix counts:
 * formula: FP count × 1 + FN count × 10.
 *
 * If FP or FN counts are unavailable or invalid, returns isAvailable: false.
 * If persisted estimatedCost exists and differs from calculated cost,
 * flags hasDiscrepancy and provides a discrepancyNote without altering persisted evidence.
 */
export function computeIllustrativeCost(
  fp?: number | null,
  fn?: number | null,
  persistedCost?: number | null,
  explicitReason?: string | null,
): IllustrativeCostResult {
  const hasFp = typeof fp === "number" && Number.isFinite(fp) && fp >= 0;
  const hasFn = typeof fn === "number" && Number.isFinite(fn) && fn >= 0;

  if (!hasFp || !hasFn) {
    return {
      isAvailable: false,
      persistedCost: typeof persistedCost === "number" && Number.isFinite(persistedCost) ? persistedCost : null,
      hasDiscrepancy: false,
      discrepancyNote: null,
    };
  }

  const calculatedCost = Math.round((fp * 1 + fn * 10) * 100) / 100;
  const hasPersisted = typeof persistedCost === "number" && Number.isFinite(persistedCost);
  const diff = hasPersisted ? Math.abs(calculatedCost - (persistedCost as number)) : 0;
  const hasDiscrepancy = hasPersisted && diff > 0.001;

  let discrepancyNote: string | null = null;
  if (hasDiscrepancy) {
    if (explicitReason && explicitReason.trim().length > 0) {
      discrepancyNote = `Persisted estimate: ${persistedCost}. This differs from the calculated illustrative score of ${calculatedCost} (${explicitReason.trim()}).`;
    } else {
      discrepancyNote = `Persisted estimate: ${persistedCost}. This differs from the calculated illustrative score of ${calculatedCost}.`;
    }
  }

  return {
    isAvailable: true,
    fpCount: fp,
    fnCount: fn,
    calculatedCost,
    persistedCost: hasPersisted ? persistedCost : null,
    hasDiscrepancy,
    discrepancyNote,
  };
}

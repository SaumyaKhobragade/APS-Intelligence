import * as React from "react";
import { AlertTriangle, Scale, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatters";
import { computeIllustrativeCost } from "@/lib/business-cost";
import type { ModelEvaluation } from "@/types";

interface BusinessImpactComparisonProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function BusinessImpactComparisonComponent({ models, selectedModelId, onSelectModel }: BusinessImpactComparisonProps) {
  const modelsWithCost = React.useMemo(() => {
    return models.map((model) => {
      const costInfo = computeIllustrativeCost(
        model.confusionMatrix?.falsePositive ?? model.businessImpact?.falsePositiveCount,
        model.confusionMatrix?.falseNegative ?? model.businessImpact?.falseNegativeCount,
        model.businessImpact?.estimatedCost,
        model.evaluationScope,
      );
      const fp = costInfo.isAvailable ? costInfo.fpCount! : 0;
      const fn = costInfo.isAvailable ? costInfo.fnCount! : 0;
      const totalCost = costInfo.isAvailable ? costInfo.calculatedCost! : 0;
      return {
        model,
        costInfo,
        fp,
        fn,
        fpCost: fp * 1,
        fnCost: fn * 10,
        totalCost,
      };
    });
  }, [models]);

  const maxCost = React.useMemo(() => {
    return Math.max(...modelsWithCost.map((item) => item.totalCost), 1);
  }, [modelsWithCost]);

  return (
    <section id="business-impact" aria-labelledby="business-impact-heading" className="px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">07 / Business impact</p>
          <h2 id="business-impact-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">The cheapest threshold is its own question.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">PR-AUC ranks the precision-recall surface. Business cost depends on the selected operating point and the asymmetric penalty for missed failures.</p>
        </div>
        <Badge variant="signal"><Scale aria-hidden="true" className="size-3" /> 1 × FP + 10 × FN (illustrative)</Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Illustrative validation cost</p>
          <p className="mt-6 font-display text-5xl leading-[0.9] tracking-[-0.05em]">False negatives carry the larger weight.</p>
          <p className="mt-6 text-sm leading-6 text-silver/75">The displayed illustrative scores are calculated directly from confusion matrix false positive and false negative counts using the project&apos;s established unitless weights (FP × 1 + FN × 10). Use this comparison as an illustrative decision aid, not as actual operational fleet cost.</p>
          <div className="mt-10 border-t border-white/15 pt-5 font-mono text-[10px] uppercase leading-6 tracking-[0.1em] text-silver/65">
            Inspection / 1 weight per false positive<br />
            Missed failure / 10 weight per false negative
          </div>
        </div>

        <div className="min-w-0 overflow-x-auto border-y border-line">
          <div className="min-w-[38rem]">
            <div className="grid grid-cols-[minmax(10rem,1fr)_4rem_4rem_7rem_7rem_7rem] gap-3 border-b border-line bg-surface px-3 py-3 font-mono text-[10px] uppercase tracking-[0.11em] text-muted">
              <span>Model</span>
              <span>FP</span>
              <span>FN</span>
              <span>Inspection</span>
              <span>Missed failure</span>
              <span>Total cost</span>
            </div>
            <div className="max-h-[34rem] divide-y divide-line overflow-y-auto">
              {modelsWithCost.map(({ model, costInfo, fp, fn, fpCost, fnCost, totalCost }) => {
                const isSelected = model.modelId === selectedModelId;
                return (
                  <button
                    key={model.modelId}
                    type="button"
                    className={`block w-full border-b border-line px-3 py-4 text-left transition-colors hover:bg-canvas-deep ${
                      isSelected ? "bg-signal-wash/50" : ""
                    }`}
                    onClick={() => onSelectModel(model.modelId)}
                    aria-pressed={isSelected}
                  >
                    <div className="grid grid-cols-[minmax(10rem,1fr)_4rem_4rem_7rem_7rem_7rem] items-center gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-ink">{model.modelName}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Threshold / {model.threshold.toFixed(2)}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-ink">
                        <AlertTriangle aria-hidden="true" className="size-3 text-muted" />
                        {costInfo.isAvailable ? formatNumber(fp) : "—"}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-signal">
                        <ShieldAlert aria-hidden="true" className="size-3" />
                        {costInfo.isAvailable ? formatNumber(fn) : "—"}
                      </span>
                      <span className="font-mono text-xs text-ink">{costInfo.isAvailable ? formatNumber(fpCost) : "—"}</span>
                      <span className="font-mono text-xs text-signal">{costInfo.isAvailable ? formatNumber(fnCost) : "—"}</span>
                      <span className="font-mono text-xs font-semibold text-ink" title={costInfo.hasDiscrepancy && costInfo.discrepancyNote ? costInfo.discrepancyNote : undefined}>
                        {costInfo.isAvailable ? formatNumber(totalCost) : "Unavailable"}
                      </span>
                    </div>
                    <div className="mt-3 h-1 bg-canvas-deep">
                      <div
                        className={`h-full ${model.modelId.includes("catboost") ? "bg-signal" : "bg-charcoal"}`}
                        style={{ width: `${Math.min((totalCost / maxCost) * 100, 100)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">Select a row to keep the model context consistent across the overview, confusion matrix, feature importance and details sections.</p>
    </section>
  );
}

export const BusinessImpactComparison = React.memo(BusinessImpactComparisonComponent);

import { AlertTriangle, CircleDollarSign, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

interface BusinessImpactComparisonProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function BusinessImpactComparison({ models, selectedModelId, onSelectModel }: BusinessImpactComparisonProps) {
  const maxCost = Math.max(...models.map((model) => model.businessImpact.estimatedCost));

  return (
    <section id="business-impact" aria-labelledby="business-impact-heading" className="px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">07 / Business impact</p>
          <h2 id="business-impact-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">The cheapest threshold is its own question.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">PR-AUC ranks the precision-recall surface. Business cost depends on the selected operating point and the asymmetric penalty for missed failures.</p>
        </div>
        <Badge variant="signal"><CircleDollarSign aria-hidden="true" className="size-3" /> 10 × FP + 500 × FN</Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Cost model</p><p className="mt-6 font-display text-5xl leading-[0.9] tracking-[-0.05em]">False negatives weigh 50× more.</p><p className="mt-6 text-sm leading-6 text-silver/75">That weighting can change which model is operationally preferred at a chosen threshold. Use this comparison as a decision aid, not a claim that PR-AUC alone optimizes cost.</p><div className="mt-10 border-t border-white/15 pt-5 font-mono text-[10px] uppercase leading-6 tracking-[0.1em] text-silver/65">Inspection / $10 per false positive<br />Missed failure / $500 per false negative</div></div>
        <div className="min-w-0 overflow-x-auto border-y border-line">
          <div className="min-w-[38rem]">
            <div className="grid grid-cols-[minmax(10rem,1fr)_4rem_4rem_7rem_7rem_7rem] gap-3 border-b border-line bg-surface px-3 py-3 font-mono text-[10px] uppercase tracking-[0.11em] text-muted"><span>Model</span><span>FP</span><span>FN</span><span>Inspection</span><span>Missed failure</span><span>Total cost</span></div>
            {models.map((model) => {
              const impact = model.businessImpact;
              const isSelected = model.modelId === selectedModelId;
              return <button key={model.modelId} type="button" className={`block w-full border-b border-line px-3 py-5 text-left transition-colors hover:bg-canvas-deep ${isSelected ? "bg-signal-wash/50" : ""}`} onClick={() => onSelectModel(model.modelId)} aria-pressed={isSelected}><div className="grid grid-cols-[minmax(10rem,1fr)_4rem_4rem_7rem_7rem_7rem] items-center gap-3"><span className="min-w-0"><span className="block truncate text-xs font-medium text-ink">{model.modelName}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Threshold / {model.threshold.toFixed(2)}</span></span><span className="inline-flex items-center gap-1 font-mono text-xs text-ink"><AlertTriangle aria-hidden="true" className="size-3 text-muted" />{formatNumber(impact.falsePositiveCount)}</span><span className="inline-flex items-center gap-1 font-mono text-xs text-signal"><ShieldAlert aria-hidden="true" className="size-3" />{formatNumber(impact.falseNegativeCount)}</span><span className="font-mono text-xs text-ink">{formatCurrency(impact.falsePositiveCost)}</span><span className="font-mono text-xs text-signal">{formatCurrency(impact.falseNegativeCost)}</span><span className="font-mono text-xs font-semibold text-ink">{formatCurrency(impact.estimatedCost)}</span></div><div className="mt-3 h-1 bg-canvas-deep"><div className={`h-full ${model.modelId === "xgboost" ? "bg-signal" : "bg-charcoal"}`} style={{ width: `${(impact.estimatedCost / maxCost) * 100}%` }} /></div></button>;
            })}
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">Select a row to keep the model context consistent across the overview, confusion matrix, feature importance and details sections.</p>
    </section>
  );
}

export { BusinessImpactComparison };

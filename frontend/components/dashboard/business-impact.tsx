import { AlertTriangle, CircleDollarSign, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { BusinessImpactSummary } from "@/types";

interface BusinessImpactProps {
  impact: BusinessImpactSummary;
}

function BusinessImpact({ impact }: BusinessImpactProps) {
  const falseNegativeShare = Math.round((impact.falseNegativeCost / impact.estimatedCost) * 100);
  const maxCost = Math.max(impact.falsePositiveCost, impact.falseNegativeCost);

  return (
    <section aria-labelledby="business-impact-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="grid gap-10 xl:grid-cols-[0.7fr_1.3fr] xl:gap-16">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">04 / Business impact</p>
          <h2 id="business-impact-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Missed failures are the expensive line item.</h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">A simple cost model makes threshold decisions legible: false positives are operational noise, false negatives are service risk.</p>
          <div className="mt-8 border-l-2 border-signal pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Cost function</p>
            <p className="mt-2 font-mono text-lg tracking-[-0.03em] text-ink">10 × FP + 500 × FN</p>
            <p className="mt-2 text-xs leading-5 text-muted">Demonstration assumption / weights are configurable in threshold optimization.</p>
          </div>
        </div>

        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Estimated business cost</p>
              <p className="mt-2 font-mono text-5xl tracking-[-0.07em] text-ink sm:text-6xl">{formatCurrency(impact.estimatedCost)}</p>
            </div>
            <Badge variant="signal"><CircleDollarSign aria-hidden="true" className="size-3" /> Sample model</Badge>
          </div>

          <div className="mt-7 space-y-6">
            <div>
              <div className="flex items-end justify-between gap-4">
                <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center bg-canvas-deep"><AlertTriangle aria-hidden="true" className="size-4 text-muted" /></span><div><p className="text-sm font-medium text-ink">False positives</p><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{formatNumber(impact.falsePositiveCount)} × $10</p></div></div>
                <p className="font-mono text-lg text-ink">{formatCurrency(impact.falsePositiveCost)}</p>
              </div>
              <div className="mt-3 h-2 bg-canvas-deep"><div className="h-full bg-charcoal" style={{ width: `${(impact.falsePositiveCost / maxCost) * 100}%` }} /></div>
            </div>
            <div>
              <div className="flex items-end justify-between gap-4">
                <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center bg-signal-wash"><ShieldAlert aria-hidden="true" className="size-4 text-signal" /></span><div><p className="text-sm font-medium text-ink">False negatives</p><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{formatNumber(impact.falseNegativeCount)} × $500</p></div></div>
                <p className="font-mono text-lg text-signal">{formatCurrency(impact.falseNegativeCost)}</p>
              </div>
              <div className="mt-3 h-2 bg-canvas-deep"><div className="h-full bg-signal" style={{ width: `${(impact.falseNegativeCost / maxCost) * 100}%` }} /></div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <span>{falseNegativeShare}% of estimated cost comes from missed failures</span>
            <span className="inline-flex items-center gap-2 text-signal"><span className="size-2 bg-signal" /> Risk-weighted</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export { BusinessImpact };

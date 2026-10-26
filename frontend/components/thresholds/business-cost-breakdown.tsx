import { CircleDollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import type { CostWeights, ThresholdMetrics } from "@/types";

interface BusinessCostBreakdownProps {
  metrics: ThresholdMetrics;
  defaultMetrics: ThresholdMetrics;
  costWeights: CostWeights;
  onCostWeightsChange: (weights: CostWeights) => void;
  readOnly?: boolean;
}

function BusinessCostBreakdown({ metrics, defaultMetrics, costWeights, onCostWeightsChange, readOnly = false }: BusinessCostBreakdownProps) {
  const difference = metrics.businessCost - defaultMetrics.businessCost;
  const reduction = defaultMetrics.businessCost === 0 ? 0 : (defaultMetrics.businessCost - metrics.businessCost) / defaultMetrics.businessCost;
  function updateWeight(key: keyof CostWeights, value: string) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) onCostWeightsChange({ ...costWeights, [key]: parsed });
  }
  return <section id="business-cost" aria-labelledby="business-cost-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
    <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Cost calculator</p><h2 id="business-cost-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Price the error asymmetry.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Persisted validation cost assumptions are displayed for review and do not modify the frozen candidate.</p></div><Badge variant="signal"><CircleDollarSign aria-hidden="true" className="size-3" /> {costWeights.falsePositive} × FP + {costWeights.falseNegative} × FN</Badge></div>
    <div className="mt-8 grid gap-8 xl:grid-cols-[0.7fr_1.3fr]"><div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Current business cost</p><p className="mt-5 font-display text-6xl leading-none tracking-[-0.08em] text-signal">{formatCurrency(metrics.businessCost)}</p><p className="mt-3 text-sm leading-6 text-silver/75">At threshold {formatPercent(metrics.threshold)} / compared with configured default {formatCurrency(defaultMetrics.businessCost)}.</p><p className="mt-8 border-t border-white/15 pt-5 font-mono text-[10px] uppercase leading-6 tracking-[0.1em] text-silver/65">{difference < 0 ? `Reduction / ${formatCurrency(Math.abs(difference))} / ${formatPercent(reduction)}` : difference === 0 ? "Difference / no change from default" : `Increase / ${formatCurrency(difference)}`}</p></div>
      <div className="min-w-0 border-y border-line bg-surface p-5 sm:p-7"><div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="false-positive-weight" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">False positive weight</label><Input id="false-positive-weight" type="number" min="0" step="1" value={costWeights.falsePositive} onChange={(event) => updateWeight("falsePositive", event.target.value)} disabled={readOnly} /></div><div><label htmlFor="false-negative-weight" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">False negative weight</label><Input id="false-negative-weight" type="number" min="0" step="1" value={costWeights.falseNegative} onChange={(event) => updateWeight("falseNegative", event.target.value)} disabled={readOnly} /></div></div><div className="mt-8 space-y-5"><CostRow label="False positive cost" detail={`${formatNumber(metrics.falsePositiveCount)} FP × ${formatCurrency(costWeights.falsePositive)} assumed`} value={metrics.falsePositiveCost} total={metrics.businessCost} tone="neutral" /><CostRow label="False negative cost" detail={`${formatNumber(metrics.falseNegativeCount)} FN × ${formatCurrency(costWeights.falseNegative)} assumed`} value={metrics.falseNegativeCost} total={metrics.businessCost} tone="signal" /></div></div></div>
  </section>;
}

function CostRow({ label, detail, value, total, tone }: { label: string; detail: string; value: number; total: number; tone: "neutral" | "signal" }) { return <div><div className="flex items-center justify-between gap-4"><div><p className={`text-sm font-medium ${tone === "signal" ? "text-signal" : "text-ink"}`}>{label}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{detail}</p></div><span className="font-mono text-sm text-ink">{formatCurrency(value)}</span></div><div className="mt-3 h-2 bg-canvas-deep"><div className={`h-full ${tone === "signal" ? "bg-signal" : "bg-charcoal"}`} style={{ width: `${total === 0 ? 0 : Math.min(100, Math.max(0, value / total * 100))}%` }} /></div></div>; }

export { BusinessCostBreakdown };

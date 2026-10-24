import { ChartPie, CircleAlert, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { ClassDistribution } from "@/types";

interface ClassDistributionProps {
  distribution: ClassDistribution;
}

function ClassDistributionSection({ distribution }: ClassDistributionProps) {
  return (
    <section id="class-distribution" aria-labelledby="class-distribution-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="grid gap-10 xl:grid-cols-[0.75fr_1.25fr] xl:gap-16">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">04 / Class distribution</p>
          <h2 id="class-distribution-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Rare events need a different lens.</h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">The original training split is deliberately imbalanced. A model can appear accurate while missing the failure class that matters operationally.</p>
          <div className="mt-8 border-l-2 border-signal pl-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Why accuracy is insufficient</p>
            <p className="mt-2 text-sm leading-6 text-ink-soft">If every row were called normal, accuracy would still be about 98.3% on the 59:1 training split — while detecting zero failures. PR-AUC, recall, precision and cost expose the real trade-off.</p>
          </div>
        </div>

        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Normal vs failure / sample</p>
              <p className="mt-2 text-sm text-ink">Positive class visibility</p>
            </div>
            <Badge variant="signal"><Scale aria-hidden="true" className="size-3" /> {distribution.imbalanceRatio}</Badge>
          </div>

          <div className="mt-8" role="img" aria-label={`Class distribution: ${formatNumber(distribution.normalRecords)} normal and ${formatNumber(distribution.failureRecords)} failure records`}>
            <div className="flex h-7 w-full overflow-hidden bg-charcoal" aria-hidden="true">
              <div className="bg-charcoal" style={{ width: `${distribution.normalPercentage * 100}%` }} />
              <div className="min-w-3 bg-signal" style={{ width: `${distribution.failurePercentage * 100}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><span>Negative class / normal</span><span>Positive class / failure</span></div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="border-l-2 border-charcoal bg-canvas-deep/60 p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-ink">Normal cases</p><ChartPie aria-hidden="true" className="size-4 text-muted" strokeWidth={1.5} /></div>
              <p className="mt-4 font-mono text-3xl tracking-[-0.06em] text-ink">{formatNumber(distribution.normalRecords)}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{formatPercent(distribution.normalPercentage)} of records</p>
            </div>
            <div className="border-l-2 border-signal bg-signal-wash/45 p-4">
              <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-ink">Failure cases</p><CircleAlert aria-hidden="true" className="size-4 text-signal" strokeWidth={1.5} /></div>
              <p className="mt-4 font-mono text-3xl tracking-[-0.06em] text-signal">{formatNumber(distribution.failureRecords)}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{formatPercent(distribution.failurePercentage)} of records</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><span>Total / {formatNumber(distribution.totalRecords)}</span><span className="text-signal">Target class is failure</span></div>
        </div>
      </div>
    </section>
  );
}

export { ClassDistributionSection as ClassDistribution };

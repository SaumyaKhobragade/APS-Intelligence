import { BrainCircuit, CircleDollarSign, Database, Gauge, TriangleAlert } from "lucide-react";
import { MetricDisplay } from "@/components/shared/section-header";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import type { DashboardSnapshot } from "@/types";

interface KpiStripProps {
  snapshot: DashboardSnapshot;
}

function KpiStrip({ snapshot }: KpiStripProps) {
  const bestModel = snapshot.models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), snapshot.models[0]);

  return (
    <section aria-labelledby="kpi-heading" className="border-b border-line bg-surface px-5 py-6 sm:px-8 lg:px-10">
      <div className="sr-only" id="kpi-heading">Key performance indicators</div>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_2.9fr] lg:gap-0">
        <div className="flex items-center gap-4 border-b border-line pb-5 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <span className="flex size-11 shrink-0 items-center justify-center bg-charcoal text-silver"><Database aria-hidden="true" className="size-5" strokeWidth={1.5} /></span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Total records processed</p>
            <p className="mt-1 font-mono text-3xl font-medium tracking-[-0.06em] text-ink">{formatNumber(snapshot.dataset.rowCount)}</p>
            <p className="mt-1 text-xs text-muted">Across the demonstration snapshot</p>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 lg:pl-8">
          <MetricDisplay
            label="Detected failure cases"
            value={formatNumber(snapshot.distribution.failureRecords)}
            detail="Positive class / sample"
            accent
            className="border-l-0 px-0 sm:border-l sm:pl-5"
          />
          <MetricDisplay
            label="Best performing model"
            value={bestModel.modelName.replace(" Regression", "")}
            detail="Ranked by PR-AUC"
            className="border-l-0 px-0 sm:border-l sm:pl-5"
          />
          <MetricDisplay
            label="Best PR-AUC"
            value={formatPercent(bestModel.prAuc, 1)}
            detail="Precision-recall focus"
            trend="demo"
            className="border-l-0 px-0 sm:border-l sm:pl-5"
          />
          <MetricDisplay
            label="Total business cost"
            value={formatCurrency(snapshot.businessImpact.estimatedCost)}
            detail="10 × FP + 500 × FN"
            className="border-l-0 px-0 sm:border-l sm:pl-5"
          />
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        <span className="inline-flex items-center gap-2"><TriangleAlert aria-hidden="true" className="size-3 text-signal" /> Sample results only</span>
        <span className="inline-flex items-center gap-2"><BrainCircuit aria-hidden="true" className="size-3" /> Offline artifacts</span>
        <span className="inline-flex items-center gap-2"><Gauge aria-hidden="true" className="size-3" /> Threshold-aware</span>
        <span className="inline-flex items-center gap-2"><CircleDollarSign aria-hidden="true" className="size-3" /> Cost-sensitive</span>
      </div>
    </section>
  );
}

export { KpiStrip };

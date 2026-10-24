import { Activity, BarChart3, Ruler, Sigma } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { FeatureStatistics } from "@/types";

interface FeatureDetailsPanelProps {
  feature?: FeatureStatistics;
}

function FeatureDetailsPanel({ feature }: FeatureDetailsPanelProps) {
  if (!feature) {
    return <EmptyState title="Select a feature" description="Choose a row from the inventory to inspect its descriptive statistics." />;
  }

  return (
    <aside aria-labelledby="feature-details-heading" className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-7">
      <div className="flex items-start justify-between gap-5 border-b border-white/15 pb-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Feature detail</p>
          <h3 id="feature-details-heading" className="mt-3 font-mono text-2xl tracking-[-0.04em]">{feature.name}</h3>
        </div>
        <Badge variant="dark">{feature.dataType}</Badge>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-px bg-white/15 sm:grid-cols-4">
        <Stat label="Missing" value={formatPercent(feature.missingPercentage)} icon={Activity} />
        <Stat label="Non-null" value={formatNumber(feature.nonNullCount)} icon={BarChart3} />
        <Stat label="Mean" value={feature.mean === undefined ? "—" : feature.mean.toFixed(2)} icon={Sigma} />
        <Stat label="Std. dev." value={feature.standardDeviation === undefined ? "—" : feature.standardDeviation.toFixed(2)} icon={Ruler} />
      </div>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/15 pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-silver/70"><span>Min / {feature.minimum === undefined ? "—" : feature.minimum.toFixed(2)}</span><span>Max / {feature.maximum === undefined ? "—" : feature.maximum.toFixed(2)}</span><span>Null count / {formatNumber(feature.missingCount)}</span></div>
      <p className="mt-5 text-xs leading-5 text-silver/70">Descriptive statistics are demonstration metadata. The backend will provide exact profiles for the uploaded file.</p>
    </aside>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Activity }) {
  return <div className="bg-charcoal p-3"><Icon aria-hidden="true" className="size-3 text-signal" strokeWidth={1.5} /><p className="mt-3 font-mono text-lg tracking-[-0.04em] text-white">{value}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-silver/65">{label}</p></div>;
}

export { FeatureDetailsPanel };

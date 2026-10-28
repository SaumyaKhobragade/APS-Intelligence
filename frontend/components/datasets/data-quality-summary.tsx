import { AlertTriangle, CheckCircle2, Copy, FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MetricDisplay } from "@/components/shared/section-header";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { DataQualitySummary, MissingValueSummary } from "@/types";
import { MissingValuesChart } from "@/components/datasets/missing-values-chart";

interface DataQualitySummaryProps {
  quality: DataQualitySummary;
  missingValues: MissingValueSummary[];
}

function DataQualitySummarySection({ quality, missingValues }: DataQualitySummaryProps) {
  return (
    <section id="data-quality" aria-labelledby="data-quality-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Data quality</p>
          <h2 id="data-quality-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Measure the gaps before filling them.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Missingness, duplication and completeness are treated as first-class signals. No frontend transformation is presented as a completed preprocessing result.</p>
        </div>
        <Badge variant="neutral"><FileWarning aria-hidden="true" className="size-3" /> Ingested dataset profile</Badge>
      </div>

      <div className="mt-8 grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
        <MetricDisplay label="Total missing values" value={formatNumber(quality.totalMissingValues)} detail="Across feature matrix (850,015 total)" accent className="border-l-0 px-4 py-5 sm:border-r" />
        <MetricDisplay label="Features with missing" value={String(quality.featuresWithMissingValues)} detail="Of 170 source features" className="border-l-0 px-4 py-5 sm:border-r" />
        <MetricDisplay label="Duplicate records" value={formatNumber(quality.duplicateRecordCount)} detail="Zero duplicates in official set" className="border-l-0 px-4 py-5 sm:border-r" />
        <MetricDisplay label="Overall completeness" value={formatPercent(quality.completenessPercentage / 100)} detail="Non-null values across matrix" className="border-l-0 px-4 py-5" />
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Quality readout</p>
              <p className="mt-4 font-display text-4xl leading-none tracking-[-0.04em]">{quality.completenessPercentage.toFixed(1)}% complete</p>
            </div>
            <CheckCircle2 aria-hidden="true" className="size-5 text-signal" strokeWidth={1.5} />
          </div>
          <div className="mt-12 space-y-4 border-t border-white/15 pt-5 text-sm leading-6 text-silver/80">
            <p className="flex items-start gap-3"><AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0 text-signal" /> Missing values should be profiled before choosing an imputation strategy.</p>
            <p className="flex items-start gap-3"><Copy aria-hidden="true" className="mt-1 size-4 shrink-0 text-signal" /> Duplicate rows can distort rare-event metrics and must be handled deliberately.</p>
          </div>
          <p className="mt-8 border-t border-white/15 pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">Preprocessing boundary / Executed during model training</p>
        </div>
        <MissingValuesChart values={missingValues} />
      </div>
    </section>
  );
}

export { DataQualitySummarySection as DataQualitySummary };

import { Activity, AlertTriangle, CheckCircle2, CircleDollarSign, ScanSearch } from "lucide-react";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { ThresholdMetrics as ThresholdMetricsData } from "@/types";

interface ThresholdMetricsProps {
  metrics: ThresholdMetricsData;
}

function ThresholdMetrics({ metrics }: ThresholdMetricsProps) {
  const cards = [
    { label: "Precision", value: formatPercent(metrics.precision), detail: "Of flagged rows, share that fail", icon: ScanSearch, tone: "text-ink" },
    { label: "Recall", value: formatPercent(metrics.recall), detail: "Failures surfaced by the model", icon: Activity, tone: "text-signal" },
    { label: "F1-score", value: formatPercent(metrics.f1Score), detail: "Harmonic precision / recall balance", icon: CheckCircle2, tone: "text-ink" },
    { label: "Predicted failures", value: formatNumber(metrics.predictedFailureCount), detail: "Rows sent to inspection", icon: AlertTriangle, tone: "text-signal" },
    { label: "Business cost", value: formatNumber(metrics.businessCost), detail: "Assumed weights (1×FP + 10×FN)", icon: CircleDollarSign, tone: "text-ink" },
  ];

  return (
    <section id="threshold-metrics" aria-labelledby="threshold-metrics-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Live metrics</p><h2 id="threshold-metrics-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Counts first. Percentages second.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">The selected threshold changes the confusion counts and the derived metrics together. Accuracy is intentionally not the primary optimization lens for this imbalanced problem.</p></div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Threshold / {metrics.threshold.toFixed(3)}</p></div>
      <div className="mt-8 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-5">{cards.map(({ label, value, detail, icon: Icon, tone }) => <div key={label} className="bg-surface p-5 sm:p-6"><Icon aria-hidden="true" className={`size-4 ${tone}`} strokeWidth={1.5} /><p className="mt-7 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</p><p className={`mt-2 font-mono text-3xl tracking-[-0.06em] ${tone}`}>{value}</p><p className="mt-2 text-xs leading-5 text-muted">{detail}</p></div>)}</div>
      <div className="mt-6 grid gap-4 border-t border-line pt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:grid-cols-4"><span>TP / {formatNumber(metrics.truePositiveCount)}</span><span>TN / {formatNumber(metrics.trueNegativeCount)}</span><span>FP / {formatNumber(metrics.falsePositiveCount)}</span><span className="text-signal">FN / {formatNumber(metrics.falseNegativeCount)} / high-cost miss</span></div>
    </section>
  );
}

export { ThresholdMetrics };

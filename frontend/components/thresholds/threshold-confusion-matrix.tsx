import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatters";
import type { ThresholdEvidenceScope, ThresholdMetrics } from "@/types";

interface ThresholdConfusionMatrixProps {
  metrics: ThresholdMetrics;
  modelName: string;
  scope?: ThresholdEvidenceScope;
  scopeLabel?: string;
}

function ThresholdConfusionMatrix({ metrics, modelName, scope, scopeLabel }: ThresholdConfusionMatrixProps) {
  const cells = [
    { label: "True negative", shortLabel: "TN", value: metrics.trueNegativeCount, tone: "neutral", icon: CheckCircle2, explanation: "Normal rows correctly left unflagged." },
    { label: "False positive", shortLabel: "FP", value: metrics.falsePositiveCount, tone: "muted", icon: MinusCircle, explanation: "Normal rows sent for inspection." },
    { label: "False negative", shortLabel: "FN", value: metrics.falseNegativeCount, tone: "signal", icon: AlertTriangle, explanation: "Failures missed by the model; highest assumed cost." },
    { label: "True positive", shortLabel: "TP", value: metrics.truePositiveCount, tone: "success", icon: CheckCircle2, explanation: "Failures correctly surfaced for intervention." },
  ] as const;
  const classes = { neutral: "border-line bg-canvas-deep/60", muted: "border-line-strong bg-canvas-deep", signal: "border-signal bg-signal-wash", success: "border-success/40 bg-success/10" };
  const iconClasses = { neutral: "text-muted", muted: "text-muted", signal: "text-signal", success: "text-success" };

  const isValidation = scope === "validation";
  const partitionLabel = isValidation ? "Observed external validation rows" : "Observed internal policy selection rows (OOF CV)";
  const partitionExplanation = isValidation
    ? "All four cells share the selected model, external validation dataset and threshold. False negatives stay visually prominent because the assumed missed-failure weight is 10 times larger (FN=10 vs FP=1)."
    : "All four cells share the selected model, internal policy selection partition (OOF CV) and threshold. This exploratory checkpoint is not from external validation. False negatives stay visually prominent (FN=10 vs FP=1).";

  return (
    <section id="threshold-confusion-matrix" aria-labelledby="threshold-confusion-matrix-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">04 / Confusion matrix</p>
          <h2 id="threshold-confusion-matrix-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Make the trade-off tangible.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">{partitionExplanation}</p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Badge variant={isValidation ? "signal" : "neutral"}>
            {modelName} / {metrics.threshold.toFixed(3)} / {scopeLabel ?? (isValidation ? "External validation" : "Internal selection")}
          </Badge>
        </div>
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{partitionLabel}</p>
              <p className="mt-2 text-sm text-ink">{formatNumber(metrics.totalSamples)} total / {formatNumber(metrics.truePositiveCount + metrics.falseNegativeCount)} actual failures</p>
            </div>
            <Badge variant="signal">Consistent totals</Badge>
          </div>
          <div className="mt-7 grid grid-cols-2 gap-2">
            {cells.map(({ label, shortLabel, value, tone, icon: Icon }) => (
              <div key={label} className={`border p-4 sm:p-6 ${classes[tone]}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{shortLabel}</span>
                  <Icon aria-hidden="true" className={`size-4 ${iconClasses[tone]}`} strokeWidth={1.5} />
                </div>
                <p className="mt-6 font-mono text-3xl tracking-[-0.06em] text-ink">{formatNumber(value)}</p>
                <p className="mt-2 text-xs leading-5 text-muted">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t border-line pt-4 font-mono text-[10px] uppercase leading-5 tracking-[0.1em] text-muted">
            Predicted / normal → failure <span className="mx-2 text-line-strong">·</span> Actual / normal ↓ failure
          </div>
        </div>
        <div className="border-l-2 border-signal pl-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Reading the cells</p>
          <div className="mt-5 space-y-5">
            {cells.map(({ label, explanation, tone }) => (
              <div key={label}>
                <p className={`text-sm font-medium ${tone === "signal" ? "text-signal" : "text-ink"}`}>{label}</p>
                <p className="mt-1 text-sm leading-6 text-muted">{explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export { ThresholdConfusionMatrix };

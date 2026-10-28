import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { ThresholdEvidenceScope, ThresholdMetrics, ThresholdModelEvaluation } from "@/types";

interface OperationalRecommendationProps {
  model: ThresholdModelEvaluation;
  metrics: ThresholdMetrics;
  scope?: ThresholdEvidenceScope;
}

function OperationalRecommendation({ model, metrics, scope }: OperationalRecommendationProps) {
  const isValidation = scope === "validation";
  const evaluationContext = isValidation
    ? "external validation evaluation"
    : "internal policy selection evaluation (OOF CV)";

  const decisionGuidance = isValidation
    ? "The recommendation is decision support based on the frozen external validation split and assumed cost weights (1×FP + 10×FN). The candidate evaluation policy is frozen at threshold 0.115 and is not production approved."
    : "The recommendation reflects internal policy selection tuning (OOF cross-validation) under assumed cost weights (1×FP + 10×FN). It is an exploratory comparison and does not replace the frozen evaluation policy.";

  return (
    <section id="operational-recommendation" aria-labelledby="operational-recommendation-heading" className="px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="border-t-2 border-signal bg-charcoal p-6 text-white sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">10 / Operational decision support</p>
            <h2 id="operational-recommendation-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] sm:text-5xl">Make the trade-off reviewable.</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-silver/75">
              At the selected operating point, {model.modelName} would surface an estimated {formatNumber(metrics.predictedFailureCount)} rows for inspection and miss an estimated {formatNumber(metrics.falseNegativeCount)} failures in this {evaluationContext}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="signal"><ShieldAlert aria-hidden="true" className="size-3" /> Not a production guarantee</Badge>
            <Badge variant="dark">Scope / {isValidation ? "External validation" : "Internal selection"}</Badge>
          </div>
        </div>
        <div className="mt-10 grid gap-5 border-t border-white/15 pt-6 sm:grid-cols-2 lg:grid-cols-6">
          <DecisionMetric label="Model" value={model.modelName} />
          <DecisionMetric label="Threshold" value={metrics.threshold.toFixed(3)} />
          <DecisionMetric label="Evidence scope" value={isValidation ? "External validation" : "Internal selection"} />
          <DecisionMetric label="Expected recall" value={formatPercent(metrics.recall)} />
          <DecisionMetric label="Expected precision" value={formatPercent(metrics.precision)} />
          <DecisionMetric label="Assumed cost" value={formatNumber(metrics.businessCost)} />
        </div>
        <div className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-3xl text-sm leading-6 text-silver/75">
            {decisionGuidance}
          </p>
          <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
            FN / {formatNumber(metrics.falseNegativeCount)} <ArrowUpRight aria-hidden="true" className="size-3" />
          </span>
        </div>
      </div>
    </section>
  );
}

function DecisionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">{label}</p>
      <p className="mt-2 font-mono text-sm text-white">{value}</p>
    </div>
  );
}

export { OperationalRecommendation };

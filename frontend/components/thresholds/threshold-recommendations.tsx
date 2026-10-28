import { ArrowRight, BadgeCheck, CircleDollarSign, Gauge, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { ThresholdEvidenceScope, ThresholdModelEvaluation, ThresholdRecommendation } from "@/types";

interface ThresholdRecommendationsProps {
  model: ThresholdModelEvaluation;
  recommendations: ThresholdModelEvaluation["recommendations"];
  selectedThreshold: number;
  selectedScope?: ThresholdEvidenceScope;
  onSelect: (recommendation: ThresholdRecommendation) => void;
}

function ThresholdRecommendations({
  model,
  recommendations,
  selectedThreshold,
  selectedScope,
  onSelect,
}: ThresholdRecommendationsProps) {
  const items = [recommendations.minimumCost, recommendations.maximumF1, recommendations.default];
  const icons = { minimum_cost: CircleDollarSign, maximum_f1: Gauge, default: BadgeCheck };

  return (
    <section id="threshold-recommendations" aria-labelledby="threshold-recommendations-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">07 / Recommendations</p>
          <h2 id="threshold-recommendations-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Three answers to one question.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Minimum cost and maximum F1 optimize different objectives. Recommendations document their actual evidence scope (external validation vs internal policy selection) instead of treating all checkpoints as interchangeable.
          </p>
        </div>
        <Badge variant="signal">
          <Sparkles aria-hidden="true" className="size-3" /> Decision support / {model.modelName}
        </Badge>
      </div>
      <div className="mt-8 grid gap-5 xl:grid-cols-3">
        {items.map((recommendation) => {
          const Icon = icons[recommendation.kind];
          const isAvailable = recommendation.isAvailable !== false;
          const selected =
            isAvailable &&
            selectedThreshold.toFixed(4) === recommendation.metrics.threshold.toFixed(4) &&
            (!recommendation.scope || !selectedScope || selectedScope === recommendation.scope);

          if (!isAvailable) {
            return (
              <div
                key={recommendation.kind}
                className="border-t-2 border-line bg-surface/50 p-5 sm:p-6 opacity-80"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Icon
                      aria-hidden="true"
                      className="size-5 text-muted"
                      strokeWidth={1.5}
                    />
                    <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{recommendation.label}</p>
                    {recommendation.scopeLabel ? (
                      <span className="mt-1 inline-block font-mono text-[9px] uppercase tracking-wider text-muted">
                        Scope / {recommendation.scopeLabel}
                      </span>
                    ) : null}
                    <p className="mt-2 font-display text-4xl leading-none tracking-[-0.05em] text-muted">Unavailable</p>
                  </div>
                  <Badge variant="neutral">Evidence missing</Badge>
                </div>
                <p className="mt-5 text-sm leading-6 text-muted">{recommendation.explanation}</p>
                <div className="mt-6 border-t border-line pt-5">
                  <p className="font-mono text-xs leading-5 text-muted">
                    Internal policy-selection evidence (OOF tuning) is absent from the backend payload. External validation checkpoints are never substituted or relabeled as internal evidence.
                  </p>
                </div>
                <Button className="mt-7 w-full" variant="outline" disabled>
                  Evidence unavailable
                </Button>
              </div>
            );
          }

          return (
            <div
              key={recommendation.kind}
              className={`border-t-2 p-5 sm:p-6 ${
                recommendation.kind === "minimum_cost"
                  ? "border-signal bg-signal-wash/50"
                  : recommendation.kind === "maximum_f1"
                    ? "border-charcoal bg-surface"
                    : "border-line-strong bg-canvas-deep/40"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Icon
                    aria-hidden="true"
                    className={`size-5 ${recommendation.kind === "minimum_cost" ? "text-signal" : "text-ink"}`}
                    strokeWidth={1.5}
                  />
                  <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{recommendation.label}</p>
                  {recommendation.scopeLabel ? (
                    <span className="mt-1 inline-block font-mono text-[9px] uppercase tracking-wider text-signal">
                      Scope / {recommendation.scopeLabel}
                    </span>
                  ) : null}
                  <p className="mt-2 font-display text-5xl leading-none tracking-[-0.07em] text-ink">{recommendation.metrics.threshold.toFixed(3)}</p>
                </div>
                {selected ? <Badge variant="signal">Selected</Badge> : null}
              </div>
              <p className="mt-5 text-sm leading-6 text-muted">{recommendation.explanation}</p>
              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5">
                <MiniMetric label="Precision" value={formatPercent(recommendation.metrics.precision)} />
                <MiniMetric label="Recall" value={formatPercent(recommendation.metrics.recall)} />
                <MiniMetric label="F1-score" value={formatPercent(recommendation.metrics.f1Score)} />
                <MiniMetric label="Cost" value={formatNumber(recommendation.metrics.businessCost)} />
                <MiniMetric label="False positives" value={formatNumber(recommendation.metrics.falsePositiveCount)} />
                <MiniMetric label="False negatives" value={formatNumber(recommendation.metrics.falseNegativeCount)} />
              </div>
              <Button className="mt-7 w-full" variant={selected ? "outline" : "default"} onClick={() => onSelect(recommendation)}>
                {selected ? "Operating point selected" : "Use this threshold"}
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm text-ink">{value}</p>
    </div>
  );
}

export { ThresholdRecommendations };

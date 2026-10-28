"use client";

import { AlertTriangle, CheckCircle2, Clock3, Hash, Signal, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatPercent } from "@/lib/formatters";
import type { PredictionResult } from "@/types";

interface PredictionResultPanelProps {
  result?: PredictionResult;
  isBlocked?: boolean;
}

function PredictionResultPanel({ result, isBlocked = false }: PredictionResultPanelProps) {
  if (!result) {
    return (
      <section id="prediction-result" aria-labelledby="prediction-result-heading" className="border-b border-line px-5 py-8 sm:px-8 lg:px-10">
        <EmptyState
          title={isBlocked ? "Prediction result pending (Inference Gated)" : "Prediction result pending"}
          description={
            isBlocked
              ? "Candidate evaluation model is unapproved (promotions: 0). Live prediction is gated by backend registry safeguards. Sensor inputs and batch CSVs can be verified in Stage 2."
              : "Submit a single sensor row or process a batch to see the model probability and threshold decision."
          }
        />
      </section>
    );
  }

  const isFailure = result.predictedLabel === "failure";

  return (
    <section id="prediction-result" aria-labelledby="prediction-result-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">04 / Prediction result</p>
          <h2 id="prediction-result-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">
            Make the threshold decision visible.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            The probability is an empirical model output. The predicted classification is determined by comparing the probability with the applied threshold.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result.riskClassification ? (
            <Badge variant="neutral">Risk: {result.riskClassification}</Badge>
          ) : null}
          <Badge variant={isFailure ? "signal" : "success"}>{result.status ?? "completed"}</Badge>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        <div className={`border-t-2 p-6 sm:p-8 ${isFailure ? "border-signal bg-signal-wash" : "border-success bg-surface"}`}>
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Final predicted class</p>
              <p className={`mt-5 font-display text-6xl leading-none tracking-[-0.06em] ${isFailure ? "text-signal" : "text-ink"}`}>
                {isFailure ? "APS Failure" : "Normal"}
              </p>
            </div>
            {isFailure ? (
              <AlertTriangle aria-hidden="true" className="size-6 text-signal" strokeWidth={1.5} />
            ) : (
              <CheckCircle2 aria-hidden="true" className="size-6 text-success" strokeWidth={1.5} />
            )}
          </div>
          <p className="mt-8 text-sm leading-6 text-ink-soft">
            {isFailure
              ? "The model probability is at or above the applied decision threshold. Prioritize workshop inspection; this is operational decision support, not an automated diagnosis."
              : "The model probability is below the applied decision threshold. Continue scheduled monitoring; a normal output does not eliminate operational risk."}
          </p>
        </div>

        <div className="min-w-0 border-y border-line bg-surface p-5 sm:p-7">
          <div className="flex items-end justify-between gap-4 border-b border-line pb-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Model-predicted probability</p>
              <p className="mt-2 font-mono text-5xl tracking-[-0.07em] text-ink">{formatPercent(result.failureProbability)}</p>
            </div>
            <Target aria-hidden="true" className="size-5 text-signal" />
          </div>

          <div className="mt-7">
            <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span>0 / normal</span>
              <span>1 / failure</span>
            </div>
            <div className="relative mt-3 h-4 bg-canvas-deep">
              <div
                className={`h-full ${isFailure ? "bg-signal" : "bg-charcoal"}`}
                style={{ width: `${Math.min(100, Math.max(0, result.failureProbability * 100))}%` }}
              />
              <div
                className="absolute inset-y-[-5px] w-px bg-charcoal"
                style={{ left: `${Math.min(100, Math.max(0, result.threshold * 100))}%` }}
                aria-label={`Classification threshold ${formatPercent(result.threshold)}`}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
              <span className="inline-flex items-center gap-2">
                <span className={`size-2 ${isFailure ? "bg-signal" : "bg-charcoal"}`} /> Probability / {formatPercent(result.failureProbability)}
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 bg-charcoal" /> Threshold / {formatPercent(result.threshold)}
              </span>
            </div>
          </div>

          <div className="mt-7 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <Meta icon={Signal} label="Model reference" value={result.modelName ?? result.modelId ?? "—"} />
            <Meta icon={Hash} label="Prediction ID" value={result.predictionId || "—"} />
            <Meta icon={Clock3} label="Timestamp" value={result.createdAt ? formatTimestamp(result.createdAt) : "—"} />
            <Meta icon={Target} label="Inference source" value={result.source ?? "single"} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof Signal; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{label}</p>
        <p className="mt-1 break-words font-mono text-xs text-ink">{value}</p>
      </div>
    </div>
  );
}

function formatTimestamp(value: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export { PredictionResultPanel };

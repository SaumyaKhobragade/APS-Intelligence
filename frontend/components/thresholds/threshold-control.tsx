"use client";

import * as React from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ThresholdModelEvaluation, ThresholdRecommendation } from "@/types";

interface ThresholdControlProps {
  model: ThresholdModelEvaluation;
  threshold: number;
  recommendations: ThresholdModelEvaluation["recommendations"];
  onThresholdChange: (threshold: number) => void;
  onReset: () => void;
  onSelectRecommendation: (recommendation: ThresholdRecommendation) => void;
  readOnly?: boolean;
}

function ThresholdControl({
  model,
  threshold,
  recommendations,
  onThresholdChange,
  onReset,
  onSelectRecommendation,
  readOnly = false,
}: ThresholdControlProps) {
  // Derive discrete unique checkpoints from model.thresholdCurve sorted ascending by threshold
  const checkpoints = React.useMemo(() => {
    const raw = model.thresholdCurve ?? [];
    if (raw.length === 0) {
      return [];
    }
    const map = new Map<string, (typeof raw)[0]>();
    for (const pt of raw) {
      map.set(pt.threshold.toFixed(4), pt);
    }
    return Array.from(map.values()).sort((a, b) => a.threshold - b.threshold);
  }, [model.thresholdCurve]);

  // Exact matching against normalized persisted threshold representation
  const targetKey = threshold.toFixed(4);
  const currentIndex = React.useMemo(() => {
    return checkpoints.findIndex((pt) => pt.threshold.toFixed(4) === targetKey);
  }, [checkpoints, targetKey]);

  const activeCheckpoint = currentIndex >= 0 ? checkpoints[currentIndex] : null;

  // Exact frozen checkpoint lookup: normalized threshold + scope === "validation"
  const frozenTargetKey = model.defaultThreshold.toFixed(4);
  const frozenCheckpoint = React.useMemo(() => {
    return (
      checkpoints.find(
        (pt) => pt.threshold.toFixed(4) === frozenTargetKey && pt.scope === "validation",
      ) ?? null
    );
  }, [checkpoints, frozenTargetKey]);

  const isFrozenPolicy = Boolean(
    activeCheckpoint &&
      frozenCheckpoint &&
      activeCheckpoint.threshold.toFixed(4) === frozenTargetKey &&
      activeCheckpoint.scope === "validation",
  );

  return (
    <section id="threshold-control" aria-labelledby="threshold-control-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Threshold control</p>
          <h2 id="threshold-control-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Explore persisted checkpoints.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            {isFrozenPolicy
              ? "Displaying the frozen Phase 9 evaluation policy (threshold 0.115). Selected using internal out-of-fold (OOF) policy-selection evidence and measured on the 12,000-sample external validation partition."
              : activeCheckpoint
                ? `Exploratory checkpoint active (threshold ${activeCheckpoint.threshold.toFixed(3)}). Metrics represent measured ${activeCheckpoint.scope === "validation" ? "external validation" : "internal policy selection"} results for this operating point without modifying the frozen evaluation policy.`
                : `Selected threshold (${threshold.toFixed(3)}) does not correspond to an exact persisted checkpoint. Nearest-point fallback is disabled.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFrozenPolicy ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" className="size-3" />
              Frozen evaluation policy (0.115)
            </Badge>
          ) : activeCheckpoint ? (
            <Badge variant="signal">
              <Target aria-hidden="true" className="size-3" />
              Exploratory checkpoint ({activeCheckpoint.threshold.toFixed(3)})
            </Badge>
          ) : (
            <Badge variant="warning">
              <AlertCircle aria-hidden="true" className="size-3" />
              Non-persisted threshold
            </Badge>
          )}
          {activeCheckpoint ? (
            <Badge variant={activeCheckpoint.scope === "validation" ? "neutral" : "dark"}>
              Scope: {activeCheckpoint.scope === "validation" ? "External validation" : "Internal policy selection"}
            </Badge>
          ) : null}
          {!isFrozenPolicy ? (
            frozenCheckpoint ? (
              <Button size="sm" variant="outline" onClick={onReset}>
                <RotateCcw aria-hidden="true" className="size-3" /> Reset to frozen ({model.defaultThreshold.toFixed(3)})
              </Button>
            ) : (
              <Badge variant="neutral">Frozen policy unavailable</Badge>
            )
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Selected checkpoint threshold</p>
                {activeCheckpoint ? (
                  <span className="font-mono text-[9px] uppercase tracking-wider text-silver/60">
                    [{activeCheckpoint.scope === "validation" ? "External validation" : "Internal policy selection"}]
                  </span>
                ) : null}
              </div>
              <p className="mt-4 font-display text-6xl leading-none tracking-[-0.08em] text-signal">
                {activeCheckpoint ? activeCheckpoint.threshold.toFixed(3) : threshold.toFixed(3)}
              </p>
            </div>
            {isFrozenPolicy ? (
              <Badge variant="dark">Frozen evaluation policy</Badge>
            ) : frozenCheckpoint ? (
              <Button size="sm" variant="ghost" className="text-silver hover:bg-white/10 hover:text-white" onClick={onReset}>
                <RotateCcw aria-hidden="true" className="size-3.5" /> Reset to frozen
              </Button>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider text-silver/50">Frozen policy unavailable</span>
            )}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between text-xs text-silver/80">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Discrete checkpoint stepper</span>
              <span className="font-mono text-[10px]">
                {currentIndex >= 0 ? `Checkpoint ${currentIndex + 1} of ${checkpoints.length}` : "No exact checkpoint match"}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-silver hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={readOnly || currentIndex <= 0}
                onClick={() => {
                  if (currentIndex > 0) onThresholdChange(checkpoints[currentIndex - 1].threshold);
                }}
                aria-label="Previous persisted checkpoint"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Button>
              <input
                id="threshold-range"
                type="range"
                min="0"
                max={Math.max(0, checkpoints.length - 1)}
                step="1"
                value={Math.max(0, currentIndex)}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const targetPt = checkpoints[Number(event.target.value)];
                  if (targetPt) onThresholdChange(targetPt.threshold);
                }}
                disabled={readOnly || checkpoints.length <= 1}
                className="h-2 flex-1 cursor-pointer accent-signal disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Discrete persisted checkpoint slider"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-silver hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={readOnly || currentIndex < 0 || currentIndex >= checkpoints.length - 1}
                onClick={() => {
                  if (currentIndex >= 0 && currentIndex < checkpoints.length - 1) {
                    onThresholdChange(checkpoints[currentIndex + 1].threshold);
                  }
                }}
                aria-label="Next persisted checkpoint"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
            {checkpoints.length > 0 ? (
              <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">
                <span>{checkpoints[0].threshold.toFixed(3)} / lowest</span>
                <span>{checkpoints[checkpoints.length - 1].threshold.toFixed(3)} / highest</span>
              </div>
            ) : null}
          </div>

          <div className="mt-8 grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Frozen policy</p>
              <p className="mt-2 font-mono text-lg">{model.defaultThreshold.toFixed(3)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Min cost</p>
              <p className="mt-2 font-mono text-lg">{recommendations.minimumCost.metrics.threshold.toFixed(3)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Max F1 (internal)</p>
              <p className="mt-2 font-mono text-lg">
                {recommendations.maximumF1 && recommendations.maximumF1.isAvailable !== false
                  ? recommendations.maximumF1.metrics.threshold.toFixed(3)
                  : "Unavailable"}
              </p>
            </div>
          </div>
        </div>

        <div className="border-y border-line bg-surface p-5 sm:p-7">
          <div>
            <label htmlFor="threshold-checkpoint-select" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Select persisted checkpoint
            </label>
            <Select
              id="threshold-checkpoint-select"
              value={activeCheckpoint ? activeCheckpoint.threshold.toFixed(4) : ""}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const valKey = event.target.value;
                const match = checkpoints.find((pt) => pt.threshold.toFixed(4) === valKey);
                if (match) onThresholdChange(match.threshold);
              }}
              disabled={readOnly || checkpoints.length === 0}
              options={checkpoints.map((pt) => {
                const isPtFrozen = pt.threshold.toFixed(4) === frozenTargetKey && pt.scope === "validation";
                const scopeTag = pt.scope === "validation" ? "[External validation]" : "[Internal policy selection]";
                const policyTag = isPtFrozen ? " (Frozen Evaluation Policy)" : "";
                return {
                  value: pt.threshold.toFixed(4),
                  label: `Threshold ${pt.threshold.toFixed(3)}${policyTag} ${scopeTag} — Recall ${(pt.recall * 100).toFixed(1)}%, Cost ${pt.businessCost.toFixed(0)}`,
                };
              })}
            />
          </div>

          <div className="mt-7 border-t border-line pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Recommended operating checkpoints</p>
            <div className="mt-4 divide-y divide-line">
              {[recommendations.minimumCost, recommendations.maximumF1, recommendations.default].map((recommendation) => {
                const isAvailable = recommendation.isAvailable !== false;
                const isSelected = Boolean(
                  isAvailable &&
                  activeCheckpoint &&
                  activeCheckpoint.threshold.toFixed(4) === recommendation.metrics.threshold.toFixed(4) &&
                  (!recommendation.scope || activeCheckpoint.scope === recommendation.scope),
                );
                return (
                  <button
                    key={recommendation.kind}
                    type="button"
                    disabled={!isAvailable}
                    className={`flex w-full items-center justify-between gap-4 py-3.5 text-left transition-colors ${!isAvailable ? "opacity-50 cursor-not-allowed" : "hover:bg-canvas-deep/60"} ${isSelected ? "text-signal font-medium" : "text-ink"}`}
                    onClick={() => {
                      if (isAvailable) onSelectRecommendation(recommendation);
                    }}
                  >
                    <span>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium">{recommendation.label}</span>
                        {recommendation.scopeLabel ? (
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                            [{recommendation.scopeLabel}]
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">{recommendation.explanation}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm">
                      {isAvailable ? recommendation.metrics.threshold.toFixed(3) : "Unavailable"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">
        Exploration is locked to 201 measured external validation checkpoints. Displayed metrics reflect validation results without modifying the frozen candidate policy at 0.115 (selected from internal OOF policy evidence). Candidate model is not production approved (promotions: 0).
      </p>
    </section>
  );
}

export { ThresholdControl };

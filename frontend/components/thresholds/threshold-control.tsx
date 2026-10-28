"use client";

import * as React from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, Target } from "lucide-react";
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
      return [{
        threshold: model.defaultThreshold,
        precision: 0,
        recall: 0,
        f1Score: 0,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        truePositiveCount: 0,
        trueNegativeCount: 0,
        predictedFailureCount: 0,
        totalSamples: 0,
        falsePositiveCost: 0,
        falseNegativeCost: 0,
        businessCost: 0,
        source: "frozen_default",
        scope: "validation",
      }];
    }
    const map = new Map<number, (typeof raw)[0]>();
    for (const pt of raw) {
      map.set(Number(pt.threshold.toFixed(4)), pt);
    }
    return Array.from(map.values()).sort((a, b) => a.threshold - b.threshold);
  }, [model.thresholdCurve, model.defaultThreshold]);

  const currentIndex = React.useMemo(() => {
    const exact = checkpoints.findIndex((pt) => Math.abs(pt.threshold - threshold) < 0.001);
    if (exact >= 0) return exact;
    return checkpoints.reduce(
      (best, pt, i) =>
        Math.abs(pt.threshold - threshold) < Math.abs(checkpoints[best].threshold - threshold) ? i : best,
      0,
    );
  }, [checkpoints, threshold]);

  const activeCheckpoint = checkpoints[currentIndex] ?? checkpoints[0];
  const isFrozenPolicy = Math.abs(activeCheckpoint.threshold - model.defaultThreshold) < 0.005;

  return (
    <section id="threshold-control" aria-labelledby="threshold-control-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Threshold control</p>
          <h2 id="threshold-control-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Explore persisted checkpoints.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            {isFrozenPolicy
              ? "Displaying the frozen Phase 9 evaluation policy (threshold 0.115). All metrics correspond directly to this approved validation checkpoint."
              : "Exploratory validation checkpoint active. Metrics represent genuine persisted validation evidence for this operating point without modifying the frozen candidate policy."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isFrozenPolicy ? "success" : "signal"}>
            {isFrozenPolicy ? <CheckCircle2 aria-hidden="true" className="size-3" /> : <Target aria-hidden="true" className="size-3" />}
            {isFrozenPolicy ? "Frozen policy (0.115)" : `Exploratory checkpoint (${activeCheckpoint.threshold.toFixed(3)})`}
          </Badge>
          {!isFrozenPolicy ? (
            <Button size="sm" variant="outline" onClick={onReset}>
              <RotateCcw aria-hidden="true" className="size-3" /> Reset to frozen ({model.defaultThreshold.toFixed(3)})
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Selected checkpoint threshold</p>
              <p className="mt-4 font-display text-6xl leading-none tracking-[-0.08em] text-signal">{activeCheckpoint.threshold.toFixed(3)}</p>
            </div>
            {isFrozenPolicy ? (
              <Badge variant="dark">Approved frozen policy</Badge>
            ) : (
              <Button size="sm" variant="ghost" className="text-silver hover:bg-white/10 hover:text-white" onClick={onReset}>
                <RotateCcw aria-hidden="true" className="size-3.5" /> Reset to frozen
              </Button>
            )}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between text-xs text-silver/80">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Discrete checkpoint stepper</span>
              <span className="font-mono text-[10px]">Checkpoint {currentIndex + 1} of {checkpoints.length}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-silver hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={readOnly || currentIndex <= 0}
                onClick={() => onThresholdChange(checkpoints[currentIndex - 1].threshold)}
                aria-label="Previous validation checkpoint"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Button>
              <input
                id="threshold-range"
                type="range"
                min="0"
                max={Math.max(0, checkpoints.length - 1)}
                step="1"
                value={currentIndex}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  const targetPt = checkpoints[Number(event.target.value)];
                  if (targetPt) onThresholdChange(targetPt.threshold);
                }}
                disabled={readOnly || checkpoints.length <= 1}
                className="h-2 flex-1 cursor-pointer accent-signal disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Discrete validation checkpoint slider"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-silver hover:bg-white/10 hover:text-white disabled:opacity-30"
                disabled={readOnly || currentIndex >= checkpoints.length - 1}
                onClick={() => onThresholdChange(checkpoints[currentIndex + 1].threshold)}
                aria-label="Next validation checkpoint"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-silver/60">
              <span>{checkpoints[0].threshold.toFixed(3)} / lowest</span>
              <span>{checkpoints[checkpoints.length - 1].threshold.toFixed(3)} / highest</span>
            </div>
          </div>

          <div className="mt-8 grid gap-4 border-t border-white/15 pt-5 sm:grid-cols-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Default (Frozen)</p>
              <p className="mt-2 font-mono text-lg">{model.defaultThreshold.toFixed(3)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Min cost</p>
              <p className="mt-2 font-mono text-lg">{recommendations.minimumCost.metrics.threshold.toFixed(3)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">Max F1</p>
              <p className="mt-2 font-mono text-lg">{recommendations.maximumF1.metrics.threshold.toFixed(3)}</p>
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
              value={String(activeCheckpoint.threshold)}
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                const val = Number(event.target.value);
                const match = checkpoints.find((pt) => Math.abs(pt.threshold - val) < 0.0001);
                if (match) onThresholdChange(match.threshold);
              }}
              disabled={readOnly}
              options={checkpoints.map((pt) => {
                const isFrozen = Math.abs(pt.threshold - model.defaultThreshold) < 0.005;
                return {
                  value: String(pt.threshold),
                  label: `Threshold ${pt.threshold.toFixed(3)}${isFrozen ? " (Frozen Policy)" : ""} — Recall ${(pt.recall * 100).toFixed(1)}%, Cost ${pt.businessCost.toFixed(0)}`,
                };
              })}
            />
          </div>

          <div className="mt-7 border-t border-line pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Recommended operating checkpoints</p>
            <div className="mt-4 divide-y divide-line">
              {[recommendations.minimumCost, recommendations.maximumF1, recommendations.default].map((recommendation) => {
                const isSelected = Math.abs(activeCheckpoint.threshold - recommendation.metrics.threshold) < 0.005;
                return (
                  <button
                    key={recommendation.kind}
                    type="button"
                    className={`flex w-full items-center justify-between gap-4 py-3.5 text-left transition-colors hover:bg-canvas-deep/60 ${isSelected ? "text-signal font-medium" : "text-ink"}`}
                    onClick={() => onSelectRecommendation(recommendation)}
                  >
                    <span>
                      <span className="block text-sm font-medium">{recommendation.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-muted">{recommendation.explanation}</span>
                    </span>
                    <span className="shrink-0 font-mono text-sm">{recommendation.metrics.threshold.toFixed(3)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">
        Exploration is locked to genuine persisted validation checkpoints. Metrics represent offline validation evidence and are not continuously recomputed. Candidate operational decision policy remains strictly frozen at 0.115.
      </p>
    </section>
  );
}

export { ThresholdControl };

"use client";

import { ShieldCheck } from "lucide-react";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { DatasetOverview } from "@/components/dashboard/dataset-overview";
import { ModelPerformance } from "@/components/dashboard/model-performance";
import { BusinessImpact } from "@/components/dashboard/business-impact";
import { RecentExperiments } from "@/components/dashboard/recent-experiments";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { DashboardSnapshot } from "@/types";

interface OverviewDashboardProps {
  snapshot: DashboardSnapshot;
}

function OverviewDashboard({ snapshot }: OverviewDashboardProps) {
  const candidate = snapshot.candidateValidation;
  const matrix = candidate?.confusionMatrix;

  return (
    <div className="mx-auto max-w-[1600px]">
      <KpiStrip snapshot={snapshot} />

      {/* Candidate Lifecycle & Historical Validation Evidence */}
      <section aria-labelledby="candidate-lifecycle-heading" className="border-b border-line bg-surface px-5 py-6 sm:px-8 lg:px-10">
        <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Model evaluation overview</p>
            <h2 id="candidate-lifecycle-heading" className="mt-2 font-display text-2xl tracking-[-0.03em] text-ink sm:text-3xl">
              Phase 9 Validation Candidate — CatBoost Native Imbalance
            </h2>
            <p className="mt-2 text-xs leading-5 text-muted">
              Evaluated on frozen validation split with isotonic probability calibration (threshold {snapshot.candidateThreshold?.toFixed(3) ?? "0.115"}). Distinct from top uncalibrated historical run. Pending operational deployment signoff.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="signal">Validation scope</Badge>
            <Badge variant="neutral">Status / Evaluated (Unapproved)</Badge>
            {snapshot.candidateThreshold !== undefined ? (
              <Badge variant="neutral">Frozen threshold {snapshot.candidateThreshold.toFixed(3)}</Badge>
            ) : null}
          </div>
        </div>

        {candidate && matrix ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="border-t border-charcoal bg-charcoal p-5 text-white sm:p-6">
              <div className="flex items-center justify-between border-b border-white/15 pb-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver">Selected validation candidate</p>
                  <p className="mt-1 font-display text-2xl text-white">{candidate.modelName}</p>
                </div>
                <ShieldCheck aria-hidden="true" className="size-5 text-signal" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-silver/65">PR-AUC</p>
                  <p className="mt-1 font-mono text-xl text-signal">{formatPercent(candidate.prAuc)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-silver/65">ROC-AUC</p>
                  <p className="mt-1 font-mono text-xl text-white">{candidate.rocAuc ? formatPercent(candidate.rocAuc) : "—"}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-silver/65">Precision</p>
                  <p className="mt-1 font-mono text-xl text-white">{formatPercent(candidate.precision)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-silver/65">Recall</p>
                  <p className="mt-1 font-mono text-xl text-signal">{formatPercent(candidate.recall)}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-line bg-canvas-deep p-5 sm:p-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Validation confusion matrix</p>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Threshold {candidate.threshold.toFixed(3)}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <div className="bg-surface p-3 border border-line">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">True Negative (TN)</p>
                  <p className="mt-1 font-mono text-lg font-medium text-ink">{formatNumber(matrix.trueNegative)}</p>
                </div>
                <div className="bg-surface p-3 border border-line">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">False Positive (FP)</p>
                  <p className="mt-1 font-mono text-lg font-medium text-ink">{formatNumber(matrix.falsePositive)}</p>
                </div>
                <div className="bg-surface p-3 border border-line">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-signal">False Negative (FN)</p>
                  <p className="mt-1 font-mono text-lg font-medium text-signal">{formatNumber(matrix.falseNegative)}</p>
                </div>
                <div className="bg-surface p-3 border border-line">
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">True Positive (TP)</p>
                  <p className="mt-1 font-mono text-lg font-medium text-ink">{formatNumber(matrix.truePositive)}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      {snapshot.dataset && snapshot.distribution ? (
        <DatasetOverview snapshot={snapshot} />
      ) : (
        <EmptyState
          title="Dataset distribution unavailable"
          description="The dashboard returned dataset metadata, but no persisted class-profile artifact is available for the active dataset."
        />
      )}

      {snapshot.models.length ? (
        <ModelPerformance models={snapshot.models} />
      ) : (
        <EmptyState
          title="Validation metrics unavailable"
          description="No persisted validation metrics are available in the active registry. Synthetic and official-test results are not substituted."
        />
      )}

      {snapshot.businessImpact ? (
        <BusinessImpact impact={snapshot.businessImpact} />
      ) : (
        <EmptyState
          title="Business impact unavailable"
          description="The dashboard does not have threshold confusion counts for a persisted validation result."
        />
      )}

      <RecentExperiments experiments={snapshot.recentExperiments} models={snapshot.models} />
    </div>
  );
}

export { OverviewDashboard };

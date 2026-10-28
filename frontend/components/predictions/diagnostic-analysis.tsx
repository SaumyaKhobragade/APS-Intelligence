"use client";

import { Activity, AlertTriangle, FileSearch, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import type { FeatureContribution, PredictionResult } from "@/types";

interface DiagnosticAnalysisProps {
  result?: PredictionResult;
  readings: Record<string, number | null>;
}

function DiagnosticAnalysis({ result, readings }: DiagnosticAnalysisProps) {
  if (!result) return null;
  const entries = Object.entries(readings);
  const provided = entries.filter(([, value]) => value !== null).slice(0, 8);
  const missing = entries.filter(([, value]) => value === null).length;
  const contributions = result.featureContributions ?? [];

  return (
    <section id="diagnostics" aria-labelledby="diagnostics-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Diagnostic analysis</p>
          <h2 id="diagnostics-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">
            Show the inputs, not invented causes.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Submitted sensor values and missingness are inspectable below. Feature importance rankings reflect global model contributions when provided by the inference endpoint.
          </p>
        </div>
        <Badge variant="neutral">
          <FileSearch aria-hidden="true" className="size-3" /> Evidence boundary
        </Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_1fr]">
        <div className="border-t border-charcoal bg-surface">
          <div className="flex items-center gap-3 border-b border-line px-4 py-4">
            <Activity aria-hidden="true" className="size-4 text-signal" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Submitted sensor readings</p>
              <p className="mt-1 text-sm text-ink">
                First {provided.length} provided values / {entries.length} fields submitted
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            {provided.map(([featureId, value]) => (
              <div key={featureId} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="font-mono text-xs text-ink">{featureId}</span>
                <span className="font-mono text-xs text-muted">{String(value)}</span>
              </div>
            ))}
          </div>
          {missing ? (
            <p className="flex items-start gap-2 border-t border-line px-4 py-4 text-xs leading-5 text-muted">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3 shrink-0 text-signal" />
              {missing} missing values remain visible to the operator and are not silently imputed in the frontend.
            </p>
          ) : null}
        </div>

        <div>
          {contributions.length ? (
            <ContributionList contributions={contributions} />
          ) : (
            <EmptyState
              title="Feature explanations unavailable"
              description="No backend-provided SHAP or coefficient explanation was returned for this prediction request. Global feature contributions will render here when returned by the backend."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function ContributionList({ contributions }: { contributions: FeatureContribution[] }) {
  return (
    <div className="border-t border-charcoal bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-4 py-4">
        <ScanLine aria-hidden="true" className="size-4 text-signal" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Backend feature contributions</p>
          <p className="mt-1 text-sm text-ink">Global model feature importance</p>
        </div>
      </div>
      {contributions.map((contribution) => (
        <div key={contribution.featureId} className="flex items-center gap-4 border-b border-line px-4 py-4">
          <span className={`size-2 ${contribution.direction === "increase_risk" ? "bg-signal" : "bg-success"}`} />
          <span className="flex-1 font-mono text-xs text-ink">{contribution.featureId}</span>
          <span className="font-mono text-xs text-muted">{contribution.contribution.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

export { DiagnosticAnalysis };

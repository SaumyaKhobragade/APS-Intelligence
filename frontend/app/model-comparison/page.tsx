"use client";

import * as React from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BusinessImpactComparison } from "@/components/models/business-impact-comparison";
import { ConfusionMatrixComparison } from "@/components/models/confusion-matrix";
import { FeatureImportanceChart } from "@/components/models/feature-importance-chart";
import { ModelDetailsPanel } from "@/components/models/model-details-panel";
import { ModelMetricsTable } from "@/components/models/model-metrics-table";
import { ModelOverview } from "@/components/models/model-overview";
import { OfficialTestEvidence } from "@/components/models/official-test-evidence";
import { PrecisionRecallChart } from "@/components/models/precision-recall-chart";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { fetchModelComparison } from "@/services/model-service";
import { fetchOfficialTestEvidence } from "@/services/historical-evidence-service";
import type { BackendOfficialTestEvidenceResponse } from "@/services/backend-contracts";
import type { ModelComparisonSnapshot } from "@/types";

export default function ModelComparisonPage() {
  const [snapshot, setSnapshot] = React.useState<ModelComparisonSnapshot | null>(null);
  const [selectedModelId, setSelectedModelId] = React.useState<string>();
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [officialTest, setOfficialTest] = React.useState<BackendOfficialTestEvidenceResponse | null>(null);
  const [officialTestError, setOfficialTestError] = React.useState<string | null>(null);
  const [officialTestLoading, setOfficialTestLoading] = React.useState(true);

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const result = await fetchModelComparison();
      setSnapshot(result);
      setSelectedModelId((current) => current && result.models.some((model) => model.modelId === current) ? current : result.models[0]?.modelId);
      setOfficialTestLoading(true);
      setOfficialTestError(null);
      try {
        setOfficialTest(await fetchOfficialTestEvidence());
      } catch (officialError) {
        setOfficialTest(null);
        setOfficialTestError(officialError instanceof Error ? officialError.message : "Official-test evidence could not be loaded.");
      } finally {
        setOfficialTestLoading(false);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Model comparison analytics could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const selectedModel = snapshot?.models.find((model) => model.modelId === selectedModelId) ?? snapshot?.models[0];

  return (
    <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated={snapshot?.lastUpdated ?? "Loading persisted model analytics"}>
      <div className="mx-auto max-w-[1600px]">
         <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Model Comparison sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#model-overview">01 / Overview</a><a className="hover:text-signal" href="#metrics-table">02 / Metrics</a><a className="hover:text-signal" href="#precision-recall">03 / Curves</a><a className="hover:text-signal" href="#confusion-matrix">04 / Errors</a><a className="hover:text-signal" href="#feature-importance">05 / Features</a><a className="hover:text-signal" href="#model-details">06 / Details</a><a className="hover:text-signal" href="#business-impact">07 / Cost</a><a className="hover:text-signal" href="#official-test">08 / Official test</a></nav><Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh comparison</Button></div></section>
        {isLoading ? <p className="mx-5 my-8 border border-line bg-surface px-6 py-10 text-center text-sm text-muted sm:mx-8 lg:mx-10" role="status">Loading persisted validation analytics…</p> : null}
        {error ? <div className="mx-5 my-8 sm:mx-8 lg:mx-10"><ErrorState title="Model comparison unavailable" description={error} onRetry={() => void load()} /></div> : null}
        {!isLoading && !error && (!snapshot || !selectedModel) ? <div className="mx-5 my-8 sm:mx-8 lg:mx-10"><EmptyState title="No compatible validation results" description="The backend returned no persisted validation comparison rows. Official-test and production results are not substituted." /></div> : null}
        {!isLoading && !error && snapshot && selectedModel ? <>
           <section className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><p className="text-sm text-ink">Evaluation scope / <span className="font-medium">{snapshot.evaluationSplit}</span></p><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Validation metrics remain separate from official-test and production scopes</p></section>
          <ModelOverview models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
          <ModelMetricsTable models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
          <PrecisionRecallChart models={snapshot.models} />
          <ConfusionMatrixComparison models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
          <FeatureImportanceChart models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
          <ModelDetailsPanel model={selectedModel} />
           <BusinessImpactComparison models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
           {officialTestLoading ? <p className="mx-5 my-8 border border-line bg-surface px-6 py-10 text-center text-sm text-muted sm:mx-8 lg:mx-10" role="status">Loading persisted official-test evidence…</p> : null}
           {officialTestError ? <div className="mx-5 my-8 sm:mx-8 lg:mx-10"><ErrorState title="Official-test evidence unavailable" description={officialTestError} onRetry={() => void load()} /></div> : null}
           {officialTest ? <OfficialTestEvidence evidence={officialTest} /> : null}
          <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Model comparison / end of view</p><p className="mt-2 text-sm text-ink">Rows retain model references, dataset fingerprints and validation scope.</p></div><Button variant="outline" asChild><a href="#model-overview">Back to overview <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
        </> : null}
      </div>
    </AppShell>
  );
}

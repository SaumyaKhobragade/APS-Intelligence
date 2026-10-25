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
import { PrecisionRecallChart } from "@/components/models/precision-recall-chart";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { getDemonstrationModelComparison } from "@/lib/model-comparison-mock-data";
import type { ModelComparisonSnapshot } from "@/types";

export default function ModelComparisonPage() {
  const [snapshot, setSnapshot] = React.useState<ModelComparisonSnapshot>(() => getDemonstrationModelComparison());
  const [selectedModelId, setSelectedModelId] = React.useState("xgboost");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const selectedModel = snapshot.models.find((model) => model.modelId === selectedModelId) ?? snapshot.models[0];

  function refreshComparison() {
    setIsRefreshing(true);
    window.setTimeout(() => {
      const refreshed = getDemonstrationModelComparison();
      const refreshedAt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date());
      setSnapshot({ ...refreshed, lastUpdated: `Demo refreshed / ${refreshedAt} UTC` });
      setIsRefreshing(false);
    }, 650);
  }

  if (!selectedModel) {
    return <AppShell><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10"><EmptyState title="No model evaluations" description="Model comparison artifacts are not available in the current demonstration snapshot." /></div></AppShell>;
  }

  return (
    <AppShell onRefresh={refreshComparison} isRefreshing={isRefreshing} lastUpdated={snapshot.lastUpdated}>
      <div className="mx-auto max-w-[1600px]">
        <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Model Comparison sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#model-overview">01 / Overview</a><a className="hover:text-signal" href="#metrics-table">02 / Metrics</a><a className="hover:text-signal" href="#precision-recall">03 / Curves</a><a className="hover:text-signal" href="#confusion-matrix">04 / Errors</a><a className="hover:text-signal" href="#feature-importance">05 / Features</a><a className="hover:text-signal" href="#model-details">06 / Details</a><a className="hover:text-signal" href="#business-impact">07 / Cost</a></nav><Button variant="ghost" size="sm" onClick={refreshComparison} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh comparison</Button></div></section>
        <section className="flex flex-col gap-3 border-b border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><p className="text-sm text-ink">Evaluation contract / <span className="font-medium">{snapshot.evaluationSplit}</span></p><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Training and evaluation data remain separate / sample artifact set</p></section>
        <ModelOverview models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
        <ModelMetricsTable models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
        <PrecisionRecallChart models={snapshot.models} />
        <ConfusionMatrixComparison models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
        <FeatureImportanceChart models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
        <ModelDetailsPanel model={selectedModel} />
        <BusinessImpactComparison models={snapshot.models} selectedModelId={selectedModel.modelId} onSelectModel={setSelectedModelId} />
        <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Model comparison / end of view</p><p className="mt-2 text-sm text-ink">Continue to threshold optimization when the backend supplies real evaluation artifacts.</p></div><Button variant="outline" asChild><a href="#model-overview">Back to overview <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
      </div>
    </AppShell>
  );
}

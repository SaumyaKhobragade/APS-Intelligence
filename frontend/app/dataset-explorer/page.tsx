"use client";

import * as React from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ClassDistribution } from "@/components/datasets/class-distribution";
import { DataQualitySummary } from "@/components/datasets/data-quality-summary";
import { DatasetOverview } from "@/components/datasets/dataset-overview";
import { DatasetUpload } from "@/components/datasets/dataset-upload";
import { FeatureAnalysis } from "@/components/datasets/feature-analysis";
import { HistoricalDatasetEvidence } from "@/components/datasets/historical-dataset-evidence";
import { PreprocessingPipeline } from "@/components/datasets/preprocessing-pipeline";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { fetchDatasetEvidenceByType, fetchDatasetExplorer } from "@/services/dataset-service";
import type { DatasetType, DatasetExplorerSnapshot } from "@/types";

export default function DatasetExplorerPage() {
  const [activeDatasetType, setActiveDatasetType] = React.useState<DatasetType>("training");
  const [snapshots, setSnapshots] = React.useState<Partial<Record<DatasetType, DatasetExplorerSnapshot>>>({});
  const [evidence, setEvidence] = React.useState<Partial<Record<DatasetType, Awaited<ReturnType<typeof fetchDatasetEvidenceByType>>>> >({});
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const activeSnapshot = snapshots[activeDatasetType];
  const activeEvidence = evidence[activeDatasetType];

  const load = React.useCallback(async (datasetType: DatasetType, refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const nextEvidence = await fetchDatasetEvidenceByType(datasetType);
      setEvidence((current) => ({ ...current, [datasetType]: nextEvidence }));
      setSnapshots((current) => ({ ...current, [datasetType]: nextEvidence.snapshot ?? undefined }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The dataset analytics could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(activeDatasetType), 0); return () => window.clearTimeout(timer); }, [activeDatasetType, load]);

  async function handleUploaded(datasetId: string) {
    setIsLoading(true);
    setError(null);
    try {
      const snapshot = await fetchDatasetExplorer(datasetId);
      if (snapshot) setSnapshots((current) => ({ ...current, training: snapshot }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The imported dataset could not be profiled.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
       <AppShell onRefresh={() => void load(activeDatasetType, true)} isRefreshing={isRefreshing} lastUpdated={activeSnapshot?.lastUpdated ?? activeEvidence?.metadata?.updatedAt ?? "No persisted dataset evidence"}>
      <div className="mx-auto max-w-[1600px]">
         <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 max-w-full overflow-x-auto no-scrollbar py-1">
              <nav aria-label="Dataset Explorer sections" className="flex items-center gap-x-5 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <a className="hover:text-signal shrink-0" href="#dataset-upload">01 / Import</a>
                <a className="hover:text-signal shrink-0" href="#dataset-overview">02 / Overview</a>
                <a className="hover:text-signal shrink-0" href="#data-quality">03 / Quality</a>
                <a className="hover:text-signal shrink-0" href="#class-distribution">04 / Classes</a>
                <a className="hover:text-signal shrink-0" href="#feature-analysis">05 / Features</a>
                <a className="hover:text-signal shrink-0" href="#preprocessing">06 / Splits</a>
              </nav>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void load(activeDatasetType, true)} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh explorer</Button>
          </div>
        </section>
        <DatasetUpload onUploaded={handleUploaded} />
         {isLoading ? <p className="mx-5 my-8 border border-line bg-surface px-6 py-10 text-center text-sm text-muted sm:mx-8 lg:mx-10" role="status">Loading persisted dataset analytics…</p> : null}
         {error ? <div className="mx-5 my-8 sm:mx-8 lg:mx-10"><ErrorState title="Dataset analytics unavailable" description={error} onRetry={() => void load(activeDatasetType)} /></div> : null}
         {!isLoading && !error && activeEvidence?.metadata ? <HistoricalDatasetEvidence metadata={activeEvidence.metadata} splitEvidence={activeEvidence.splitEvidence} availability={activeEvidence.availability} /> : null}
         {!isLoading && !error && !activeSnapshot ? <div className="mx-5 my-8 sm:mx-8 lg:mx-10"><EmptyState title={`No persisted ${activeDatasetType} profile available`} description="Dataset metadata and any historical split evidence remain available above. This page did not open or reprofile a raw source file." /></div> : null}
        {!isLoading && !error && activeSnapshot ? <>
          <DatasetOverview snapshot={activeSnapshot} onDatasetTypeChange={setActiveDatasetType} />
          <DataQualitySummary quality={activeSnapshot.quality} missingValues={activeSnapshot.missingValues} />
          <ClassDistribution distribution={activeSnapshot.classDistribution} />
          <FeatureAnalysis key={`${activeDatasetType}-${activeSnapshot.lastUpdated}`} features={activeSnapshot.features} />
          <PreprocessingPipeline stages={activeSnapshot.preprocessing} />
          <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Dataset explorer / end of view</p><p className="mt-2 text-sm text-ink">Profile, quality and split metadata are read from persisted backend artifacts.</p></div><Button variant="outline" asChild><a href="#dataset-upload">Back to import <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
        </> : null}
      </div>
    </AppShell>
  );
}

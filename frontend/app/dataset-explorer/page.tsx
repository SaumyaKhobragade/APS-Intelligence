"use client";

import * as React from "react";
import { ArrowDown, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ClassDistribution } from "@/components/datasets/class-distribution";
import { DataQualitySummary } from "@/components/datasets/data-quality-summary";
import { DatasetOverview } from "@/components/datasets/dataset-overview";
import { DatasetUpload } from "@/components/datasets/dataset-upload";
import { FeatureAnalysis } from "@/components/datasets/feature-analysis";
import { PreprocessingPipeline } from "@/components/datasets/preprocessing-pipeline";
import { Button } from "@/components/ui/button";
import { getDemonstrationDatasetExplorer } from "@/lib/dataset-mock-data";
import type { DatasetType, DatasetExplorerSnapshot } from "@/types";

export default function DatasetExplorerPage() {
  const [activeDatasetType, setActiveDatasetType] = React.useState<DatasetType>("training");
  const [snapshots, setSnapshots] = React.useState<Record<DatasetType, DatasetExplorerSnapshot>>(() => getDemonstrationDatasetExplorer());
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const activeSnapshot = snapshots[activeDatasetType];

  function updateActiveDatasetType(datasetType: DatasetType) {
    setActiveDatasetType(datasetType);
  }

  function handleUploaded(datasetType: DatasetType) {
    setActiveDatasetType(datasetType);
    setSnapshots((current) => ({
      ...current,
      [datasetType]: {
        ...current[datasetType],
        file: { ...current[datasetType].file, status: "ready" },
        dataset: { ...current[datasetType].dataset, status: "ready" },
        lastUpdated: `Demo upload staged / ${datasetType}`,
      },
    }));
  }

  function refreshExplorer() {
    setIsRefreshing(true);
    window.setTimeout(() => {
      const freshSnapshots = getDemonstrationDatasetExplorer();
      const refreshedAt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date());
      freshSnapshots[activeDatasetType].lastUpdated = `Demo refreshed / ${refreshedAt} UTC`;
      setSnapshots(freshSnapshots);
      setIsRefreshing(false);
    }, 650);
  }

  return (
    <AppShell onRefresh={refreshExplorer} isRefreshing={isRefreshing} lastUpdated={activeSnapshot.lastUpdated}>
      <div className="mx-auto max-w-[1600px]">
        <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Dataset Explorer sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <a className="hover:text-signal" href="#dataset-upload">01 / Upload</a>
              <a className="hover:text-signal" href="#dataset-overview">02 / Overview</a>
              <a className="hover:text-signal" href="#data-quality">03 / Quality</a>
              <a className="hover:text-signal" href="#class-distribution">04 / Classes</a>
              <a className="hover:text-signal" href="#feature-analysis">05 / Features</a>
              <a className="hover:text-signal" href="#preprocessing">06 / Pipeline</a>
            </nav>
            <Button variant="ghost" size="sm" onClick={refreshExplorer} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh explorer</Button>
          </div>
        </section>

        <DatasetUpload onUploaded={handleUploaded} />
        <DatasetOverview snapshot={activeSnapshot} onDatasetTypeChange={updateActiveDatasetType} />
        <DataQualitySummary quality={activeSnapshot.quality} missingValues={activeSnapshot.missingValues} />
        <ClassDistribution distribution={activeSnapshot.classDistribution} />
        <FeatureAnalysis key={activeDatasetType} features={activeSnapshot.features} />
        <PreprocessingPipeline stages={activeSnapshot.preprocessing} />

        <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Dataset explorer / end of view</p><p className="mt-2 text-sm text-ink">Continue when the backend contract is ready for real profiling responses.</p></div>
          <Button variant="outline" asChild><a href="#dataset-upload">Back to upload <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button>
        </section>
      </div>
    </AppShell>
  );
}

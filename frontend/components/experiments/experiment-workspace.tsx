"use client";

import * as React from "react";
import { ArrowDown, Download, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ExperimentComparison } from "@/components/experiments/experiment-comparison";
import { ExperimentConfiguration } from "@/components/experiments/experiment-configuration";
import { ExperimentCreation } from "@/components/experiments/experiment-creation";
import { ExperimentDetails } from "@/components/experiments/experiment-details";
import { ExperimentFilters } from "@/components/experiments/experiment-filters";
import { ExperimentTable, type SortKey } from "@/components/experiments/experiment-table";
import { ExperimentTrends } from "@/components/experiments/experiment-trends";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { getDemonstrationExperimentRegistry } from "@/lib/experiment-mock-data";
import { downloadTextFile, experimentComparisonToCsv, experimentMetricsToCsv, experimentToJson, experimentsToCsv, renderExperimentReportHtml } from "@/lib/experiment-exports";
import { demonstrationPredictionModels } from "@/lib/prediction-mock-data";
import type { ExperimentCreationRequest, ExperimentHistoryRecord, ExperimentRegistrySnapshot } from "@/types";

function ExperimentWorkspace() {
  const [snapshot, setSnapshot] = React.useState<ExperimentRegistrySnapshot>(() => getDemonstrationExperimentRegistry());
  const [search, setSearch] = React.useState("");
  const [model, setModel] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("createdAt");
  const [descending, setDescending] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | undefined>(snapshot.experiments[0]?.id);
  const [comparisonIds, setComparisonIds] = React.useState<string[]>(snapshot.experiments.slice(0, 2).map((experiment) => experiment.id));
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [savedConfiguration, setSavedConfiguration] = React.useState<ExperimentCreationRequest | undefined>();
  const pageSize = 5;

  const filtered = snapshot.experiments.filter((experiment) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = query.length === 0 || experiment.id.toLowerCase().includes(query) || experiment.name.toLowerCase().includes(query);
    const matchesModel = model === "all" || experiment.modelId === model;
    const matchesStatus = status === "all" || experiment.status === status;
    const matchesType = type === "all" || experiment.experimentType === type;
    const createdDate = experiment.createdAt.slice(0, 10);
    const matchesFrom = dateFrom.length === 0 || createdDate >= dateFrom;
    const matchesTo = dateTo.length === 0 || createdDate <= dateTo;
    return matchesSearch && matchesModel && matchesStatus && matchesType && matchesFrom && matchesTo;
  }).sort((a, b) => {
    const value = (experiment: ExperimentHistoryRecord): number | string => {
      const metrics = experiment.evaluationResults;
      if (sortKey === "createdAt") return experiment.createdAt;
      if (sortKey === "prAuc") return metrics.prAuc ?? Number.NEGATIVE_INFINITY;
      if (sortKey === "precision") return metrics.precision ?? Number.NEGATIVE_INFINITY;
      if (sortKey === "recall") return metrics.recall ?? Number.NEGATIVE_INFINITY;
      if (sortKey === "f1Score") return metrics.f1Score ?? Number.NEGATIVE_INFINITY;
      if (sortKey === "businessCost") return metrics.businessImpact?.estimatedCost ?? Number.POSITIVE_INFINITY;
      return metrics.classificationThreshold ?? Number.NEGATIVE_INFINITY;
    };
    const left = value(a);
    const right = value(b);
    if (typeof left === "string" && typeof right === "string") return left.localeCompare(right) * (descending ? -1 : 1);
    return (Number(left) - Number(right)) * (descending ? -1 : 1);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = snapshot.experiments.find((experiment) => experiment.id === selectedId) ?? snapshot.experiments[0];

  function updateFilter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  function handleSort(nextKey: SortKey) { if (nextKey === sortKey) setDescending((value) => !value); else { setSortKey(nextKey); setDescending(nextKey === "createdAt"); } setPage(1); }
  function resetFilters() { setSearch(""); setModel("all"); setStatus("all"); setType("all"); setDateFrom(""); setDateTo(""); setPage(1); }
  function refreshWorkspace() { setIsRefreshing(true); window.setTimeout(() => { setSnapshot(getDemonstrationExperimentRegistry()); setIsRefreshing(false); }, 650); }
  function selectExperiment(experiment: ExperimentHistoryRecord) { setSelectedId(experiment.id); document.getElementById("experiment-details")?.scrollIntoView({ behavior: "smooth" }); }
  function exportRegistry() { downloadTextFile("aps-experiment-registry.csv", experimentsToCsv(filtered), "text/csv;charset=utf-8"); }
  function exportComparison() { const records = comparisonIds.map((id) => snapshot.experiments.find((experiment) => experiment.id === id)).filter((experiment): experiment is ExperimentHistoryRecord => Boolean(experiment)); downloadTextFile("aps-experiment-comparison.csv", experimentComparisonToCsv(records), "text/csv;charset=utf-8"); }
  function exportSelectedJson() { if (selected) downloadTextFile(`${selected.id}.json`, experimentToJson(selected), "application/json;charset=utf-8"); }
  function exportSelectedCsv() { if (selected) downloadTextFile(`${selected.id}-metrics.csv`, experimentMetricsToCsv(selected), "text/csv;charset=utf-8"); }
  function exportSelectedPdf() { if (selected) { const reportWindow = window.open("", "_blank", "noopener,noreferrer"); if (reportWindow) { reportWindow.document.write(renderExperimentReportHtml(selected)); reportWindow.document.close(); } } }
  function exportConfiguration() { if (selected) downloadTextFile(`${selected.id}-configuration.json`, JSON.stringify({ source: "Demonstration record", configuration: selected.details.configurationSnapshot }, null, 2), "application/json;charset=utf-8"); }

  if (!selected) return <AppShell><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10"><EmptyState title="No experiment records" description="Experiment history is unavailable in the current demonstration snapshot." /></div></AppShell>;

  return (
    <AppShell onRefresh={refreshWorkspace} isRefreshing={isRefreshing} lastUpdated={snapshot.lastUpdated}>
      <div className="mx-auto max-w-[1600px]">
        <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Experiment History sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#experiment-registry">01 / Registry</a><a className="hover:text-signal" href="#experiment-filters">02 / Filters</a><a className="hover:text-signal" href="#experiment-details">04 / Details</a><a className="hover:text-signal" href="#experiment-comparison">05 / Compare</a><a className="hover:text-signal" href="#experiment-trends">06 / Trends</a><a className="hover:text-signal" href="#experiment-configuration">07 / Reproduce</a><a className="hover:text-signal" href="#experiment-creation">08 / Create</a></nav><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={exportRegistry}><Download aria-hidden="true" className="size-3.5" /> Export registry CSV</Button><Button variant="outline" size="sm" onClick={exportComparison} disabled={comparisonIds.length < 2}><Download aria-hidden="true" className="size-3.5" /> Export comparison CSV</Button><Button variant="ghost" size="sm" onClick={refreshWorkspace} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh registry</Button></div></div></section>
        <section id="experiment-registry" className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10 lg:py-12"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Experiment registry</p><h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Every run leaves a trace.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Search, filter and reopen demonstration experiments across model evaluation, threshold selection and calibration review.</p></div><div className="flex flex-wrap items-center gap-3"><Badge variant="signal">{filtered.length} matching records</Badge><Badge variant="success">Demonstration only</Badge></div></div><div className="mt-8"><ExperimentTable experiments={pageItems} selectedId={selectedId} sortKey={sortKey} descending={descending} onSort={handleSort} onSelect={selectExperiment} /></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Page {safePage} / {totalPages} · {filtered.length} records</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></section>
        <ExperimentFilters experiments={snapshot.experiments} search={search} model={model} status={status} type={type} dateFrom={dateFrom} dateTo={dateTo} onSearchChange={(value) => updateFilter(setSearch, value)} onModelChange={(value) => updateFilter(setModel, value)} onStatusChange={(value) => updateFilter(setStatus, value)} onTypeChange={(value) => updateFilter(setType, value)} onDateFromChange={(value) => updateFilter(setDateFrom, value)} onDateToChange={(value) => updateFilter(setDateTo, value)} onReset={resetFilters} />
        <ExperimentDetails experiment={selected} onExportJson={exportSelectedJson} onExportCsv={exportSelectedCsv} onExportPdf={exportSelectedPdf} />
        <ExperimentComparison experiments={snapshot.experiments} selectedIds={comparisonIds} onSelectionChange={setComparisonIds} />
        <ExperimentTrends experiments={snapshot.experiments} />
        <ExperimentConfiguration configuration={selected.details.configurationSnapshot} onExport={exportConfiguration} />
        <ExperimentCreation models={demonstrationPredictionModels} onSave={(request) => setSavedConfiguration(request)} />
        {savedConfiguration ? <section className="border-b border-line bg-signal-wash/40 px-5 py-6 sm:px-8 lg:px-10"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Saved locally / not executed</p><p className="mt-2 text-sm text-ink">{savedConfiguration.name} is ready for a future backend run using {savedConfiguration.modelId} at threshold {savedConfiguration.classificationThreshold.toFixed(2)}.</p></section> : null}
        <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Experiment history / end of view</p><p className="mt-2 text-sm text-ink">Use the exported configuration and report as a reviewable handoff, not as proof of production readiness.</p></div><Button variant="outline" asChild><a href="#experiment-registry">Back to registry <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
      </div>
    </AppShell>
  );
}

export { ExperimentWorkspace };

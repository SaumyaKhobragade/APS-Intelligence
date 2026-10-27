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
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { fetchExperiment, fetchExperiments, createExperiment, downloadExperimentCsv, downloadExperimentJson, downloadExperimentPdf } from "@/services/experiment-service";
import type { ExperimentCreationRequest, ExperimentHistoryRecord, ExperimentRegistrySnapshot, PredictionModelOption } from "@/types";

function ExperimentWorkspace() {
  const [snapshot, setSnapshot] = React.useState<ExperimentRegistrySnapshot | null>(null);
  const [search, setSearch] = React.useState("");
  const [model, setModel] = React.useState("all");
  const [strategy, setStrategy] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [type, setType] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("createdAt");
  const [descending, setDescending] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string>();
  const [comparisonIds, setComparisonIds] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pageSize = 5;

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      const next = await fetchExperiments();
      setSnapshot(next);
      const first = next.experiments[0];
      setSelectedId((current) => current && next.experiments.some((experiment) => experiment.id === current) ? current : first?.id);
      setComparisonIds((current) => current.length ? current.filter((id) => next.experiments.some((experiment) => experiment.id === id)) : next.experiments.slice(0, 2).map((experiment) => experiment.id));
      if (first) {
        const detail = await fetchExperiment(first.id);
        setSnapshot((current) => current ? { ...current, experiments: current.experiments.map((item) => item.id === detail.id ? detail : item) } : current);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Experiment history could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const experiments = snapshot?.experiments ?? [];
  const filtered = experiments.filter((experiment) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || experiment.id.toLowerCase().includes(query) || experiment.name.toLowerCase().includes(query);
    return matchesSearch && (model === "all" || experiment.modelId === model) && (strategy === "all" || experiment.strategy === strategy) && (status === "all" || experiment.status === status) && (type === "all" || experiment.experimentType === type) && (!dateFrom || experiment.createdAt.slice(0, 10) >= dateFrom) && (!dateTo || experiment.createdAt.slice(0, 10) <= dateTo);
  }).sort((a, b) => {
    const value = (item: ExperimentHistoryRecord): number | string => sortKey === "createdAt" ? item.createdAt : sortKey === "prAuc" ? item.evaluationResults.prAuc ?? Number.NEGATIVE_INFINITY : sortKey === "precision" ? item.evaluationResults.precision ?? Number.NEGATIVE_INFINITY : sortKey === "recall" ? item.evaluationResults.recall ?? Number.NEGATIVE_INFINITY : sortKey === "f1Score" ? item.evaluationResults.f1Score ?? Number.NEGATIVE_INFINITY : sortKey === "businessCost" ? item.evaluationResults.businessImpact?.estimatedCost ?? Number.POSITIVE_INFINITY : item.evaluationResults.classificationThreshold ?? Number.NEGATIVE_INFINITY;
    const left = value(a); const right = value(b);
    return (typeof left === "string" && typeof right === "string" ? left.localeCompare(right) : Number(left) - Number(right)) * (descending ? -1 : 1);
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selected = experiments.find((experiment) => experiment.id === selectedId) ?? experiments[0];
  const modelOptions: PredictionModelOption[] = Array.from(new Map(experiments.map((experiment) => [experiment.modelId, experiment])).values()).map((experiment) => ({ modelId: experiment.modelId, modelName: experiment.modelName, availability: "not_loaded", availabilityNote: "Experiment records are not inference approvals.", prAuc: experiment.evaluationResults.prAuc, defaultThreshold: experiment.evaluationResults.classificationThreshold ?? 0.5 }));

  async function selectExperiment(experiment: ExperimentHistoryRecord) {
    setSelectedId(experiment.id);
    try {
      const detail = await fetchExperiment(experiment.id);
      setSnapshot((current) => current ? { ...current, experiments: current.experiments.map((item) => item.id === detail.id ? detail : item) } : current);
    } catch (detailError) { setError(detailError instanceof Error ? detailError.message : "The experiment details could not be loaded."); }
    document.getElementById("experiment-details")?.scrollIntoView({ behavior: "smooth" });
  }
  function handleSort(nextKey: SortKey) { if (nextKey === sortKey) setDescending((value) => !value); else { setSortKey(nextKey); setDescending(nextKey === "createdAt"); } setPage(1); }
  function updateFilter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }
  function resetFilters() { setSearch(""); setModel("all"); setStrategy("all"); setStatus("all"); setType("all"); setDateFrom(""); setDateTo(""); setPage(1); }
  async function saveConfiguration(request: ExperimentCreationRequest) { try { await createExperiment(request); await load(true); } catch (creationError) { setError(creationError instanceof Error ? creationError.message : "The experiment could not be queued."); } }

  if (!isLoading && (error || !selected)) return <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated={snapshot?.lastUpdated ?? "Experiment history unavailable"}><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10">{error ? <ErrorState title="Experiment history unavailable" description={error} onRetry={() => void load()} /> : <EmptyState title="No persisted experiment records" description="The backend is connected, but the active registry contains no experiment runs." />}</div></AppShell>;
  if (!selected) return <AppShell><div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10"><p role="status" className="border border-line bg-surface px-6 py-10 text-center text-sm text-muted">Loading persisted experiment history…</p></div></AppShell>;

   const canExport = selected.source !== "historical";
   return <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated={snapshot?.lastUpdated ?? "Persisted historical evidence"}><div className="mx-auto max-w-[1600px]">
     <section className="border-b border-line px-5 py-5 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><nav aria-label="Experiment History sections" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><a className="hover:text-signal" href="#experiment-registry">01 / Registry</a><a className="hover:text-signal" href="#experiment-filters">02 / Filters</a><a className="hover:text-signal" href="#experiment-details">04 / Details</a><a className="hover:text-signal" href="#experiment-comparison">05 / Compare</a><a className="hover:text-signal" href="#experiment-trends">06 / Trends</a><a className="hover:text-signal" href="#experiment-configuration">07 / Evidence</a></nav><div className="flex flex-wrap gap-2">{canExport ? <><Button variant="outline" size="sm" onClick={() => void downloadExperimentJson("experiment", selected.id)}><Download aria-hidden="true" className="size-3.5" /> Export JSON</Button><Button variant="outline" size="sm" onClick={() => void downloadExperimentCsv("experiment", selected.id)}><Download aria-hidden="true" className="size-3.5" /> Export CSV</Button><Button variant="signal" size="sm" onClick={() => void downloadExperimentPdf("experiment", selected.id)}><Download aria-hidden="true" className="size-3.5" /> PDF report</Button></> : <span className="border border-line-strong px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Historical evidence / read-only</span>}<Button variant="ghost" size="sm" onClick={() => void load(true)} disabled={isRefreshing}><RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh registry</Button></div></div></section>
    <section id="experiment-registry" className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10"><div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Experiment registry</p><h2 className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Every run leaves a trace.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Search, filter and reopen persisted experiments with their dataset and configuration fingerprints.</p></div><div className="flex flex-wrap items-center gap-3"><Badge variant="signal">{filtered.length} matching records</Badge><Badge variant="success">Backend registry</Badge></div></div><div className="mt-8"><ExperimentTable experiments={pageItems} selectedId={selectedId} sortKey={sortKey} descending={descending} onSort={handleSort} onSelect={(experiment) => void selectExperiment(experiment)} /></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Page {safePage} / {totalPages} · {filtered.length} records</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div></section>
     <ExperimentFilters experiments={experiments} search={search} model={model} strategy={strategy} status={status} type={type} dateFrom={dateFrom} dateTo={dateTo} onSearchChange={(value) => updateFilter(setSearch, value)} onModelChange={(value) => updateFilter(setModel, value)} onStrategyChange={(value) => updateFilter(setStrategy, value)} onStatusChange={(value) => updateFilter(setStatus, value)} onTypeChange={(value) => updateFilter(setType, value)} onDateFromChange={(value) => updateFilter(setDateFrom, value)} onDateToChange={(value) => updateFilter(setDateTo, value)} onReset={resetFilters} />
    <ExperimentDetails experiment={selected} onExportJson={() => void downloadExperimentJson("experiment", selected.id)} onExportCsv={() => void downloadExperimentCsv("experiment", selected.id)} onExportPdf={() => void downloadExperimentPdf("experiment", selected.id)} />
    <ExperimentComparison experiments={experiments} selectedIds={comparisonIds} onSelectionChange={setComparisonIds} />
    <ExperimentTrends experiments={experiments} />
    <ExperimentConfiguration configuration={selected.details.configurationSnapshot} onExport={() => void downloadExperimentJson("experiment", selected.id)} readOnly={selected.source === "historical"} />
    {modelOptions.length ? <ExperimentCreation models={modelOptions} onSave={(request) => void saveConfiguration(request)} /> : null}
    <section className="flex flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Experiment history / end of view</p><p className="mt-2 text-sm text-ink">Exports are served by the centralized backend report and export endpoints.</p></div><Button variant="outline" asChild><a href="#experiment-registry">Back to registry <ArrowDown aria-hidden="true" className="size-3.5 rotate-180" /></a></Button></section>
  </div></AppShell>;
}

export { ExperimentWorkspace };

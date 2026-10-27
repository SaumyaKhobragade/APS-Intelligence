import { RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ExperimentHistoryRecord } from "@/types";

interface ExperimentFiltersProps {
  experiments: ExperimentHistoryRecord[];
  search: string;
  model: string;
  strategy: string;
  status: string;
  type: string;
  dateFrom: string;
  dateTo: string;
  onSearchChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onStrategyChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onReset: () => void;
}

function ExperimentFilters({ experiments, search, model, strategy, status, type, dateFrom, dateTo, onSearchChange, onModelChange, onStrategyChange, onStatusChange, onTypeChange, onDateFromChange, onDateToChange, onReset }: ExperimentFiltersProps) {
  const models = Array.from(new Map(experiments.map((experiment) => [experiment.modelId, experiment.modelName])).entries()).map(([value, label]) => ({ value, label }));
  const strategies = Array.from(new Set(experiments.map((experiment) => experiment.strategy).filter((value): value is string => Boolean(value)))).map((value) => ({ value, label: value.replaceAll("_", " ") }));
  const types = Array.from(new Set(experiments.map((experiment) => experiment.experimentType))).map((value) => ({ value, label: value.replaceAll("_", " ") }));

  return <section id="experiment-filters" aria-labelledby="experiment-filters-heading" className="border-b border-line bg-surface px-5 py-6 sm:px-8 lg:px-10"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">02 / Registry filters</p><h2 id="experiment-filters-heading" className="mt-2 font-display text-3xl leading-none text-ink">Find the run worth reopening.</h2></div><Button variant="ghost" size="sm" onClick={onReset}><RotateCcw aria-hidden="true" className="size-3.5" /> Reset filters</Button></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><div className="sm:col-span-2 xl:col-span-2"><label htmlFor="experiment-search" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Search ID or name</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><Input id="experiment-search" className="pl-9" placeholder="EXP-2026…" value={search} onChange={(event) => onSearchChange(event.target.value)} /></div></div><div><label htmlFor="experiment-model" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Model</label><Select id="experiment-model" value={model} onChange={(event) => onModelChange(event.target.value)} options={[{ value: "all", label: "All models" }, ...models]} /></div><div><label htmlFor="experiment-strategy" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Strategy</label><Select id="experiment-strategy" value={strategy} onChange={(event) => onStrategyChange(event.target.value)} options={[{ value: "all", label: "All strategies" }, ...strategies]} /></div><div><label htmlFor="experiment-status" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Status</label><Select id="experiment-status" value={status} onChange={(event) => onStatusChange(event.target.value)} options={[{ value: "all", label: "All statuses" }, { value: "completed", label: "Completed" }, { value: "queued", label: "Queued" }, { value: "running", label: "Running" }, { value: "failed", label: "Failed" }]} /></div><div><label htmlFor="experiment-type" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Type</label><Select id="experiment-type" value={type} onChange={(event) => onTypeChange(event.target.value)} options={[{ value: "all", label: "All types" }, ...types]} /></div><div><label htmlFor="experiment-date-from" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">From date</label><Input id="experiment-date-from" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></div><div><label htmlFor="experiment-date-to" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">To date</label><Input id="experiment-date-to" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></div></div></section>;
}

export { ExperimentFilters };

"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Download, History, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/lib/formatters";
import type { PredictionModelOption, PredictionResult } from "@/types";

interface PredictionHistoryProps {
  records: PredictionResult[];
  models: PredictionModelOption[];
  selectedPredictionId?: string;
  onSelectPrediction: (record: PredictionResult) => void;
}

type SortKey = "createdAt" | "failureProbability";

function PredictionHistory({ records, models, selectedPredictionId, onSelectPrediction }: PredictionHistoryProps) {
  const [query, setQuery] = React.useState("");
  const [classFilter, setClassFilter] = React.useState("all");
  const [modelFilter, setModelFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("createdAt");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc");
  const modelNames = new Map(models.map((model) => [model.modelId, model.modelName]));
  const filtered = React.useMemo(() => records.filter((record) => record.predictionId.toLowerCase().includes(query.toLowerCase()) && (classFilter === "all" || record.predictedLabel === classFilter) && (modelFilter === "all" || record.modelId === modelFilter)).sort((first, second) => { const firstValue = sortKey === "createdAt" ? first.createdAt : first.failureProbability; const secondValue = sortKey === "createdAt" ? second.createdAt : second.failureProbability; const result = firstValue < secondValue ? -1 : firstValue > secondValue ? 1 : 0; return sortDirection === "asc" ? result : -result; }), [classFilter, modelFilter, query, records, sortDirection, sortKey]);

  function requestSort(nextKey: SortKey) { if (sortKey === nextKey) setSortDirection((current) => current === "asc" ? "desc" : "asc"); else { setSortKey(nextKey); setSortDirection("desc"); } }

  function exportCsv() {
    const header = "prediction_id,timestamp,model,predicted_class,failure_probability,threshold,status";
    const rows = filtered.map((record) => [record.predictionId, record.createdAt, modelNames.get(record.modelId) ?? record.modelId, record.predictedLabel, record.failureProbability, record.threshold, record.status ?? "completed"].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aps-prediction-history-demo.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <section id="prediction-history" aria-labelledby="prediction-history-heading" className="px-5 py-10 sm:px-8 lg:px-10 lg:py-14"><div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">07 / Prediction history</p><h2 id="prediction-history-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Keep the decision trail reviewable.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Search and filter demonstration predictions, inspect an individual row, or download the current view as CSV.</p></div><Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}><Download aria-hidden="true" className="size-3.5" /> Export CSV</Button></div><div className="mt-8 overflow-hidden border-y border-line"><div className="flex flex-col gap-3 border-b border-line bg-surface px-3 py-4 sm:flex-row sm:items-end"><label className="relative block flex-1"><span className="sr-only">Search prediction IDs</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prediction ID" className="pl-9" /></label><label className="sm:w-44"><span className="sr-only">Filter predicted class</span><Select value={classFilter} onChange={(event) => setClassFilter(event.target.value)} options={[{ label: "All classes", value: "all" }, { label: "APS Failure", value: "failure" }, { label: "Normal", value: "normal" }]} /></label><label className="sm:w-52"><span className="sr-only">Filter model</span><Select value={modelFilter} onChange={(event) => setModelFilter(event.target.value)} options={[{ label: "All models", value: "all" }, ...models.map((model) => ({ label: model.modelName, value: model.modelId }))]} /></label></div><div className="flex items-center gap-2 border-b border-line px-3 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><History aria-hidden="true" className="size-3 text-signal" /> {filtered.length} records in current view</div><Table><TableHeader><TableRow><TableHead>Prediction ID</TableHead><TableHead>Model</TableHead><SortableHead label="Timestamp" sortKey="createdAt" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><TableHead>Class</TableHead><SortableHead label="Probability" sortKey="failureProbability" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><TableHead>Threshold</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{filtered.length ? filtered.map((record) => { const selected = record.predictionId === selectedPredictionId; const failure = record.predictedLabel === "failure"; return <TableRow key={record.predictionId} className={selected ? "bg-signal-wash/50" : undefined}><TableCell><button type="button" className="font-mono text-xs text-ink underline underline-offset-4 hover:text-signal" onClick={() => onSelectPrediction(record)}>{record.predictionId}</button></TableCell><TableCell className="whitespace-nowrap text-xs">{modelNames.get(record.modelId) ?? record.modelId}</TableCell><TableCell className="whitespace-nowrap font-mono text-xs text-muted">{formatTimestamp(record.createdAt)}</TableCell><TableCell><Badge variant={failure ? "signal" : "success"}>{failure ? "APS Failure" : "Normal"}</Badge></TableCell><TableCell className={`font-mono text-xs ${failure ? "text-signal" : "text-ink"}`}>{formatPercent(record.failureProbability)}</TableCell><TableCell className="font-mono text-xs">{formatPercent(record.threshold)}</TableCell><TableCell className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{record.status ?? "completed"}</TableCell></TableRow>; }) : <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted">No predictions match the current filters.</TableCell></TableRow>}</TableBody></Table></div></section>;
}

function SortableHead({ label, sortKey, currentSort, direction, onSort }: { label: string; sortKey: SortKey; currentSort: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) { const active = sortKey === currentSort; return <TableHead aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-ink" aria-label={`Sort by ${label}`}>{label}{active ? direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3" /> : <ArrowDown aria-hidden="true" className="size-3" /> : null}</button></TableHead>; }
function formatTimestamp(value: string): string { return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(new Date(value)); }

export { PredictionHistory };

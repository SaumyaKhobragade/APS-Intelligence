"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronRight, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

type SortKey = "modelName" | "prAuc" | "precision" | "recall" | "f1Score" | "falsePositiveCount" | "falseNegativeCount" | "businessCost" | "threshold";

interface ModelMetricsTableProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function ModelMetricsTable({ models, selectedModelId, onSelectModel }: ModelMetricsTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("prAuc");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc");

  const sortedModels = React.useMemo(() => [...models].sort((first, second) => {
    const firstValue = valueForSort(first, sortKey);
    const secondValue = valueForSort(second, sortKey);
    const comparison = typeof firstValue === "string" && typeof secondValue === "string" ? firstValue.localeCompare(secondValue) : Number(firstValue) - Number(secondValue);
    return sortDirection === "asc" ? comparison : -comparison;
  }), [models, sortDirection, sortKey]);

  function requestSort(nextKey: SortKey) {
    if (sortKey === nextKey) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(nextKey); setSortDirection(nextKey === "modelName" ? "asc" : "desc"); }
  }

  return (
    <section id="metrics-table" aria-labelledby="metrics-table-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Metrics table</p><h2 id="metrics-table-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Read every trade-off in one line.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Sortable, threshold-aware metrics with the confusion counts and cost model beside them. Select a model to carry it into the analysis below.</p></div><Badge variant="neutral"><SlidersHorizontal aria-hidden="true" className="size-3" /> Sortable / validation</Badge></div>
      <div className="mt-8 overflow-x-auto border-y border-line">
        {models.length ? <Table className="min-w-[88rem]"><TableHeader><TableRow><SortableHead label="Model" sortKey="modelName" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><SortableHead label="PR-AUC" sortKey="prAuc" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><TableHead>ROC-AUC</TableHead><SortableHead label="Precision" sortKey="precision" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><SortableHead label="Recall" sortKey="recall" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><SortableHead label="F1" sortKey="f1Score" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><TableHead>Specificity</TableHead><TableHead>Balanced accuracy</TableHead><SortableHead label="FP" sortKey="falsePositiveCount" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><SortableHead label="FN" sortKey="falseNegativeCount" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><SortableHead label="Business cost" sortKey="businessCost" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /><SortableHead label="Threshold" sortKey="threshold" currentSort={sortKey} direction={sortDirection} onSort={requestSort} /></TableRow></TableHeader><TableBody>{sortedModels.map((model) => { const isSelected = model.modelId === selectedModelId; return <TableRow key={model.modelId} className={isSelected ? "bg-signal-wash/50" : undefined}><TableCell><button type="button" className="flex items-center gap-2 whitespace-nowrap text-left text-xs font-medium text-ink hover:text-signal" onClick={() => onSelectModel(model.modelId)} aria-pressed={isSelected}><ChevronRight aria-hidden="true" className={`size-3 transition-transform ${isSelected ? "rotate-90 text-signal" : "text-muted"}`} />{model.modelName}</button></TableCell><TableCell className="font-mono text-xs font-semibold text-signal">{formatPercent(model.prAuc)}</TableCell><TableCell className="font-mono text-xs">{model.rocAuc === undefined ? "—" : formatPercent(model.rocAuc)}</TableCell><TableCell className="font-mono text-xs">{formatPercent(model.precision)}</TableCell><TableCell className="font-mono text-xs">{formatPercent(model.recall)}</TableCell><TableCell className="font-mono text-xs">{formatPercent(model.f1Score)}</TableCell><TableCell className="font-mono text-xs">{model.specificity === undefined ? "—" : formatPercent(model.specificity)}</TableCell><TableCell className="font-mono text-xs">{model.balancedAccuracy === undefined ? "—" : formatPercent(model.balancedAccuracy)}</TableCell><TableCell className="font-mono text-xs">{formatNumber(model.businessImpact.falsePositiveCount)}</TableCell><TableCell className="font-mono text-xs text-signal">{formatNumber(model.businessImpact.falseNegativeCount)}</TableCell><TableCell className="font-mono text-xs">{formatCurrency(model.businessImpact.estimatedCost)}</TableCell><TableCell className="font-mono text-xs">{formatPercent(model.threshold)}</TableCell></TableRow>; })}</TableBody></Table> : <EmptyState title="No model evaluations" description="Model metrics will appear when evaluation artifacts are available." />}
      </div>
       <p className="mt-4 text-xs leading-5 text-muted">Values use persisted validation evidence and the threshold shown in each row. Business cost uses the recorded illustrative FP/FN configuration.</p>
    </section>
  );
}

function valueForSort(model: ModelEvaluation, key: SortKey): string | number {
  if (key === "modelName") return model.modelName;
  if (key === "falsePositiveCount") return model.businessImpact.falsePositiveCount;
  if (key === "falseNegativeCount") return model.businessImpact.falseNegativeCount;
  if (key === "businessCost") return model.businessImpact.estimatedCost;
  return model[key];
}

function SortableHead({ label, sortKey, currentSort, direction, onSort }: { label: string; sortKey: SortKey; currentSort: SortKey; direction: "asc" | "desc"; onSort: (key: SortKey) => void }) {
  const isActive = sortKey === currentSort;
  return <TableHead aria-sort={isActive ? direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="inline-flex items-center gap-1 whitespace-nowrap hover:text-ink" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`}>{label}{isActive ? direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3" /> : <ArrowDown aria-hidden="true" className="size-3" /> : null}</button></TableHead>;
}

export { ModelMetricsTable };

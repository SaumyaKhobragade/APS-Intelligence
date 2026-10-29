"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/formatters";
import { computeIllustrativeCost } from "@/lib/business-cost";
import type { ModelEvaluation } from "@/types";

type SortKey = "modelName" | "prAuc" | "precision" | "recall" | "f1Score" | "falsePositiveCount" | "falseNegativeCount" | "businessCost" | "threshold";

interface ModelMetricsTableProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

const modelFamilies = ["All", "CatBoost", "XGBoost", "Random Forest", "Logistic Regression"];

function ModelMetricsTableComponent({ models, selectedModelId, onSelectModel }: ModelMetricsTableProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("prAuc");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc");
  const [familyFilter, setFamilyFilter] = React.useState("All");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [pageSize, setPageSize] = React.useState<number>(10);
  const [currentPage, setCurrentPage] = React.useState(1);

  // Filter models
  const filteredModels = React.useMemo(() => {
    return models.filter((model) => {
      if (familyFilter !== "All") {
        const target = familyFilter.toLowerCase().replaceAll(" ", "_");
        const modelTarget = model.modelType.toLowerCase().replaceAll(" ", "_");
        if (!modelTarget.includes(target) && !model.modelName.toLowerCase().includes(familyFilter.toLowerCase())) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = model.modelName.toLowerCase().includes(query);
        const matchesStrategy = (model.strategy ?? "").toLowerCase().includes(query);
        if (!matchesName && !matchesStrategy) return false;
      }
      return true;
    });
  }, [models, familyFilter, searchQuery]);

  // Sort filtered models
  const sortedModels = React.useMemo(() => {
    return [...filteredModels].sort((first, second) => {
      const firstValue = valueForSort(first, sortKey);
      const secondValue = valueForSort(second, sortKey);
      const comparison = typeof firstValue === "string" && typeof secondValue === "string"
        ? firstValue.localeCompare(secondValue)
        : Number(firstValue) - Number(secondValue);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredModels, sortDirection, sortKey]);

  // Paginate safely without useEffect cascading render
  const totalItems = sortedModels.length;
  const isAll = pageSize >= totalItems;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = isAll ? 0 : (safeCurrentPage - 1) * pageSize;
  const paginatedModels = isAll ? sortedModels : sortedModels.slice(startIndex, startIndex + pageSize);

  function requestSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection(nextKey === "modelName" ? "asc" : "desc");
    }
  }

  function handleFamilyChange(family: string) {
    setFamilyFilter(family);
    setCurrentPage(1);
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setCurrentPage(1);
  }

  return (
    <section id="metrics-table" aria-labelledby="metrics-table-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Metrics table</p>
          <h2 id="metrics-table-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Read every trade-off in one line.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Sortable, threshold-aware metrics with the confusion counts and cost model beside them. Select a model to carry it into the analysis below.</p>
        </div>
        <Badge variant="neutral"><SlidersHorizontal aria-hidden="true" className="size-3" /> Sortable / validation</Badge>
      </div>

      {/* Controls: Family Filters, Search, Page Size */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {modelFamilies.map((family) => {
            const active = familyFilter === family;
            return (
              <button
                key={family}
                type="button"
                onClick={() => handleFamilyChange(family)}
                className={`px-2.5 py-1 font-mono text-xs transition-colors ${
                  active
                    ? "border border-ink bg-ink text-white"
                    : "border border-line bg-surface text-muted hover:border-ink hover:text-ink"
                }`}
              >
                {family}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="h-8 rounded-none border border-line bg-surface pl-8 pr-3 font-mono text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted">
            <span>Show:</span>
            {[10, 25, 100].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => handlePageSizeChange(size)}
                className={`px-2 py-0.5 border ${
                  pageSize === size
                    ? "border-ink bg-surface text-ink font-semibold"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {size === 100 ? "All" : size}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto border-y border-line">
        {paginatedModels.length ? (
          <Table className="min-w-[88rem]">
            <TableHeader>
              <TableRow>
                <SortableHead label="Model" sortKey="modelName" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <SortableHead label="PR-AUC" sortKey="prAuc" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <TableHead>ROC-AUC</TableHead>
                <SortableHead label="Precision" sortKey="precision" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <SortableHead label="Recall" sortKey="recall" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <SortableHead label="F1" sortKey="f1Score" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <TableHead>Specificity</TableHead>
                <TableHead>Balanced accuracy</TableHead>
                <SortableHead label="FP" sortKey="falsePositiveCount" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <SortableHead label="FN" sortKey="falseNegativeCount" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <SortableHead label="Business cost" sortKey="businessCost" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
                <SortableHead label="Threshold" sortKey="threshold" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedModels.map((model) => {
                const isSelected = model.modelId === selectedModelId;
                const costInfo = computeIllustrativeCost(
                  model.confusionMatrix?.falsePositive ?? model.businessImpact?.falsePositiveCount,
                  model.confusionMatrix?.falseNegative ?? model.businessImpact?.falseNegativeCount,
                  model.businessImpact?.estimatedCost,
                );
                return (
                  <TableRow key={model.modelId} className={isSelected ? "bg-signal-wash/50" : undefined}>
                    <TableCell>
                      <button
                        type="button"
                        className="flex items-center gap-2 whitespace-nowrap text-left text-xs font-medium text-ink hover:text-signal"
                        onClick={() => onSelectModel(model.modelId)}
                        aria-pressed={isSelected}
                      >
                        <ChevronRight aria-hidden="true" className={`size-3 transition-transform ${isSelected ? "rotate-90 text-signal" : "text-muted"}`} />
                        {model.modelName}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold text-signal">{formatPercent(model.prAuc)}</TableCell>
                    <TableCell className="font-mono text-xs">{model.rocAuc === undefined ? "—" : formatPercent(model.rocAuc)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatPercent(model.precision)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatPercent(model.recall)}</TableCell>
                    <TableCell className="font-mono text-xs">{formatPercent(model.f1Score)}</TableCell>
                    <TableCell className="font-mono text-xs">{model.specificity === undefined ? "—" : formatPercent(model.specificity)}</TableCell>
                    <TableCell className="font-mono text-xs">{model.balancedAccuracy === undefined ? "—" : formatPercent(model.balancedAccuracy)}</TableCell>
                    <TableCell className="font-mono text-xs">{costInfo.isAvailable ? formatNumber(costInfo.fpCount!) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-signal">{costInfo.isAvailable ? formatNumber(costInfo.fnCount!) : "—"}</TableCell>
                    <TableCell className="font-mono text-xs" title={costInfo.hasDiscrepancy && costInfo.discrepancyNote ? costInfo.discrepancyNote : undefined}>
                      {costInfo.isAvailable ? formatNumber(costInfo.calculatedCost!) : "Unavailable"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{formatPercent(model.threshold)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title="No matching models" description="No models match your current filter and search criteria." />
        )}
      </div>

      {/* Pagination Footer */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-muted">
        <p>
          Showing {totalItems === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, totalItems)} of {totalItems} models
          {familyFilter !== "All" || searchQuery ? ` (filtered from ${models.length} total)` : ""}.
        </p>

        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              className="h-7 px-2.5 font-mono text-xs"
            >
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <span className="font-mono text-xs text-ink">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              className="h-7 px-2.5 font-mono text-xs"
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-5 text-muted">
        Values use persisted validation evidence and the threshold shown in each row. Business cost uses the project&apos;s established unitless weights (FP × 1 + FN × 10).
      </p>
    </section>
  );
}

function valueForSort(model: ModelEvaluation, key: SortKey): string | number {
  if (key === "modelName") return model.modelName;
  if (key === "falsePositiveCount") return model.confusionMatrix?.falsePositive ?? model.businessImpact?.falsePositiveCount ?? -1;
  if (key === "falseNegativeCount") return model.confusionMatrix?.falseNegative ?? model.businessImpact?.falseNegativeCount ?? -1;
  if (key === "businessCost") {
    const costInfo = computeIllustrativeCost(
      model.confusionMatrix?.falsePositive ?? model.businessImpact?.falsePositiveCount,
      model.confusionMatrix?.falseNegative ?? model.businessImpact?.falseNegativeCount,
      model.businessImpact?.estimatedCost,
    );
    return costInfo.isAvailable ? costInfo.calculatedCost! : -1;
  }
  return model[key] ?? -1;
}

function SortableHead({
  label,
  sortKey,
  currentSort,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === currentSort;
  return (
    <TableHead aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-ink"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {isActive ? (
          direction === "asc" ? (
            <ArrowUp aria-hidden="true" className="size-3" />
          ) : (
            <ArrowDown aria-hidden="true" className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

export const ModelMetricsTable = React.memo(ModelMetricsTableComponent);

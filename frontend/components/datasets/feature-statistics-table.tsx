"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Search, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { FeatureStatistics } from "@/types";

type FilterMode = "all" | "missing" | "complete";
type SortKey = "name" | "missingPercentage" | "mean";

interface FeatureStatisticsTableProps {
  features: FeatureStatistics[];
  selectedFeatureName?: string;
  onSelectFeature: (feature: FeatureStatistics) => void;
}

function FeatureStatisticsTable({ features, selectedFeatureName, onSelectFeature }: FeatureStatisticsTableProps) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("missingPercentage");
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const pageSize = 8;

  const filteredFeatures = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return features
      .filter((feature) => feature.name.toLowerCase().includes(normalizedQuery))
      .filter((feature) => filter === "all" || (filter === "missing" ? feature.missingCount > 0 : feature.missingCount === 0))
      .sort((first, second) => {
        const firstValue = sortKey === "name" ? first.name : first[sortKey] ?? 0;
        const secondValue = sortKey === "name" ? second.name : second[sortKey] ?? 0;
        const comparison = typeof firstValue === "string" && typeof secondValue === "string" ? firstValue.localeCompare(secondValue) : Number(firstValue) - Number(secondValue);
        return sortDirection === "asc" ? comparison : -comparison;
      });
  }, [features, filter, query, sortDirection, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredFeatures.length / pageSize));
  const visibleFeatures = filteredFeatures.slice((page - 1) * pageSize, page * pageSize);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateFilter(value: FilterMode) {
    setFilter(value);
    setPage(1);
  }

  function requestSort(value: SortKey) {
    if (sortKey === value) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(value);
      setSortDirection(value === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  return (
    <div className="min-w-0 border-y border-line">
      <div className="flex flex-col gap-4 border-b border-line bg-surface px-3 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Feature inventory</p>
          <p className="mt-1 text-sm text-ink">Search and inspect a focused slice of the 170-feature schema.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block"><span className="sr-only">Search features</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><Input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Search feature" className="h-9 pl-9 sm:w-48" /></label>
          <label><span className="sr-only">Filter features</span><Select value={filter} onChange={(event) => updateFilter(event.target.value as FilterMode)} options={[{ label: "All features", value: "all" }, { label: "Has missing values", value: "missing" }, { label: "Complete only", value: "complete" }]} className="h-9 sm:w-48" /></label>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-line px-3 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><SlidersHorizontal aria-hidden="true" className="size-3 text-signal" /> {filteredFeatures.length} features in current view <span className="text-line-strong">/</span> select a row for details</div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Feature" sortKey="name" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
            <TableHead>Data type</TableHead>
            <SortableHead label="Missing" sortKey="missingPercentage" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
            <TableHead>Non-null count</TableHead>
            <SortableHead label="Mean" sortKey="mean" currentSort={sortKey} direction={sortDirection} onSort={requestSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleFeatures.length ? visibleFeatures.map((feature) => (
            <TableRow key={feature.name} className={selectedFeatureName === feature.name ? "bg-signal-wash/45" : undefined}>
              <TableCell><button type="button" className="font-mono text-xs font-medium text-ink underline decoration-line decoration-1 underline-offset-4 hover:text-signal" onClick={() => onSelectFeature(feature)}>{feature.name}</button></TableCell>
              <TableCell><Badge variant={feature.dataType === "target" ? "signal" : "neutral"}>{feature.dataType}</Badge></TableCell>
              <TableCell className={`font-mono text-xs ${feature.missingPercentage > 0.2 ? "text-signal" : "text-ink"}`}>{formatPercent(feature.missingPercentage)}</TableCell>
              <TableCell className="font-mono text-xs">{formatNumber(feature.nonNullCount)}</TableCell>
              <TableCell className="font-mono text-xs">{feature.mean === undefined ? "—" : feature.mean.toFixed(2)}</TableCell>
            </TableRow>
          )) : <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted">No features match this search and filter.</TableCell></TableRow>}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-3 border-t border-line px-3 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Page {page} of {pageCount}</p>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ArrowUp aria-hidden="true" className="size-3.5 -rotate-90" /> Previous</Button><Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount}>Next <ArrowDown aria-hidden="true" className="size-3.5 -rotate-90" /></Button></div>
      </div>
    </div>
  );
}

function SortableHead({ label, sortKey, currentSort, direction, onSort }: { label: string; sortKey: SortKey; currentSort: SortKey; direction: "asc" | "desc"; onSort: (sortKey: SortKey) => void }) {
  const isActive = sortKey === currentSort;
  return <TableHead aria-sort={isActive ? direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label}`}>{label}{isActive ? direction === "asc" ? <ArrowUp aria-hidden="true" className="size-3" /> : <ArrowDown aria-hidden="true" className="size-3" /> : null}</button></TableHead>;
}

export { FeatureStatisticsTable };

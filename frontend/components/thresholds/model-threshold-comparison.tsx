"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { ThresholdModelEvaluation } from "@/types";

interface ModelThresholdComparisonProps {
  models: ThresholdModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

type SortKey = "businessCost" | "recall" | "precision";

function ModelThresholdComparison({ models, selectedModelId, onSelectModel }: ModelThresholdComparisonProps) {
  const [sortKey, setSortKey] = React.useState<SortKey>("businessCost");
  const [descending, setDescending] = React.useState(false);
  const rows = models.map((model) => ({ model, recommendations: model.recommendations }));
  const sortedRows = [...rows].sort((a, b) => {
    const left = a.recommendations.minimumCost.metrics[sortKey];
    const right = b.recommendations.minimumCost.metrics[sortKey];
    return (left - right) * (descending ? -1 : 1);
  });
  const best = rows.reduce(
    (current, row) =>
      row.recommendations.minimumCost.metrics.businessCost < current.recommendations.minimumCost.metrics.businessCost
        ? row
        : current,
    rows[0],
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setDescending((value) => !value);
    else {
      setSortKey(key);
      setDescending(false);
    }
  }

  return (
    <section id="model-threshold-comparison" aria-labelledby="model-threshold-comparison-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">08 / Model comparison</p>
          <h2 id="model-threshold-comparison-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Compare operating points, not just models.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Every row uses the same validation sample and current cost weights. Sort by business cost, recall or precision; the lowest-cost operating point is explicitly labelled.
          </p>
        </div>
        <Badge variant="signal">{best?.model.modelName ?? "No recommendation"} / lowest cost</Badge>
      </div>
      <div className="mt-8 overflow-x-auto border-y border-line">
        <Table className="min-w-[68rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Frozen default</TableHead>
              <TableHead>Min-cost threshold</TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort("businessCost")}>
                  Min business cost <SortIcon active={sortKey === "businessCost"} descending={descending} />
                </button>
              </TableHead>
              <TableHead>Max-F1 threshold</TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort("recall")}>
                  Recall at min cost <SortIcon active={sortKey === "recall"} descending={descending} />
                </button>
              </TableHead>
              <TableHead>
                <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => toggleSort("precision")}>
                  Precision at min cost <SortIcon active={sortKey === "precision"} descending={descending} />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map(({ model, recommendations }) => {
              const minimum = recommendations.minimumCost.metrics;
              const selected = model.modelId === selectedModelId;
              const isBest = model.modelId === best?.model.modelId;
              return (
                <TableRow key={model.modelId} className={selected ? "bg-signal-wash/50" : undefined} onClick={() => onSelectModel(model.modelId)}>
                  <TableCell>
                    <button type="button" className="flex items-center gap-2 text-left" onClick={() => onSelectModel(model.modelId)}>
                      <span className={`size-2 shrink-0 ${isBest ? "bg-signal" : "bg-line-strong"}`} />
                      <span>
                        <span className="block text-sm font-medium">{model.modelName}</span>
                        <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{model.modelType}</span>
                      </span>
                      {isBest ? <Badge variant="signal">Lowest cost</Badge> : null}
                      {selected ? <CheckCircle2 aria-label="Selected model" className="size-4 text-signal" /> : null}
                    </button>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(model.defaultThreshold)}</TableCell>
                  <TableCell className="font-mono text-xs text-signal">{formatPercent(minimum.threshold)}</TableCell>
                  <TableCell className="font-mono text-xs font-semibold">{formatNumber(minimum.businessCost)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(recommendations.maximumF1.metrics.threshold)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(minimum.recall)}</TableCell>
                  <TableCell className="font-mono text-xs">{formatPercent(minimum.precision)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-5 text-xs leading-5 text-muted">
        The recommended model is a decision-support highlight under current cost weights, not a guarantee of production performance. Candidate is not production approved.
      </p>
    </section>
  );
}

function SortIcon({ active, descending }: { active: boolean; descending: boolean }) {
  if (!active) return <span className="text-line-strong">↕</span>;
  return descending ? <ArrowDown aria-hidden="true" className="size-3" /> : <ArrowUp aria-hidden="true" className="size-3" />;
}

export { ModelThresholdComparison };

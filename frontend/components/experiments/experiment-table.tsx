import { ArrowDown, ArrowUp, CheckCircle2, Clock3, FileWarning, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { ExperimentHistoryRecord } from "@/types";

type SortKey = "createdAt" | "prAuc" | "precision" | "recall" | "f1Score" | "businessCost" | "threshold";

interface ExperimentTableProps {
  experiments: ExperimentHistoryRecord[];
  selectedId?: string;
  sortKey: SortKey;
  descending: boolean;
  onSort: (key: SortKey) => void;
  onSelect: (experiment: ExperimentHistoryRecord) => void;
}

function ExperimentTable({ experiments, selectedId, sortKey, descending, onSort, onSelect }: ExperimentTableProps) {
  return <div className="overflow-x-auto border-y border-line"><Table className="min-w-[74rem]"><TableHeader><TableRow><TableHead>Experiment</TableHead><TableHead>Model</TableHead><TableHead>Dataset</TableHead><TableHead><SortButton label="Created" sortKey="createdAt" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead><TableHead>Status</TableHead><TableHead><SortButton label="PR-AUC" sortKey="prAuc" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead><TableHead><SortButton label="Precision" sortKey="precision" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead><TableHead><SortButton label="Recall" sortKey="recall" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead><TableHead><SortButton label="F1" sortKey="f1Score" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead><TableHead><SortButton label="Threshold" sortKey="threshold" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead><TableHead><SortButton label="Cost" sortKey="businessCost" currentKey={sortKey} descending={descending} onSort={onSort} /></TableHead></TableRow></TableHeader><TableBody>{experiments.map((experiment) => { const metrics = experiment.evaluationResults; const selected = experiment.id === selectedId; return <TableRow key={experiment.id} className={selected ? "bg-signal-wash/50" : undefined}><TableCell><Button type="button" variant="ghost" className="h-auto justify-start px-0 py-0 text-left" onClick={() => onSelect(experiment)}><span className="flex items-start gap-2"><span className={`mt-1.5 size-2 shrink-0 ${selected ? "bg-signal" : "bg-line-strong"}`} /><span><span className="block max-w-44 truncate text-sm font-medium">{experiment.name}</span><span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{experiment.id}</span></span></span></Button></TableCell><TableCell><span className="text-xs font-medium">{experiment.modelName}</span><span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{experiment.experimentType.replaceAll("_", " ")}</span></TableCell><TableCell className="max-w-36 truncate text-xs text-muted">{experiment.datasetName}</TableCell><TableCell className="whitespace-nowrap font-mono text-[10px] text-muted">{new Date(experiment.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC</TableCell><TableCell><StatusBadge status={experiment.status} /></TableCell><TableCell className="font-mono text-xs">{metrics.prAuc === undefined ? "—" : metrics.prAuc.toFixed(3)}</TableCell><TableCell className="font-mono text-xs">{formatPercentOrDash(metrics.precision)}</TableCell><TableCell className="font-mono text-xs">{formatPercentOrDash(metrics.recall)}</TableCell><TableCell className="font-mono text-xs">{formatPercentOrDash(metrics.f1Score)}</TableCell><TableCell className="font-mono text-xs">{metrics.classificationThreshold?.toFixed(2) ?? "—"}</TableCell><TableCell className="font-mono text-xs">{metrics.businessImpact ? formatCurrency(metrics.businessImpact.estimatedCost) : "—"}</TableCell></TableRow>; })}</TableBody></Table></div>;
}

function formatPercentOrDash(value?: number): string { return value === undefined ? "—" : formatPercent(value); }

function StatusBadge({ status }: { status: ExperimentHistoryRecord["status"] }) {
  const config = { completed: { label: "Completed", variant: "success" as const, icon: CheckCircle2 }, running: { label: "Running", variant: "signal" as const, icon: PlayCircle }, queued: { label: "Queued", variant: "neutral" as const, icon: Clock3 }, failed: { label: "Failed", variant: "signal" as const, icon: FileWarning } }[status];
  const Icon = config.icon;
  return <Badge variant={config.variant}><Icon aria-hidden="true" className="size-3" /> {config.label}</Badge>;
}

function SortButton({ label, sortKey, currentKey, descending, onSort }: { label: string; sortKey: SortKey; currentKey: SortKey; descending: boolean; onSort: (key: SortKey) => void }) {
  const active = sortKey === currentKey;
  return <button type="button" className="inline-flex items-center gap-1 hover:text-ink" onClick={() => onSort(sortKey)}>{label} {active ? descending ? <ArrowDown aria-hidden="true" className="size-3" /> : <ArrowUp aria-hidden="true" className="size-3" /> : <span className="text-line-strong">↕</span>}</button>;
}

export type { SortKey };
export { ExperimentTable };

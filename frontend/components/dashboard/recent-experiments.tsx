import { ArrowUpRight, Clock3, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPercent } from "@/lib/formatters";
import type { ExperimentRecord, ModelMetrics } from "@/types";

interface RecentExperimentsProps {
  experiments: ExperimentRecord[];
  models: ModelMetrics[];
}

function statusVariant(status: ExperimentRecord["status"]): "success" | "warning" | "signal" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "signal";
  return "warning";
}

function RecentExperiments({ experiments, models }: RecentExperimentsProps) {
  const modelNameById = new Map(models.map((model) => [model.modelId, model.modelName]));

  return (
    <section aria-labelledby="recent-experiments-heading" className="px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Recent activity</p>
          <h2 id="recent-experiments-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Keep the last decision close.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">A compact trail of evaluation runs gives the dashboard a memory. These rows are demonstrations, not persisted experiments.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href="/experiment-history">View all experiments <ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
        </Button>
      </div>

      <div className="mt-8 overflow-hidden border-y border-line">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-3 py-4">
          <FlaskConical aria-hidden="true" className="size-4 text-signal" strokeWidth={1.5} />
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Experiment activity / sample results</p>
          <Clock3 aria-hidden="true" className="ml-auto size-4 text-muted" strokeWidth={1.5} />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Experiment</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Date / time</TableHead>
              <TableHead>PR-AUC</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {experiments.map((experiment) => (
              <TableRow key={experiment.id}>
                <TableCell>
                  <p className="font-mono text-xs text-ink">{experiment.id}</p>
                  <p className="mt-1 text-xs text-muted">{experiment.name}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-ink">{modelNameById.get(experiment.modelId) ?? experiment.modelId}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-muted">{formatExperimentDate(experiment.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs text-ink">{experiment.metrics ? formatPercent(experiment.metrics.prAuc) : "—"}</TableCell>
                <TableCell className="text-right"><Badge variant={statusVariant(experiment.status)}>{experiment.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function formatExperimentDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(new Date(value));
}

export { RecentExperiments };

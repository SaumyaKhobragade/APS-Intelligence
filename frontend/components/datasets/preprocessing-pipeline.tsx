import { ArrowRight, Check, CircleDashed, Clock3, FlaskConical, Info, LoaderCircle, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PreprocessingStage, PreprocessingStageStatus } from "@/types";

interface PreprocessingPipelineProps {
  stages: PreprocessingStage[];
}

function PreprocessingPipeline({ stages }: PreprocessingPipelineProps) {
  return (
    <section id="preprocessing" aria-labelledby="preprocessing-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="grid gap-10 xl:grid-cols-[0.75fr_1.25fr] xl:gap-16">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">06 / Preprocessing pipeline</p>
          <h2 id="preprocessing-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Make the boundary between raw and ready visible.</h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">This workflow is a contract preview, not an ML runtime. Any fitted imputation, scaling, feature selection or resampling must learn from training data only before it touches validation or test data.</p>
          <div className="mt-8 flex items-start gap-3 border-l-2 border-signal pl-4"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} /><p className="text-sm leading-6 text-ink-soft">Testing data remains separate. Its stages are marked accordingly instead of being silently treated as training data.</p></div>
        </div>

        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex items-center justify-between border-b border-line pb-5"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Workflow status / demo</p><p className="mt-2 text-sm text-ink">No frontend preprocessing has been executed</p></div><Badge variant="neutral"><FlaskConical aria-hidden="true" className="size-3" /> Contract only</Badge></div>
          <ol className="mt-7 space-y-0">
            {stages.map((stage, index) => <li key={stage.id} className="relative flex gap-4 pb-7 last:pb-0"><div className="flex flex-col items-center"><span className={`relative z-10 flex size-8 shrink-0 items-center justify-center border ${statusClasses[stage.status]}`}>{statusIcon(stage.status)}</span>{index < stages.length - 1 ? <span className="absolute top-8 h-full w-px bg-line" aria-hidden="true" /> : null}</div><div className="min-w-0 pt-1"><div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-medium text-ink">{stage.label}</h3><StatusBadge status={stage.status} /></div><p className="mt-1 text-xs leading-5 text-muted">{stage.description}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{stage.detail}</p></div>{index < stages.length - 1 ? <ArrowRight aria-hidden="true" className="mt-2 ml-auto hidden size-4 text-line-strong sm:block" /> : null}</li>)}
          </ol>
        </div>
      </div>
    </section>
  );
}

const statusClasses: Record<PreprocessingStageStatus, string> = {
  completed: "border-success bg-success text-white",
  in_progress: "border-signal bg-signal text-white",
  pending: "border-line-strong bg-surface text-muted",
  not_applicable: "border-line bg-canvas-deep text-muted",
};

function statusIcon(status: PreprocessingStageStatus) {
  if (status === "completed") return <Check aria-hidden="true" className="size-4" />;
  if (status === "in_progress") return <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />;
  if (status === "not_applicable") return <Minus aria-hidden="true" className="size-4" />;
  return <CircleDashed aria-hidden="true" className="size-4" />;
}

function StatusBadge({ status }: { status: PreprocessingStageStatus }) {
  const labels: Record<PreprocessingStageStatus, string> = { completed: "Completed", in_progress: "In progress", pending: "Pending", not_applicable: "Not applicable" };
  const variants: Record<PreprocessingStageStatus, "success" | "signal" | "warning" | "neutral"> = { completed: "success", in_progress: "signal", pending: "warning", not_applicable: "neutral" };
  return <Badge variant={variants[status]}>{status === "in_progress" ? <Clock3 aria-hidden="true" className="size-3" /> : null}{labels[status]}</Badge>;
}

export { PreprocessingPipeline };

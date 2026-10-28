import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-5 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-signal">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">
          {title}
        </h2>
        {description ? <p className="mt-3 max-w-xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

interface MetricDisplayProps {
  label: string;
  value: string;
  detail?: string;
  trend?: string;
  accent?: boolean;
  className?: string;
  valueClassName?: string;
  title?: string;
}

function MetricDisplay({
  label,
  value,
  detail,
  trend,
  accent,
  className,
  valueClassName,
  title,
}: MetricDisplayProps) {
  return (
    <div className={cn("min-w-0 border-l border-line px-4 py-1 first:border-l-0 first:pl-0", className)} title={title}>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-3 flex min-w-0 items-end gap-2">
        <p
          className={cn(
            "font-mono text-3xl font-medium tracking-[-0.06em]",
            accent ? "text-signal" : "text-ink",
            valueClassName,
          )}
        >
          {value}
        </p>
        {trend ? <span className="pb-1 font-mono text-[10px] text-success shrink-0">{trend}</span> : null}
      </div>
      {detail ? <p className="mt-1 truncate text-xs text-muted">{detail}</p> : null}
    </div>
  );
}

function QuietLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.13em] text-ink transition-colors hover:text-signal">
      {children}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </span>
  );
}

export { MetricDisplay, QuietLink, SectionHeader };

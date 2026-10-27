import { Database, GitBranch, Fingerprint, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { formatNumber } from "@/lib/formatters";
import type { DatasetMetadata } from "@/types";

interface HistoricalDatasetEvidenceProps {
  metadata: DatasetMetadata;
  splitEvidence: Record<string, unknown> | null;
  availability: Array<{ name: string; status: "available" | "unavailable" | "blocked" | "failed"; message: string }>;
}

function HistoricalDatasetEvidence({ metadata, splitEvidence, availability }: HistoricalDatasetEvidenceProps) {
  const training = classCounts(splitEvidence?.training_class_counts);
  const validation = classCounts(splitEvidence?.validation_class_counts);
  const hasSplit = Boolean(splitEvidence && (training.neg + training.pos + validation.neg + validation.pos));
  return <section id="historical-dataset-evidence" aria-labelledby="historical-dataset-evidence-heading" className="border-b border-line bg-surface px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
    <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">Persisted dataset evidence</p><h2 id="historical-dataset-evidence-heading" className="mt-3 font-display text-3xl leading-none tracking-[-0.035em] text-ink sm:text-4xl">Metadata and split lineage</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Dataset metadata and Phase 9 split evidence are displayed without opening the official test CSV.</p></div><Badge variant="neutral"><ShieldCheck aria-hidden="true" className="size-3" /> Read-only evidence</Badge></div>
    <div className="mt-6 grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4"><Metric icon={Database} label="Records" value={formatNumber(metadata.rowCount)} detail="Configured dataset metadata" /><Metric icon={GitBranch} label="Features" value={String(metadata.featureCount)} detail="Persisted schema count" /><Metric icon={Fingerprint} label="Fingerprint" value={metadata.fingerprint ?? metadata.id} detail={metadata.targetColumn ? `Target / ${metadata.targetColumn}` : "Target unavailable"} /><Metric icon={ShieldCheck} label="Profile" value={metadata.missingValueCount === undefined ? "Unavailable" : "Available"} detail={metadata.missingValueCount === undefined ? "No persisted profile" : "Persisted profile artifact"} /></div>
    {hasSplit ? <div className="mt-6 overflow-x-auto border-y border-line"><table className="w-full min-w-[34rem] text-left"><thead><tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-muted"><th className="px-3 py-3">Partition</th><th className="px-3 py-3">Records</th><th className="px-3 py-3">Normal</th><th className="px-3 py-3">Failure</th><th className="px-3 py-3">Fingerprint</th></tr></thead><tbody><SplitRow name="Training partition" counts={training} fingerprint={splitEvidence?.training_fingerprint} /><SplitRow name="Validation partition" counts={validation} fingerprint={splitEvidence?.validation_fingerprint} /></tbody></table></div> : <div className="mt-6"><EmptyState title="Split evidence unavailable" description={availability.find((item) => item.name.includes("split"))?.message ?? "No persisted Phase 9 train/validation split metadata is available."} /></div>}
    <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted"><span>Dataset fingerprint / {metadata.fingerprint ?? "Unavailable"}</span>{typeof splitEvidence?.split_identifier === "string" ? <span>Split identifier / {splitEvidence.split_identifier.slice(0, 18)}…</span> : null}<span>Source / {metadata.source}</span></div>
  </section>;
}

function classCounts(value: unknown): { neg: number; pos: number } {
  if (!value || typeof value !== "object") return { neg: 0, pos: 0 };
  const record = value as Record<string, unknown>;
  return { neg: typeof record.neg === "number" ? record.neg : 0, pos: typeof record.pos === "number" ? record.pos : 0 };
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Database; label: string; value: string; detail: string }) {
  return <div className="bg-surface p-4 sm:p-5"><Icon aria-hidden="true" className="size-4 text-signal" /><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{label}</p><p className="mt-2 truncate font-mono text-lg text-ink" title={value}>{value}</p><p className="mt-1 text-xs text-muted">{detail}</p></div>;
}

function SplitRow({ name, counts, fingerprint }: { name: string; counts: { neg: number; pos: number }; fingerprint: unknown }) {
  const total = counts.neg + counts.pos;
  return <tr className="border-b border-line text-xs"><td className="px-3 py-3 font-medium text-ink">{name}</td><td className="px-3 py-3 font-mono">{formatNumber(total)}</td><td className="px-3 py-3 font-mono">{formatNumber(counts.neg)}</td><td className="px-3 py-3 font-mono text-signal">{formatNumber(counts.pos)}</td><td className="px-3 py-3 font-mono text-muted">{typeof fingerprint === "string" ? `${fingerprint.slice(0, 18)}…` : "Unavailable"}</td></tr>;
}

export { HistoricalDatasetEvidence };

"use client";

import * as React from "react";
import { ChevronDown, RotateCcw, Search, Send, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SensorFeatureDefinition } from "@/types";

interface SensorInputFormProps {
  features: SensorFeatureDefinition[];
  isProcessing: boolean;
  onSubmit: (readings: Record<string, number | null>) => void;
}

function SensorInputForm({ features, isProcessing, onSubmit }: SensorInputFormProps) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const [groupFilter, setGroupFilter] = React.useState("all");
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(() => new Set(features[0] ? [features[0].group] : []));

  const groups = React.useMemo(() => Array.from(new Set(features.map((feature) => feature.group))), [features]);
  const visibleGroups = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return groups.map((group) => ({ group, features: features.filter((feature) => feature.group === group && (groupFilter === "all" || group === groupFilter) && feature.id.toLowerCase().includes(normalizedQuery)) })).filter((item) => item.features.length > 0);
  }, [features, groupFilter, groups, query]);
  const missingCount = features.filter((feature) => !values[feature.id]?.trim()).length;
  const filledCount = features.length - missingCount;

  function updateValue(featureId: string, value: string) {
    setValues((current) => ({ ...current, [featureId]: value }));
    setErrors((current) => { const next = { ...current }; delete next[featureId]; return next; });
  }

  function toggleGroup(group: string) {
    setExpandedGroups((current) => { const next = new Set(current); if (next.has(group)) next.delete(group); else next.add(group); return next; });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    const readings: Record<string, number | null> = {};
    features.forEach((feature) => { const raw = values[feature.id]?.trim() ?? ""; if (!raw) readings[feature.id] = null; else { const parsed = Number(raw); if (!Number.isFinite(parsed)) nextErrors[feature.id] = "Enter a numeric value or leave blank."; else readings[feature.id] = parsed; } });
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) onSubmit(readings);
  }

  function resetForm() {
    setValues({});
    setErrors({});
  }

  return (
    <section id="single-prediction" aria-labelledby="single-prediction-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14"><div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Single truck prediction</p><h2 id="single-prediction-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Enter one sensor row without losing the schema.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">All 170 APS feature identifiers are available through searchable prefix groups. No undocumented physical meanings are added to the anonymized fields.</p></div><Badge variant="neutral"><SlidersHorizontal aria-hidden="true" className="size-3" /> {features.length} fields supported</Badge></div>
      <form className="mt-8" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4 border-y border-line bg-surface px-3 py-4 sm:flex-row sm:items-end sm:justify-between"><div className="flex flex-1 flex-col gap-2 sm:flex-row"><label className="relative block flex-1"><span className="sr-only">Search sensor features</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search identifiers / e.g. ay_00" className="pl-9" /></label><label className="sm:w-56"><span className="sr-only">Filter sensor prefix group</span><Select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} options={[{ label: "All prefix groups", value: "all" }, ...groups.map((group) => ({ label: group, value: group }))]} /></label></div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{filledCount} filled / {missingCount} missing</p></div>
        <div className="mt-6 space-y-3">{visibleGroups.map(({ group, features: groupFeatures }) => { const expanded = expandedGroups.has(group) || query.length > 0 || groupFilter !== "all"; return <div key={group} className="border border-line bg-surface"><button type="button" className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-canvas-deep" onClick={() => toggleGroup(group)} aria-expanded={expanded}><ChevronDown aria-hidden="true" className={`size-4 text-signal transition-transform ${expanded ? "rotate-180" : ""}`} /><span className="flex-1"><span className="block text-sm font-medium text-ink">{group}</span><span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{groupFeatures.length} matching identifiers</span></span><Badge variant="neutral">prefix group</Badge></button>{expanded ? <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-3">{groupFeatures.map((feature) => <div key={feature.id} className="bg-surface p-3"><label htmlFor={`sensor-${feature.id}`} className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-ink">{feature.id}</span><span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">{values[feature.id]?.trim() ? "set" : "missing"}</span></label><Input id={`sensor-${feature.id}`} type="number" inputMode="decimal" step="any" value={values[feature.id] ?? ""} onChange={(event) => updateValue(feature.id, event.target.value)} aria-invalid={Boolean(errors[feature.id])} aria-describedby={errors[feature.id] ? `error-${feature.id}` : undefined} placeholder="optional" className={`mt-2 h-9 font-mono text-xs ${errors[feature.id] ? "border-signal" : ""}`} />{errors[feature.id] ? <p id={`error-${feature.id}`} role="alert" className="mt-1 text-[10px] leading-4 text-signal">{errors[feature.id]}</p> : null}</div>)}</div> : null}</div>; })}</div>
        {!visibleGroups.length ? <p className="mt-6 border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">No sensor identifiers match this search.</p> : null}
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-xs leading-5 text-muted">Blank values are sent as null and surfaced in the diagnostic panel. The demo accepts partial rows but does not claim imputation or calibrated probabilities.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={resetForm}><RotateCcw aria-hidden="true" className="size-3.5" /> Reset</Button><Button type="submit" variant="signal" disabled={isProcessing}><Send aria-hidden="true" className="size-3.5" /> {isProcessing ? "Processing demo" : "Submit prediction"}</Button></div></div>
      </form>
    </section>
  );
}

export { SensorInputForm };

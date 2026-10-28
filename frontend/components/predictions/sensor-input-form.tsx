"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, RotateCcw, Search, Send, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { parseNumericSensorValue } from "@/services/prediction-service";
import type { SensorFeatureDefinition } from "@/types";

interface SensorInputFormProps {
  features: SensorFeatureDefinition[];
  isProcessing: boolean;
  onSubmit: (readings: Record<string, number | null>) => void | Promise<void>;
  isBlocked?: boolean;
}

function SensorInputForm({ features, isProcessing, onSubmit, isBlocked = false }: SensorInputFormProps) {
  const [query, setQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["aa", "ab", "ag"]));

  const groups = useMemo(() => Array.from(new Set(features.map((feature) => feature.group))).sort(), [features]);

  const visibleGroups = useMemo(() => {
    return groups
      .filter((group) => groupFilter === "all" || group === groupFilter)
      .map((group) => {
        const matching = features.filter(
          (feature) =>
            feature.group === group &&
            (query.trim() === "" || feature.id.toLowerCase().includes(query.toLowerCase())),
        );
        return { group, features: matching };
      })
      .filter((entry) => entry.features.length > 0);
  }, [features, groupFilter, groups, query]);

  const filledCount = useMemo(
    () => Object.values(values).filter((value) => value.trim().length > 0).length,
    [values]
  );
  const missingCount = features.length - filledCount;

  function toggleGroup(group: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  function toggleAllGroups() {
    setExpandedGroups((current) => {
      if (current.size === groups.length) {
        return new Set();
      }
      return new Set(groups);
    });
  }

  function updateValue(id: string, raw: string) {
    setValues((current) => ({ ...current, [id]: raw }));
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isProcessing) return;

    const nextErrors: Record<string, string> = {};
    const parsed: Record<string, number | null> = {};

    for (const feature of features) {
      const raw = values[feature.id] ?? "";
      const result = parseNumericSensorValue(raw);
      if (!result.valid) {
        nextErrors[feature.id] = result.error ?? "Numeric value expected";
        continue;
      }
      parsed[feature.id] = result.value;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      // Auto-expand groups that contain errors
      setExpandedGroups((current) => {
        const next = new Set(current);
        for (const feature of features) {
          if (nextErrors[feature.id]) {
            next.add(feature.group);
          }
        }
        return next;
      });
      return;
    }

    void onSubmit(parsed);
  }

  function resetForm() {
    if (isProcessing) return;
    setValues({});
    setErrors({});
  }

  return (
    <section id="single-prediction" aria-labelledby="single-prediction-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Single truck prediction</p>
          <h2 id="single-prediction-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">
            Enter one sensor row without losing the schema.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            All 170 APS feature identifiers are available through searchable prefix groups. Valid zeros are preserved; blank or missing values are sent as null.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="neutral">
            <SlidersHorizontal aria-hidden="true" className="size-3" /> {features.length} fields supported
          </Badge>
          {isBlocked ? (
            <Badge variant="neutral">Inference Gated</Badge>
          ) : null}
        </div>
      </div>

      <form className="mt-8" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-4 border-y border-line bg-surface px-3 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <label className="relative block flex-1">
              <span className="sr-only">Search sensor features</span>
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search identifiers / e.g. aa_000, ay_00"
                className="pl-9"
                disabled={isProcessing}
              />
            </label>
            <label className="sm:w-56">
              <span className="sr-only">Filter sensor prefix group</span>
              <Select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                options={[{ label: "All prefix groups", value: "all" }, ...groups.map((group) => ({ label: `Prefix ${group}`, value: group }))]}
                disabled={isProcessing}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleAllGroups}
              className="whitespace-nowrap font-mono text-xs"
              disabled={isProcessing}
            >
              <ChevronsUpDown aria-hidden="true" className="size-3.5" />
              {expandedGroups.size === groups.length ? "Collapse all" : "Expand all"}
            </Button>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            {filledCount} filled / {missingCount} missing
          </p>
        </div>

        {Object.keys(errors).length > 0 ? (
          <div className="mt-4 border border-signal/40 bg-signal-wash p-4 text-xs text-signal" role="alert">
            <p className="font-semibold">{Object.keys(errors).length} sensor input field(s) have invalid numeric values.</p>
            <p className="mt-1 text-muted">Non-numeric characters, NaN, and Infinity are not accepted. Blank inputs are treated as missing nulls.</p>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {visibleGroups.map(({ group, features: groupFeatures }) => {
            const expanded = expandedGroups.has(group) || query.length > 0 || groupFilter !== "all";
            const groupErrorCount = groupFeatures.filter((f) => Boolean(errors[f.id])).length;
            const groupFilledCount = groupFeatures.filter((f) => (values[f.id] ?? "").trim().length > 0).length;

            return (
              <div key={group} className="border border-line bg-surface">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-canvas-deep"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expanded}
                  disabled={isProcessing}
                >
                  <ChevronDown aria-hidden="true" className={`size-4 text-signal transition-transform ${expanded ? "rotate-180" : ""}`} />
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-ink">Prefix {group}</span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      {groupFeatures.length} identifier(s) · {groupFilledCount} set
                    </span>
                  </span>
                  {groupErrorCount > 0 ? (
                    <Badge variant="signal">{groupErrorCount} error(s)</Badge>
                  ) : null}
                  <Badge variant="neutral">group</Badge>
                </button>
                {expanded ? (
                  <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
                    {groupFeatures.map((feature) => (
                      <div key={feature.id} className="bg-surface p-3">
                        <label htmlFor={`sensor-${feature.id}`} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-ink">{feature.id}</span>
                          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                            {values[feature.id]?.trim() ? "set" : "missing"}
                          </span>
                        </label>
                        <Input
                          id={`sensor-${feature.id}`}
                          type="text"
                          inputMode="decimal"
                          value={values[feature.id] ?? ""}
                          onChange={(event) => updateValue(feature.id, event.target.value)}
                          aria-invalid={Boolean(errors[feature.id])}
                          aria-describedby={errors[feature.id] ? `error-${feature.id}` : undefined}
                          placeholder="null"
                          disabled={isProcessing}
                          className={`mt-2 h-9 font-mono text-xs ${errors[feature.id] ? "border-signal bg-signal-wash/20" : ""}`}
                        />
                        {errors[feature.id] ? (
                          <p id={`error-${feature.id}`} role="alert" className="mt-1 text-[10px] leading-4 text-signal">
                            {errors[feature.id]}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!visibleGroups.length ? (
          <p className="mt-6 border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">
            No sensor identifiers match this search.
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-5 text-muted">
            Blank values are sent as null and surfaced in diagnostics. Partial rows undergo candidate median imputation.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={resetForm} disabled={isProcessing}>
              <RotateCcw aria-hidden="true" className="size-3.5" /> Reset
            </Button>
            <Button type="submit" variant="signal" disabled={isProcessing}>
              <Send aria-hidden="true" className="size-3.5" /> {isProcessing ? "Processing prediction..." : "Submit prediction"}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

export { SensorInputForm };

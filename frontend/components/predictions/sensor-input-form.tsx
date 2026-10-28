"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseNumericSensorValue } from "@/services/prediction-service";
import type { FeatureSchemaSource, SensorFeatureDefinition } from "@/types";

interface SensorInputFormProps {
  features: SensorFeatureDefinition[];
  schemaSource?: FeatureSchemaSource;
  schemaWarning?: string;
  isProcessing: boolean;
  onSubmit: (readings: Record<string, number | null>) => void | Promise<void>;
  isBlocked?: boolean;
}

export function SensorInputForm({
  features,
  schemaSource = "canonical_fallback",
  schemaWarning,
  isProcessing,
  onSubmit,
  isBlocked = false,
}: SensorInputFormProps) {
  const [query, setQuery] = React.useState("");
  const [activeGroup, setActiveGroup] = React.useState("aa");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [confirmClearAll, setConfirmClearAll] = React.useState(false);

  // Group list derived dynamically from features
  const groups = React.useMemo(() => {
    return Array.from(new Set(features.map((feature) => feature.group))).sort();
  }, [features]);

  const effectiveActiveGroup = groups.includes(activeGroup) ? activeGroup : (groups[0] ?? "aa");

  // Group statistics (total, filled, error counts per prefix)
  const groupStats = React.useMemo(() => {
    const stats: Record<string, { total: number; filled: number; errorCount: number }> = {};
    for (const g of groups) {
      stats[g] = { total: 0, filled: 0, errorCount: 0 };
    }
    for (const f of features) {
      const g = f.group;
      if (!stats[g]) {
        stats[g] = { total: 0, filled: 0, errorCount: 0 };
      }
      stats[g].total += 1;
      const raw = values[f.id] ?? "";
      if (raw.trim().length > 0) {
        stats[g].filled += 1;
      }
      if (errors[f.id]) {
        stats[g].errorCount += 1;
      }
    }
    return stats;
  }, [features, groups, values, errors]);

  // Overall counts
  const filledCount = React.useMemo(() => {
    return Object.values(values).filter((v) => v.trim().length > 0).length;
  }, [values]);
  const missingCount = Math.max(0, features.length - filledCount);
  const invalidCount = Object.keys(errors).length;
  const fillPercentage = features.length > 0 ? (filledCount / features.length) * 100 : 0;

  // Search filter
  const trimmedQuery = query.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const displayedFeatures = React.useMemo(() => {
    if (isSearching) {
      return features.filter(
        (f) =>
          f.id.toLowerCase().includes(trimmedQuery) ||
          f.group.toLowerCase().includes(trimmedQuery)
      );
    }
    return features.filter((f) => f.group === effectiveActiveGroup);
  }, [features, isSearching, trimmedQuery, effectiveActiveGroup]);

  function updateValue(id: string, raw: string) {
    setValues((current) => ({ ...current, [id]: raw }));
    setErrors((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function clearCurrentGroup() {
    if (isProcessing) return;
    const currentGroupFeatures = features.filter((f) => f.group === effectiveActiveGroup);
    setValues((prev) => {
      const next = { ...prev };
      for (const f of currentGroupFeatures) {
        delete next[f.id];
      }
      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      for (const f of currentGroupFeatures) {
        delete next[f.id];
      }
      return next;
    });
  }

  function handleClearAll() {
    if (isProcessing) return;
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      setTimeout(() => setConfirmClearAll(false), 3000);
      return;
    }
    setValues({});
    setErrors({});
    setConfirmClearAll(false);
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
        nextErrors[feature.id] = "Must be a valid finite number or empty";
        continue;
      }
      parsed[feature.id] = result.value;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      // Auto-switch to first group with error
      const firstErrorFeature = features.find((f) => Boolean(nextErrors[f.id]));
      if (firstErrorFeature) {
        setActiveGroup(firstErrorFeature.group);
      }
      return;
    }

    void onSubmit(parsed);
  }

  return (
    <section
      id="single-prediction"
      aria-labelledby="single-prediction-heading"
      className="border-b border-line px-5 py-8 sm:px-8 lg:px-10"
    >
      {/* Stage Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            02 / Sensor configuration
          </p>
          <h2
            id="single-prediction-heading"
            className="mt-2 font-display text-3xl leading-none tracking-[-0.035em] text-ink sm:text-4xl"
          >
            Enter sensor readings across 170 features.
          </h2>
          <p className="mt-3 max-w-2xl text-xs leading-5 text-muted">
            Navigate groups or search by sensor ID. Blank values are sent as null; valid zeros (0) are preserved.
          </p>
          {schemaSource === "canonical_fallback" && schemaWarning ? (
            <p className="mt-1 font-mono text-[11px] text-muted">
              Note: {schemaWarning}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={schemaSource === "backend_verified" ? "success" : "neutral"}>
            <SlidersHorizontal aria-hidden="true" className="size-3" />
            {schemaSource === "backend_verified"
              ? "Backend verified (170 features)"
              : "Canonical fallback (170 features)"}
          </Badge>
          {isBlocked ? <Badge variant="neutral">Inference Gated</Badge> : null}
        </div>
      </div>

      <form className="mt-6" onSubmit={handleSubmit} noValidate>
        {/* Metrics Overview Bar */}
        <div className="border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 font-mono text-xs">
              <div>
                <span className="text-muted uppercase text-[10px] tracking-wider block">Total features</span>
                <span className="text-ink font-semibold text-sm">{features.length}</span>
              </div>
              <div className="border-l border-line pl-4">
                <span className="text-muted uppercase text-[10px] tracking-wider block">Populated</span>
                <span className="text-ink font-semibold text-sm">{filledCount}</span>
              </div>
              <div className="border-l border-line pl-4">
                <span className="text-muted uppercase text-[10px] tracking-wider block">Missing (null)</span>
                <span className="text-muted font-semibold text-sm">{missingCount}</span>
              </div>
              <div className="border-l border-line pl-4">
                <span className="text-muted uppercase text-[10px] tracking-wider block">Invalid values</span>
                <span className={`font-semibold text-sm ${invalidCount > 0 ? "text-signal font-bold" : "text-muted"}`}>
                  {invalidCount}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:w-56 w-full">
              <div className="flex-1">
                <div className="flex justify-between font-mono text-[10px] text-muted mb-1">
                  <span>Fill rate</span>
                  <span>{fillPercentage.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full bg-canvas-deep rounded-full overflow-hidden">
                  <div
                    className="h-full bg-signal transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, fillPercentage))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Groups Navigator Bar */}
        <div className="mt-4 border border-line bg-surface p-4">
          {/* Search bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search features / e.g. aa_000, ay, ag_002"
                className="pl-9 h-9 font-mono text-xs"
                disabled={isProcessing}
              />
              {isSearching ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  aria-label="Clear search"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ) : null}
            </div>
            {isSearching ? (
              <Badge variant="signal">
                {displayedFeatures.length} matching feature(s)
              </Badge>
            ) : null}
          </div>

          {/* Prefix Navigator */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                Prefix Navigator ({groups.length} groups)
              </span>
              <span className="font-mono text-[10px] text-muted">
                Click prefix to view inputs
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto p-2 bg-canvas-deep/40 border border-line rounded flex flex-wrap gap-1.5">
              {groups.map((group) => {
                const isSelected = !isSearching && effectiveActiveGroup === group;
                const stats = groupStats[group] ?? { total: 0, filled: 0, errorCount: 0 };

                return (
                  <button
                    key={group}
                    type="button"
                    onClick={() => {
                      setActiveGroup(group);
                      if (isSearching) setQuery("");
                    }}
                    disabled={isProcessing}
                    className={`flex items-center gap-1.5 px-2 py-1 font-mono text-xs rounded border transition-colors ${
                      isSelected
                        ? "border-signal bg-signal text-surface font-semibold shadow-sm"
                        : "border-line bg-surface hover:bg-canvas-deep text-ink"
                    }`}
                    aria-pressed={isSelected}
                    aria-label={`Prefix ${group}: ${stats.filled} of ${stats.total} set`}
                  >
                    <span>{group}</span>
                    <span
                      className={`text-[10px] ${
                        isSelected ? "text-surface/85" : "text-muted"
                      }`}
                    >
                      {stats.filled}/{stats.total}
                    </span>
                    {stats.errorCount > 0 ? (
                      <span
                        className="size-1.5 rounded-full bg-signal"
                        title={`${stats.errorCount} error(s)`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Validation Errors Notice */}
        {invalidCount > 0 ? (
          <div
            className="mt-4 border border-signal/40 bg-signal-wash p-4 text-xs text-signal flex items-start gap-3"
            role="alert"
          >
            <AlertCircle aria-hidden="true" className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                {invalidCount} sensor field(s) have invalid numeric inputs.
              </p>
              <p className="mt-1 text-muted">
                Inputs must be valid finite numbers or blank. Non-numeric strings, NaN, and Infinity are not accepted.
              </p>
            </div>
          </div>
        ) : null}

        {/* Active Group / Search Results Form Area */}
        <div className="mt-4 border border-line bg-surface p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-line gap-2">
            <div>
              <h3 className="font-mono text-sm font-medium text-ink">
                {isSearching
                  ? `Search results for "${query}"`
                  : `Prefix group: ${effectiveActiveGroup.toUpperCase()}`}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted mt-0.5">
                {displayedFeatures.length} sensor feature(s)
                {!isSearching && groupStats[effectiveActiveGroup]
                  ? ` · ${groupStats[effectiveActiveGroup]?.filled ?? 0} set · ${
                      (groupStats[effectiveActiveGroup]?.total ?? 0) - (groupStats[effectiveActiveGroup]?.filled ?? 0)
                    } missing`
                  : ""}
              </p>
            </div>
            {!isSearching ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearCurrentGroup}
                  disabled={isProcessing || (groupStats[effectiveActiveGroup]?.filled ?? 0) === 0}
                  className="font-mono text-xs"
                >
                  <RotateCcw aria-hidden="true" className="size-3" /> Clear group {effectiveActiveGroup}
                </Button>
              </div>
            ) : null}
          </div>

          {displayedFeatures.length === 0 ? (
            <p className="py-8 text-center font-mono text-xs text-muted">
              No sensor features match &quot;{query}&quot;.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {displayedFeatures.map((feature) => {
                const val = values[feature.id] ?? "";
                const isSet = val.trim().length > 0;
                const hasError = Boolean(errors[feature.id]);

                return (
                  <div
                    key={feature.id}
                    className={`p-2.5 rounded border transition-colors ${
                      hasError
                        ? "border-signal bg-signal-wash/20"
                        : isSet
                        ? "border-line bg-canvas-deep/30"
                        : "border-line bg-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor={`sensor-${feature.id}`}
                        className="font-mono text-xs font-semibold text-ink"
                      >
                        {feature.id}
                      </label>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                        {hasError ? (
                          <span className="text-signal font-semibold">invalid</span>
                        ) : isSet ? (
                          <span className="text-success font-medium">set</span>
                        ) : (
                          "null"
                        )}
                      </span>
                    </div>

                    <Input
                      id={`sensor-${feature.id}`}
                      type="text"
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => updateValue(feature.id, e.target.value)}
                      placeholder="null"
                      disabled={isProcessing}
                      aria-invalid={hasError}
                      aria-describedby={hasError ? `error-${feature.id}` : undefined}
                      className={`mt-1.5 h-8 font-mono text-xs ${
                        hasError ? "border-signal bg-signal-wash/30 text-signal" : ""
                      }`}
                    />
                    {hasError ? (
                      <p
                        id={`error-${feature.id}`}
                        role="alert"
                        className="mt-1 font-mono text-[10px] text-signal"
                      >
                        {errors[feature.id]}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky Sensor Action Bar */}
        <div className="sticky bottom-0 z-20 mt-6 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-ink font-medium">
                {filledCount} / {features.length} populated
              </span>
              <span className="font-mono text-[11px] text-muted">
                ({missingCount} missing nulls)
              </span>

              {invalidCount > 0 ? (
                <Badge variant="signal">
                  <AlertCircle aria-hidden="true" className="size-3" />
                  {invalidCount} Invalid numeric value(s)
                </Badge>
              ) : isBlocked ? (
                <Badge variant="neutral">
                  <ShieldAlert aria-hidden="true" className="size-3" />
                  Inference Gated
                </Badge>
              ) : (
                <Badge variant="success">
                  <Check aria-hidden="true" className="size-3" />
                  Ready for inference
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={isProcessing || filledCount === 0}
                className="font-mono text-xs"
              >
                <Trash2 aria-hidden="true" className="size-3" />
                {confirmClearAll ? "Confirm clear all 170?" : "Clear all"}
              </Button>

              <Button
                type="submit"
                variant="signal"
                size="sm"
                disabled={isProcessing}
                className="font-mono text-xs"
              >
                {isProcessing ? (
                  <>Processing prediction...</>
                ) : isBlocked ? (
                  <>
                    <ShieldAlert aria-hidden="true" className="size-3.5" />
                    Submit prediction (Gated)
                  </>
                ) : (
                  <>
                    <Send aria-hidden="true" className="size-3.5" />
                    Submit prediction
                  </>
                )}
              </Button>
            </div>
          </div>
          {isBlocked ? (
            <p className="mt-1 text-[11px] text-muted font-mono">
              Safeguard active: Candidate models are unapproved (promotions: 0). Submissions remain gated by backend policy.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

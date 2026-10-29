"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, LoaderCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatPercent } from "@/lib/formatters";
import {
  fetchHistoricalValidation,
  mapHistoricalValidationToModel,
} from "@/services/historical-evidence-service";
import type { FeatureImportance, ModelEvaluation } from "@/types";

interface FeatureImportanceChartProps {
  models: ModelEvaluation[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

function FeatureImportanceChartComponent({
  models,
  selectedModelId,
  onSelectModel,
}: FeatureImportanceChartProps) {
  // Filter options with usable feature importance evidence
  const modelsWithArtifacts = React.useMemo(() => {
    return models.filter(
      (m) =>
        m.featureImportanceAvailable ||
        (m.featureImportance && m.featureImportance.length > 0),
    );
  }, [models]);

  // Track user selection separately to allow deterministic default without forcing page-level change
  const [userSelectedModelId, setUserSelectedModelId] = React.useState<string | null>(null);

  // Deterministic active model ID:
  // 1. User's manual selection if still valid
  // 2. Page-level selectedModelId if it has a valid feature importance artifact
  // 3. First model with an artifact in deterministic ordering (sorted models list)
  // 4. Fallback to page selectedModelId or models[0]
  const activeModelId = React.useMemo(() => {
    if (userSelectedModelId && models.some((m) => m.modelId === userSelectedModelId)) {
      return userSelectedModelId;
    }
    const pageModel = models.find((m) => m.modelId === selectedModelId);
    if (
      pageModel &&
      (pageModel.featureImportanceAvailable ||
        (pageModel.featureImportance && pageModel.featureImportance.length > 0))
    ) {
      return pageModel.modelId;
    }
    return modelsWithArtifacts[0]?.modelId ?? selectedModelId ?? models[0]?.modelId;
  }, [userSelectedModelId, models, selectedModelId, modelsWithArtifacts]);

  const activeModel = React.useMemo(() => {
    return models.find((model) => model.modelId === activeModelId) ?? models[0];
  }, [models, activeModelId]);

  // Local fetch state for models whose importance data was not pre-embedded
  const [fetchedImportance, setFetchedImportance] = React.useState<
    Record<string, FeatureImportance[]>
  >({});
  const [loadingModelId, setLoadingModelId] = React.useState<string | null>(null);
  const [loadErrors, setLoadErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!activeModelId) return;

    // Check if already embedded on model
    const currentModel = models.find((m) => m.modelId === activeModelId);
    if (currentModel?.featureImportance && currentModel.featureImportance.length > 0) {
      return;
    }

    // Check if already fetched
    if (fetchedImportance[activeModelId] !== undefined) {
      return;
    }

    // Check if model claims to have artifact
    if (!currentModel?.featureImportanceAvailable) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingModelId(activeModelId);

      void fetchHistoricalValidation(activeModelId)
        .then((raw) => {
          if (cancelled) return;
          const detail = mapHistoricalValidationToModel(raw);
          setFetchedImportance((prev) => ({
            ...prev,
            [activeModelId]: detail?.featureImportance ?? [],
          }));
        })
        .catch((err) => {
          if (cancelled) return;
          setLoadErrors((prev) => ({
            ...prev,
            [activeModelId]:
              err instanceof Error
                ? err.message
                : "Feature importance could not be retrieved.",
          }));
        })
        .finally(() => {
          if (!cancelled) setLoadingModelId(null);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeModelId, models, fetchedImportance]);

  const loadError = activeModel ? loadErrors[activeModel.modelId] ?? null : null;

  // Determine effective importance values
  const effectiveImportance = React.useMemo(() => {
    if (!activeModel) return [];
    if (activeModel.featureImportance && activeModel.featureImportance.length > 0) {
      return activeModel.featureImportance;
    }
    return fetchedImportance[activeModel.modelId] ?? [];
  }, [activeModel, fetchedImportance]);

  const top15 = React.useMemo(() => {
    return effectiveImportance.slice(0, 15);
  }, [effectiveImportance]);

  const maxImportance = React.useMemo(() => {
    return Math.max(...top15.map((f) => f.importance), 0);
  }, [top15]);

  const isNormalized = maxImportance <= 1.0;

  const chartData = React.useMemo(() => {
    return top15.map((feature) => ({
      feature: feature.featureName,
      importance: feature.importance,
    }));
  }, [top15]);

  const modelOptions = React.useMemo(() => {
    return models.map((model) => {
      const hasArtifact =
        model.featureImportanceAvailable ||
        (model.featureImportance && model.featureImportance.length > 0);
      return {
        label: hasArtifact ? model.modelName : `${model.modelName} (Artifact unavailable)`,
        value: model.modelId,
      };
    });
  }, [models]);

  const handleSelectModel = React.useCallback(
    (newModelId: string) => {
      setUserSelectedModelId(newModelId);
      onSelectModel(newModelId);
    },
    [onSelectModel],
  );

  if (!activeModel) return null;

  const isLoading = loadingModelId === activeModel.modelId;
  const hasArtifact =
    effectiveImportance.length > 0 ||
    activeModel.featureImportanceAvailable ||
    (activeModel.featureImportance && activeModel.featureImportance.length > 0);

  return (
    <section
      id="feature-importance"
      aria-labelledby="feature-importance-heading"
      className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14"
    >
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            05 / Feature importance
          </p>
          <h2
            id="feature-importance-heading"
            className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl"
          >
            See which signals move the artifact.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Importance is model-specific. Logistic Regression uses absolute
            coefficients while tree models use gain or split frequency; values
            across methodologies are not directly comparable.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <label
            htmlFor="importance-model"
            className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
          >
            Importance model
          </label>
          <Select
            id="importance-model"
            value={activeModel.modelId}
            onChange={(event) => handleSelectModel(event.target.value)}
            options={modelOptions}
          />
        </div>
      </div>

      {modelsWithArtifacts.length === 0 ? (
        <div className="mt-8 border border-line bg-surface p-8 text-center sm:p-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Feature importance
          </p>
          <h3 className="mt-3 text-lg font-medium text-ink">
            No feature-importance artifacts available
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
            None of the compared historical model records include persisted feature
            attribution artifacts. Global feature attribution requires serialized
            pipeline weights or gain logs.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="min-w-0 border-t border-charcoal bg-surface p-5 sm:p-7">
            <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  Top 15 influential features
                </p>
                <p className="mt-1 text-sm text-ink">{activeModel.modelName}</p>
              </div>
              <Badge variant="neutral">
                <BarChart3 aria-hidden="true" className="size-3" />{" "}
                {importanceMethod(top15[0]?.methodology)}
              </Badge>
            </div>

            {isLoading ? (
              <div
                className="flex h-[440px] flex-col items-center justify-center text-center"
                role="status"
              >
                <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-signal" />
                <p className="mt-3 font-mono text-xs text-muted">
                  Loading feature importance artifact for {activeModel.modelName}…
                </p>
              </div>
            ) : loadError ? (
              <div className="flex h-[440px] flex-col items-center justify-center p-6 text-center">
                <p className="text-sm font-medium text-ink">
                  Feature importance could not be retrieved
                </p>
                <p className="mt-1 text-xs text-muted">{loadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setLoadErrors((prev) => {
                      const next = { ...prev };
                      delete next[activeModel.modelId];
                      return next;
                    });
                    setFetchedImportance((prev) => {
                      const next = { ...prev };
                      delete next[activeModel.modelId];
                      return next;
                    });
                  }}
                >
                  Retry loading
                </Button>
              </div>
            ) : top15.length > 0 ? (
              <div
                className="mt-7 h-[440px] w-full"
                role="img"
                aria-label={`Feature importance chart for ${activeModel.modelName}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 8, right: 24, bottom: 8, left: 10 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#d9d6ce" strokeDasharray="1 4" />
                    <XAxis
                      type="number"
                      domain={isNormalized ? [0, 1] : [0, "auto"]}
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: "#787873",
                        fontFamily: "var(--font-ibm-plex-mono)",
                        fontSize: 10,
                      }}
                      tickFormatter={(value: number) =>
                        isNormalized ? `${(value * 100).toFixed(0)}%` : value.toFixed(1)
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="feature"
                      width={64}
                      tickLine={false}
                      axisLine={false}
                      tick={{
                        fill: "#2A2A2A",
                        fontFamily: "var(--font-ibm-plex-mono)",
                        fontSize: 10,
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: "#ebe8e0" }}
                      contentStyle={{
                        border: "1px solid #b8b5ac",
                        borderRadius: 0,
                        background: "#fbfaf7",
                        fontFamily: "var(--font-ibm-plex-mono)",
                        fontSize: 11,
                      }}
                      formatter={(value) =>
                        isNormalized
                          ? formatPercent(Number(value ?? 0))
                          : Number(value ?? 0).toFixed(3)
                      }
                    />
                    <Bar dataKey="importance" fill="#E10600" barSize={16} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[440px] flex-col items-center justify-center p-6 text-center">
                <Badge variant="neutral" className="mb-3">
                  Artifact unavailable
                </Badge>
                <p className="text-sm font-medium text-ink">
                  No feature importance artifact for {activeModel.modelName}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted">
                  This comparison entry was recorded from the external validation sweep without
                  retaining individual model attribution files.
                </p>
                {modelsWithArtifacts.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-5"
                    onClick={() => handleSelectModel(modelsWithArtifacts[0].modelId)}
                  >
                    View available artifact ({modelsWithArtifacts[0].modelName})
                  </Button>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-l-2 border-signal pl-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Interpretation note
            </p>
            <p className="mt-5 text-lg leading-7 text-ink">
              A high score identifies an influential signal inside one model, not a causal
              explanation of APS failure.
            </p>
            <p className="mt-6 text-sm leading-6 text-muted">
              Use this view to decide which features deserve deeper domain review. Compare like
              with like: coefficients, gain and split frequency answer different questions.
            </p>

            <div className="mt-8 border-t border-line pt-4 font-mono text-[10px] uppercase leading-5 tracking-[0.1em] text-muted">
              Selected model / {activeModel.modelName}
              <br />
              Method / {importanceMethod(top15[0]?.methodology)}
              <br />
              Artifact status /{" "}
              {hasArtifact
                ? "Available from backend evidence"
                : "Not retained in historical metadata"}
            </div>

            <div className="mt-6 flex items-start gap-2.5 border border-line bg-surface p-3 text-xs leading-5 text-muted">
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" />
              <span>
                Feature importance values are strictly model-specific. Never substitute values from
                different architectures or treat correlations as physical defect causes.
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function importanceMethod(methodology: FeatureImportance["methodology"] | undefined): string {
  if (methodology === "absolute_coefficient") return "absolute coefficient";
  if (methodology === "split_frequency") return "split frequency";
  if (methodology === "gain") return "gain";
  return "not available";
}

export const FeatureImportanceChart = React.memo(FeatureImportanceChartComponent);

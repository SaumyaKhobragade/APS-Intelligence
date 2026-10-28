import * as React from "react";
import {
  CheckCircle2,
  Clock3,
  Code2,
  Database,
  FileCheck2,
  Layers,
  ShieldAlert,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/formatters";
import type { ModelEvaluation } from "@/types";

interface ModelDetailsPanelProps {
  model: ModelEvaluation;
}

function ModelDetailsPanelComponent({ model }: ModelDetailsPanelProps) {
  const hpEntries = Object.entries(model.hyperparameters ?? {});
  const hasHyperparameters = hpEntries.length > 0;

  const trainingDuration =
    model.trainingDurationSeconds !== undefined && model.trainingDurationSeconds !== null
      ? `${model.trainingDurationSeconds.toFixed(2)}s`
      : "Not recorded in historical metadata";

  const rocAucDisplay =
    model.rocAuc !== undefined && model.rocAuc !== null
      ? formatPercent(model.rocAuc)
      : "Not recorded in historical metadata";

  const balancedAccuracyDisplay =
    model.balancedAccuracy !== undefined && model.balancedAccuracy !== null
      ? formatPercent(model.balancedAccuracy)
      : "Not recorded in historical metadata";

  const specificityDisplay =
    model.specificity !== undefined && model.specificity !== null
      ? formatPercent(model.specificity)
      : "Not recorded in historical metadata";

  const artifactStatusDisplay = model.artifactAvailable
    ? "Available on filesystem"
    : "Artifact unavailable (metrics-only record)";

  const featureImportanceStatusDisplay = model.featureImportanceAvailable
    ? "Available"
    : "Artifact unavailable";

  return (
    <section
      id="model-details"
      aria-labelledby="model-details-heading"
      className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14"
    >
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            06 / Model details
          </p>
          <h2
            id="model-details-heading"
            className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl"
          >
            Open the artifact contract.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Configuration, provenance, and evaluation context stay beside the metrics so a score
            is never detached from its dataset or threshold.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {model.candidateLabel ? (
            <Badge variant="signal">Candidate</Badge>
          ) : (
            <Badge variant="neutral">Historical record</Badge>
          )}
          <Badge variant="success">
            <FileCheck2 aria-hidden="true" className="size-3" /> {model.evaluationStatus}
          </Badge>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.75fr_1.25fr]">
        {/* Left Column: Selected Artifact Summary Card */}
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">
            Selected artifact
          </p>
          <h3 className="mt-5 font-display text-4xl leading-none tracking-[-0.04em] sm:text-5xl">
            {model.modelName}
          </h3>
          <p className="mt-3 font-mono text-xs uppercase tracking-wider text-silver/75">
            Architecture / {model.modelType}
          </p>

          <div className="mt-8 space-y-4 border-t border-white/15 pt-5">
            <DetailLine
              icon={SlidersHorizontal}
              label="Classification threshold"
              value={formatPercent(model.threshold)}
              note={
                model.threshold === 0.5
                  ? "Standard default threshold (50%)"
                  : "Calibrated operating point"
              }
            />
            <DetailLine
              icon={Database}
              label="Training dataset"
              value={model.trainingDataset}
            />
            <DetailLine
              icon={FileCheck2}
              label="Evaluation dataset"
              value={model.evaluationDataset}
            />
            <DetailLine
              icon={Clock3}
              label="Training duration"
              value={trainingDuration}
            />
          </div>

          <div className="mt-8 border-t border-white/15 pt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver/60">
              Evaluation scope
            </p>
            <p className="mt-2 text-sm text-silver/90">
              {model.evaluationScope ?? "External validation"}
            </p>
            <p className="mt-1 text-xs text-silver/60">
              Metrics are derived from holdout validation evidence; distinct from internal CV and official-test scopes.
            </p>
          </div>
        </div>

        {/* Right Column: Structured Evidence Groups */}
        <div className="space-y-6">
          {/* Group 1: Model Configuration & Hyperparameters */}
          <div className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Group 01 / Model configuration & hyperparameters
                  </p>
                  <p className="mt-1 text-sm font-medium text-ink">
                    Persisted training configuration & estimator parameters
                  </p>
                </div>
                <Badge variant={hasHyperparameters ? "neutral" : "neutral"}>
                  <Layers aria-hidden="true" className="size-3" />{" "}
                  {hasHyperparameters
                    ? `${hpEntries.length} parameters`
                    : "Not recorded"}
                </Badge>
              </div>
            </div>

            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 border-b border-line pb-4 sm:grid-cols-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    Model family
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink">{model.modelType}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    Imbalance strategy
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink">
                    {model.strategy ?? "original"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    Missing-value handling
                  </p>
                  <p className="mt-1 font-mono text-sm text-ink">
                    {model.modelType === "catboost" || model.modelType === "xgboost"
                      ? "Native NaN support"
                      : "Median imputation (fitted on train)"}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  Estimator hyperparameters
                </p>
                {hasHyperparameters ? (
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {hpEntries.map(([key, value]) => (
                      <div
                        key={key}
                        className="border border-line bg-canvas-deep/40 p-3"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                          {key.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-ink">
                          <Code2 aria-hidden="true" className="size-3 text-signal" />
                          {value === null ? "null" : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-line p-4 text-center">
                    <p className="font-mono text-xs text-muted">
                      Not recorded in historical metadata
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Estimator hyperparameters were not persisted in this comparison summary record.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Group 2: Dataset and Split Provenance */}
          <div className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Group 02 / Dataset & split provenance
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                Data partitions and split boundary isolation
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Training partition
                </p>
                <p className="mt-1.5 break-words font-mono text-xs text-ink">
                  {model.trainingDataset}
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Evaluation partition
                </p>
                <p className="mt-1.5 break-words font-mono text-xs text-ink">
                  {model.evaluationDataset}
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Evaluation scope
                </p>
                <p className="mt-1.5 font-mono text-xs text-signal">
                  {model.evaluationScope ?? "validation"}
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Training duration
                </p>
                <p className="mt-1.5 font-mono text-xs text-ink">{trainingDuration}</p>
              </div>
            </div>
          </div>

          {/* Group 3: Evaluation Context */}
          <div className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Group 03 / Evaluation context & metrics
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                Operating point performance on holdout validation data
              </p>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    PR-AUC (Primary)
                  </p>
                  <p className="mt-2 font-mono text-xl font-medium text-signal">
                    {formatPercent(model.prAuc)}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    ROC-AUC
                  </p>
                  <p className="mt-2 font-mono text-xl text-ink">{rocAucDisplay}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    Balanced accuracy
                  </p>
                  <p className="mt-2 font-mono text-xl text-ink">
                    {balancedAccuracyDisplay}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                    Specificity
                  </p>
                  <p className="mt-2 font-mono text-xl text-ink">{specificityDisplay}</p>
                </div>
              </div>

              {model.crossValidation ? (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    Cross-validation evidence (Search space)
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                    CV PR-AUC:{" "}
                    <span className="font-mono font-semibold">
                      {model.crossValidation.prAucMean?.toFixed(3) ?? "—"}
                    </span>{" "}
                    ± {model.crossValidation.prAucStd?.toFixed(3) ?? "—"} across{" "}
                    <span className="font-mono font-semibold">
                      {model.crossValidation.folds ?? 3}
                    </span>{" "}
                    folds (search budget: {model.crossValidation.searchBudget ?? 6}).
                    Cross-validation is evaluated separately from holdout validation.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* Group 4: Artifact Integrity & Governance */}
          <div className="border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Group 04 / Artifact integrity & governance
              </p>
              <p className="mt-1 text-sm font-medium text-ink">
                Filesystem artifact presence and verification contract
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Integrity status
                </p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-ink">
                  {model.artifactIntegrityStatus === "verified" ? (
                    <CheckCircle2 aria-hidden="true" className="size-3 text-success" />
                  ) : (
                    <XCircle aria-hidden="true" className="size-3 text-muted" />
                  )}
                  {model.artifactIntegrityStatus ?? "not_recorded"}
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Serialized model
                </p>
                <p className="mt-1.5 font-mono text-xs text-ink">
                  {artifactStatusDisplay}
                </p>
              </div>
              <div className="bg-surface p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  Feature attribution
                </p>
                <p className="mt-1.5 font-mono text-xs text-ink">
                  {featureImportanceStatusDisplay}
                </p>
              </div>
            </div>

            <div className="border-t border-line px-5 py-4">
              <div className="flex items-start gap-2.5 text-xs leading-5 text-muted">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" />
                <div>
                  <p className="font-medium text-ink">
                    Governance Status:{" "}
                    {model.candidateLabel ?? "Historical validation benchmark"}
                  </p>
                  <p className="mt-0.5">
                    This artifact is preserved for comparative evaluation. Neither candidate selection nor historical ranking implies production promotion or operational signoff.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailLine({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Clock3;
  label: string;
  value?: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-silver/65">
          {label}
        </p>
        <p className="mt-0.5 break-words font-mono text-xs font-semibold text-white">
          {value ?? "Unavailable"}
        </p>
        {note ? <p className="mt-0.5 font-mono text-[9px] text-silver/50">{note}</p> : null}
      </div>
    </div>
  );
}

export const ModelDetailsPanel = React.memo(ModelDetailsPanelComponent);

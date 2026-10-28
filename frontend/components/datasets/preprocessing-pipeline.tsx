import * as React from "react";
import {
  ArrowRight,
  Check,
  CircleDashed,
  Clock3,
  Database,
  FlaskConical,
  Info,
  Layers,
  LoaderCircle,
  Minus,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PreprocessingStage, PreprocessingStageStatus } from "@/types";

interface PreprocessingPipelineProps {
  stages?: PreprocessingStage[];
}

const DEFAULT_STAGES: PreprocessingStage[] = [
  {
    id: "raw-ingestion",
    label: "1. Raw dataset ingestion",
    description: "Ingest tabular sensor telemetry from source artifact without in-memory mutations.",
    status: "completed",
    detail: "170 numeric operational sensor attributes ingested",
    partition: "All partitions",
    fittingType: "contract_boundary",
    fittingLabel: "Ingestion / verification",
  },
  {
    id: "schema-validation",
    label: "2. Schema validation & feature identification",
    description: "Verify 170 numeric operational sensor columns and failure target column (class).",
    status: "completed",
    detail: "Target: class (pos / neg) · Strict column schema",
    partition: "All partitions",
    fittingType: "contract_boundary",
    fittingLabel: "Rule validation (unfitted)",
  },
  {
    id: "train-val-split",
    label: "3. Training/validation split",
    description: "Stratified partition preserving failure class ratio. Strict isolation prevents holdout leakage.",
    status: "completed",
    detail: "Holdout partitions remain separate and unexposed",
    partition: "Split boundary",
    fittingType: "contract_boundary",
    fittingLabel: "Partition boundary (strict isolation)",
  },
  {
    id: "missing-values",
    label: "4. Missing-value handling",
    description: "Imputation statistics (median/constant) fitted strictly on training data only. Native NaN support used for tree ensembles.",
    status: "applied",
    detail: "Imputation parameters learned strictly from training partition",
    partition: "Fitted on training only · Applied downstream",
    fittingType: "fitted_train_only",
    fittingLabel: "Fitted on training only",
  },
  {
    id: "feature-scaling",
    label: "5. Feature transformation & scaling",
    description: "StandardScaler fitted strictly on training partition features for linear models (Logistic Regression); tree models consume unscaled features directly.",
    status: "applied",
    detail: "StandardScaler fitted on training partition for linear models",
    partition: "Fitted on training only · Applied downstream",
    fittingType: "fitted_train_only",
    fittingLabel: "Fitted on training only",
  },
  {
    id: "class-imbalance",
    label: "6. Class-imbalance handling",
    description: "Resampling (SMOTE) or algorithmic weighting (native class_weight) applied strictly inside training partition/folds. Never resample validation or test sets.",
    status: "applied",
    detail: "Resampling and weighting confined to training partition",
    partition: "Training partition only",
    fittingType: "fitted_train_only",
    fittingLabel: "Training partition only",
  },
  {
    id: "model-ready",
    label: "7. Final model-ready feature representation",
    description: "Standardized 170-dimensional numeric tensor with aligned schema delivered to estimator pipelines.",
    status: "completed",
    detail: "170-dimensional numeric matrix feeding estimator contracts",
    partition: "All partitions (evaluated separately)",
    fittingType: "applied_transform",
    fittingLabel: "Aligned model schema",
  },
];

function PreprocessingPipeline({ stages }: PreprocessingPipelineProps) {
  const activeStages = stages && stages.length > 0 ? stages : DEFAULT_STAGES;

  return (
    <section
      id="preprocessing"
      aria-labelledby="preprocessing-heading"
      className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14"
    >
      <div className="grid gap-10 xl:grid-cols-[0.7fr_1.3fr] xl:gap-16">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">
            06 / Preprocessing pipeline
          </p>
          <h2
            id="preprocessing-heading"
            className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl"
          >
            Make the boundary between raw and ready visible.
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">
            This workflow is a contract preview, not an ML runtime. Any fitted
            imputation, scaling, feature selection or resampling must learn from
            training data only before it touches validation or test data.
          </p>

          <div className="mt-8 flex items-start gap-3 border-l-2 border-signal pl-4">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} />
            <p className="text-sm leading-6 text-ink-soft">
              Holdout validation and test data remain strictly isolated. Their stages only receive
              transformations parameterized by training partition records.
            </p>
          </div>

          <div className="mt-8 border border-line bg-surface p-4 text-xs">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Pipeline governance principles
            </p>
            <ul className="mt-3 space-y-2 text-ink-soft">
              <li className="flex items-start gap-2">
                <span className="font-mono text-signal">01</span>
                <span>Fitted statistics (medians, means, scalers) learn from training folds only.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-signal">02</span>
                <span>Synthetic resampling (SMOTE) is strictly confined to training sets; holdout evaluation preserves genuine class imbalance (1:59).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-signal">03</span>
                <span>Tree models (CatBoost, XGBoost) consume unscaled features and native missing-value indicators.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Transformation boundary / Training pipeline contract
              </p>
              <p className="mt-1 text-sm text-ink">
                Executed offline during model training; frontend is read-only presentation
              </p>
            </div>
            <Badge variant="neutral">
              <FlaskConical aria-hidden="true" className="size-3" /> Training contract
            </Badge>
          </div>

          {/* Fitting boundary highlight card */}
          <div className="mt-5 border-l-2 border-signal bg-canvas-deep/60 px-4 py-3 text-xs leading-5 text-muted">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
              <ShieldAlert aria-hidden="true" className="size-3.5" />
              <span>Training-Only Fitting Boundary</span>
            </div>
            <p className="mt-1 text-ink-soft">
              Stages 4, 5, and 6 fit parameters exclusively on training records. Validation and test sets receive applied transformations without refitting.
            </p>
          </div>

          <ol className="mt-7 space-y-4">
            {activeStages.map((stage, index) => {
              const isFittedTrainOnly =
                stage.fittingType === "fitted_train_only" ||
                stage.partition?.toLowerCase().includes("training only");

              return (
                <li
                  key={stage.id}
                  className={`relative border p-4 transition-colors ${
                    isFittedTrainOnly
                      ? "border-signal/40 bg-signal/[0.02]"
                      : "border-line bg-surface"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center border font-mono text-xs ${
                          statusClasses[stage.status] ?? statusClasses.pending
                        }`}
                      >
                        {statusIcon(stage.status)}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-medium text-ink">{stage.label}</h3>
                          <StatusBadge status={stage.status} />
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-muted">{stage.description}</p>
                      </div>
                    </div>

                    {index < activeStages.length - 1 ? (
                      <ArrowRight
                        aria-hidden="true"
                        className="hidden size-4 shrink-0 text-line-strong lg:block mt-1"
                      />
                    ) : null}
                  </div>

                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
                    {stage.partition ? (
                      <span className="inline-flex items-center gap-1 border border-line bg-canvas-deep px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
                        <Database aria-hidden="true" className="size-2.5 text-muted" />
                        {stage.partition}
                      </span>
                    ) : null}
                    {stage.fittingLabel ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                          isFittedTrainOnly
                            ? "border border-signal/40 bg-signal/10 text-signal font-semibold"
                            : "border border-line bg-surface text-muted"
                        }`}
                      >
                        <Layers aria-hidden="true" className="size-2.5" />
                        {stage.fittingLabel}
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-muted">
                      {stage.detail}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

const statusClasses: Record<PreprocessingStageStatus, string> = {
  completed: "border-success bg-success text-white",
  applied: "border-signal bg-signal text-white",
  in_progress: "border-signal bg-signal text-white",
  pending: "border-line-strong bg-surface text-muted",
  not_applicable: "border-line bg-canvas-deep text-muted",
  unavailable: "border-line-strong bg-canvas-deep text-muted",
};

function statusIcon(status: PreprocessingStageStatus) {
  if (status === "completed") return <Check aria-hidden="true" className="size-3.5" />;
  if (status === "applied") return <Check aria-hidden="true" className="size-3.5" />;
  if (status === "in_progress") return <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />;
  if (status === "not_applicable") return <Minus aria-hidden="true" className="size-3.5" />;
  return <CircleDashed aria-hidden="true" className="size-3.5" />;
}

function StatusBadge({ status }: { status: PreprocessingStageStatus }) {
  const labels: Record<PreprocessingStageStatus, string> = {
    completed: "Completed",
    applied: "Applied",
    in_progress: "In progress",
    pending: "Pending",
    not_applicable: "Not applicable",
    unavailable: "Evidence unavailable",
  };
  const variants: Record<PreprocessingStageStatus, "success" | "signal" | "warning" | "neutral"> = {
    completed: "success",
    applied: "signal",
    in_progress: "signal",
    pending: "warning",
    not_applicable: "neutral",
    unavailable: "neutral",
  };
  return (
    <Badge variant={variants[status] ?? "neutral"}>
      {status === "in_progress" ? <Clock3 aria-hidden="true" className="size-3" /> : null}
      {labels[status] ?? "Pending"}
    </Badge>
  );
}

export { PreprocessingPipeline };

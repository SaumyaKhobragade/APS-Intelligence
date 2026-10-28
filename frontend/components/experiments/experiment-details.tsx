import type { ReactNode } from "react";
import { AlertTriangle, Braces, Clock3, Database, Download, FileJson, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/formatters";
import type { ExperimentHistoryRecord } from "@/types";

interface ExperimentDetailsProps {
  experiment: ExperimentHistoryRecord;
  referenceType?: "training_run" | "experiment";
  onExportJson: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
}

function ExperimentDetails({ experiment, onExportJson, onExportCsv, onExportPdf }: ExperimentDetailsProps) {
  const { details, evaluationResults } = experiment;
  const metrics = evaluationResults;
  const unavailable = details.configurationSnapshot.unavailableFields;
  const historical = experiment.source === "historical";

  return (
    <section id="experiment-details" aria-labelledby="experiment-details-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-5 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Experiment details</p>
          <h2 id="experiment-details-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Reopen the configuration behind the score.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">The selected record is historical evidence. Missing fields remain explicitly unavailable rather than being inferred.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {historical ? <Badge variant="neutral">Historical evidence</Badge> : null}
          <Button size="sm" variant="outline" onClick={onExportJson}><FileJson aria-hidden="true" className="size-3.5" /> Export JSON</Button>
          <Button size="sm" variant="outline" onClick={onExportCsv}><Download aria-hidden="true" className="size-3.5" /> Metrics CSV</Button>
          <Button size="sm" variant="signal" onClick={onExportPdf}><Download aria-hidden="true" className="size-3.5" /> PDF report</Button>
        </div>
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Badge variant="signal">{experiment.id}</Badge>
        <Badge variant="success">{historical ? `Historical ${experiment.phase ?? "evidence"}` : "Backend record"}</Badge>
        {experiment.candidateLabel ? <Badge variant="neutral">{experiment.candidateLabel}</Badge> : null}
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{details.compatibilityNote}</span>
      </div>
      <div className="mt-8 grid gap-8 xl:grid-cols-2">
        <DetailBlock icon={Settings2} eyebrow="Model configuration" title={details.modelConfiguration.modelName}>
          <DetailLine label="Model version" value={details.modelConfiguration.modelVersion} />
          <DetailLine label="Training configuration" value={details.modelConfiguration.trainingConfiguration} />
          <DetailLine label="Random seed" value={details.modelConfiguration.randomSeed} />
          <DetailLine label="Artifact integrity" value={experiment.artifactIntegrityStatus} />
          <DetailLine label="Artifact availability" value={experiment.artifactAvailable === undefined ? undefined : experiment.artifactAvailable ? "Available" : "Unavailable"} />
          <div className="mt-5 border-t border-line pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Hyperparameters</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {Object.entries(details.modelConfiguration.hyperparameters).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-line py-2 text-xs">
                  <span className="text-muted">{key}</span>
                  <span className="font-mono text-ink">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </DetailBlock>
        <DetailBlock icon={Database} eyebrow="Dataset information" title={details.datasetInformation.datasetName}>
          <DetailLine label="Dataset ID" value={details.datasetInformation.datasetId} />
          <DetailLine label="Version" value={details.datasetInformation.datasetVersion} />
          <DetailLine label="Fingerprint" value={details.datasetInformation.fingerprint} />
          <DetailLine label="Training / validation / test" value={`${formatOptionalNumber(details.datasetInformation.trainingRecords)} / ${formatOptionalNumber(details.datasetInformation.validationRecords)} / ${formatOptionalNumber(details.datasetInformation.testRecords)}`} />
          <DetailLine label="Feature count" value={details.datasetInformation.featureCount} />
          <DetailLine label="Class imbalance" value={details.datasetInformation.classImbalanceRatio} />
        </DetailBlock>
        <DetailBlock icon={Braces} eyebrow="Evaluation results" title="Validation artifact">
          <div className="grid gap-4 sm:grid-cols-3">
            <Metric label="PR-AUC" value={metrics.prAuc === undefined ? "Unavailable" : metrics.prAuc.toFixed(3)} />
            <Metric label="Precision" value={formatOptionalPercent(metrics.precision)} />
            <Metric label="Recall" value={formatOptionalPercent(metrics.recall)} />
            <Metric label="F1-score" value={formatOptionalPercent(metrics.f1Score)} />
            <Metric label="Threshold" value={metrics.classificationThreshold?.toFixed(2) ?? "Unavailable"} />
            <Metric label="Cost" value={metrics.businessImpact ? formatCurrency(metrics.businessImpact.estimatedCost) : "Unavailable"} />
          </div>
          {metrics.confusionMatrix ? (
            <div className="mt-6 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
              <Metric label="TP" value={formatNumber(metrics.confusionMatrix.truePositive)} />
              <Metric label="TN" value={formatNumber(metrics.confusionMatrix.trueNegative)} />
              <Metric label="FP" value={formatNumber(metrics.confusionMatrix.falsePositive)} />
              <Metric label="FN" value={formatNumber(metrics.confusionMatrix.falseNegative)} />
            </div>
          ) : (
            <UnavailableNote text="Confusion matrix unavailable for this experiment status." />
          )}
        </DetailBlock>
        <DetailBlock icon={Clock3} eyebrow="Execution and preprocessing" title="How the run was prepared">
          <DetailLine label="Started" value={details.execution.startedAt} />
          <DetailLine label="Ended" value={details.execution.endedAt} />
          <DetailLine label="Duration" value={details.execution.durationSeconds === undefined ? undefined : `${details.execution.durationSeconds}s`} />
          <DetailLine label="Missing-value handling" value={details.preprocessing.missingValueHandling} />
          <DetailLine label="Feature selection" value={details.preprocessing.featureSelection} />
          <DetailLine label="Scaling / transformations" value={details.preprocessing.scalingOrTransformations} />
          <DetailLine label="Class weighting / resampling" value={details.preprocessing.classWeightingOrResampling} />
        </DetailBlock>
      </div>
      {unavailable.length > 0 ? (
        <div className="mt-8 flex items-start gap-3 border-l-2 border-signal bg-signal-wash/40 p-4">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" />
          <p className="text-sm leading-6 text-muted">
            <strong className="font-medium text-ink">Reproducibility gaps:</strong> {unavailable.join(", ")}. This record should not be described as fully reproducible.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function DetailBlock({ icon: Icon, eyebrow, title, children }: { icon: typeof Settings2; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
      <div className="flex items-start gap-3 border-b border-line pb-4">
        <Icon aria-hidden="true" className="mt-0.5 size-4 text-signal" strokeWidth={1.5} />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{eyebrow}</p>
          <p className="mt-2 text-lg font-medium text-ink">{title}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-xs text-muted">{label}</span>
      <span className={`text-right text-xs ${value === undefined ? "italic text-muted" : "text-ink"}`}>
        {value === undefined ? "Unavailable" : String(value)}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-2 font-mono text-lg text-ink">{value}</p>
    </div>
  );
}

function formatOptionalNumber(value?: number): string {
  return value === undefined ? "—" : formatNumber(value);
}

function formatOptionalPercent(value?: number): string {
  return value === undefined ? "—" : formatPercent(value);
}

function UnavailableNote({ text }: { text: string }) {
  return <p className="border border-dashed border-line-strong p-4 text-sm italic text-muted">{text}</p>;
}

export { ExperimentDetails };

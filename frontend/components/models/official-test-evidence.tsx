"use client";

import * as React from "react";
import { Activity, AlertTriangle, BarChart3, CheckCircle2, ShieldCheck } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { downsampleCurve } from "@/lib/downsample";
import { formatNumber, formatPercent } from "@/lib/formatters";
import type { BackendOfficialTestEvidenceResponse } from "@/services/backend-contracts";

interface OfficialTestEvidenceProps {
  evidence: BackendOfficialTestEvidenceResponse;
}

function OfficialTestEvidenceComponent({ evidence }: OfficialTestEvidenceProps) {
  const metric = evidence.metrics;
  const matrix = metric.confusion_matrix;

  const prData = React.useMemo(() => {
    const raw = zipCurve(
      evidence.precision_recall_curve.recall,
      evidence.precision_recall_curve.precision,
      evidence.precision_recall_curve.thresholds,
      "recall",
      "precision",
    );
    return downsampleCurve(raw, "recall", "precision", 100);
  }, [evidence.precision_recall_curve]);

  const rocData = React.useMemo(() => {
    const raw = zipCurve(
      evidence.roc_curve.false_positive_rate,
      evidence.roc_curve.true_positive_rate,
      evidence.roc_curve.thresholds,
      "falsePositiveRate",
      "truePositiveRate",
    );
    return downsampleCurve(raw, "falsePositiveRate", "truePositiveRate", 100);
  }, [evidence.roc_curve]);

  const reliability = React.useMemo(() => {
    return evidence.reliability_curve.flatMap((point) =>
      typeof point.predicted_probability === "number" && typeof point.observed_failure_rate === "number"
        ? [{ predicted: point.predicted_probability, observed: point.observed_failure_rate }]
        : [],
    );
  }, [evidence.reliability_curve]);

  return (
    <section id="official-test" aria-labelledby="official-test-heading" className="border-b border-line bg-canvas-deep/45 px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-5 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">Historical official-test evaluation</p>
          <h2 id="official-test-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Official Test Evaluation</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">These are persisted results from the completed official test evaluation on the untouched 16,000-record test set. They are not production monitoring metrics.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="signal">Official test scope</Badge>
          <Badge variant="neutral">Frozen threshold {evidence.frozen_threshold.toFixed(3)}</Badge>
          <Badge variant="success"><ShieldCheck aria-hidden="true" className="size-3" /> Candidate unchanged</Badge>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Primary Decision Policy Metrics (Frozen Threshold {evidence.frozen_threshold.toFixed(3)})</p>
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="PR-AUC" value={formatPercent(metric.pr_auc ?? 0)} detail="Official test / primary evaluation metric" />
            <Metric label="Recall" value={formatPercent(metric.recall ?? 0)} detail="Threshold 0.115 (340 / 375 caught)" accent />
            <Metric label="Precision" value={formatPercent(metric.precision ?? 0)} detail="Threshold 0.115 (340 / 554 alerts)" />
            <Metric label="Illustrative cost" value={formatNumber(metric.estimated_business_cost ?? 0)} detail="Cost metric: 1×FP + 10×FN = 564 (illustrative)" accent />
          </div>
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Supporting Discrimination & Calibration Metrics</p>
          <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="ROC-AUC" value={formatPercent(metric.roc_auc ?? 0)} detail="Global ranking discrimination" />
            <Metric label="F1 Score" value={formatPercent(metric.f1_score ?? 0)} detail="Harmonic balance at 0.115" />
            <Metric label="Balanced accuracy" value={formatPercent(metric.balanced_accuracy ?? 0)} detail="Macro-averaged class accuracy" />
            <Metric label="Specificity" value={formatPercent(metric.specificity ?? 0)} detail="Healthy fleet retention (15,411 / 15,625)" />
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-silver">Historical frozen candidate</p>
              <h3 className="mt-4 font-display text-4xl leading-none tracking-[-0.04em]">{evidence.model_name}</h3>
            </div>
            <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
          </div>
          <p className="mt-3 text-sm text-silver/80">{evidence.imbalance_strategy} · {evidence.calibration_method} calibration</p>
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/15 pt-5">
            <MetricDark label="TN" value={matrix?.true_negative ?? 0} />
            <MetricDark label="FP" value={matrix?.false_positive ?? 0} />
            <MetricDark label="FN" value={matrix?.false_negative ?? 0} />
            <MetricDark label="TP" value={matrix?.true_positive ?? 0} />
          </div>
          <p className="mt-8 border-t border-white/15 pt-4 text-xs leading-5 text-silver/75">{evidence.candidate_label}</p>
        </div>
        <div className="border-y border-line bg-surface p-5 sm:p-7">
          <div className="flex items-center gap-3 border-b border-line pb-4">
            <Activity aria-hidden="true" className="size-4 text-signal" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Bootstrap uncertainty</p>
              <p className="mt-1 text-sm text-ink">{evidence.confidence_interval_method ?? "Persisted confidence intervals"} / {evidence.confidence_interval_replicates ?? "—"} replicates</p>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-left">
              <thead>
                <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                  <th className="py-3 pr-4">Metric</th>
                  <th className="py-3 pr-4">Lower</th>
                  <th className="py-3">Upper</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(evidence.confidence_intervals).map(([name, interval]) => (
                  <tr key={name} className="border-b border-line text-xs">
                    <td className="py-3 pr-4 font-medium text-ink">{name.replaceAll("_", " ")}</td>
                    <td className="py-3 pr-4 font-mono">{interval.lower.toFixed(6)}</td>
                    <td className="py-3 font-mono">{interval.upper.toFixed(6)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-3">
        <EvidenceChart title="Precision-recall curve" icon={BarChart3} data={prData} x="recall" y="precision" xLabel="Recall" yLabel="Precision" />
        <EvidenceChart title="ROC curve" icon={Activity} data={rocData} x="falsePositiveRate" y="truePositiveRate" xLabel="False-positive rate" yLabel="True-positive rate" />
        <EvidenceChart title="Reliability evidence" icon={ShieldCheck} data={reliability} x="predicted" y="observed" xLabel="Predicted probability" yLabel="Observed rate" />
      </div>

      <div className="mt-8 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(evidence.calibration_metrics).map(([name, value]) => (
          <Metric key={name} label={name.replaceAll("_", " ")} value={typeof value === "number" ? value.toFixed(6) : "—"} detail="Official test calibration" />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5 text-xs text-muted">
        <span className="inline-flex items-center gap-2"><AlertTriangle aria-hidden="true" className="size-3 text-signal" /> Scope is historical official test only</span>
        <span>Evaluation ID / {evidence.evaluation_id}</span>
        <span>Evidence integrity / {evidence.availability[0]?.status ?? "unavailable"}</span>
      </div>
    </section>
  );
}

function zipCurve(
  xValues: number[] | undefined,
  yValues: number[] | undefined,
  thresholds: number[] | undefined,
  x: string,
  y: string,
): Array<Record<string, number>> {
  if (!xValues || !yValues) return [];
  return xValues.flatMap((xValue, index) =>
    typeof xValue === "number" && typeof yValues[index] === "number"
      ? { [x]: xValue, [y]: yValues[index], threshold: typeof thresholds?.[index] === "number" ? thresholds[index] : 0 }
      : [],
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.11em] text-muted">{label}</p>
      <p className={`mt-3 font-mono text-xl ${accent ? "text-signal" : "text-ink"}`}>{value}</p>
      <p className="mt-2 text-xs text-muted">{detail}</p>
    </div>
  );
}

function MetricDark({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/65">{label}</p>
      <p className="mt-2 font-mono text-2xl text-white">{formatNumber(value)}</p>
    </div>
  );
}

function EvidenceChart({
  title,
  icon: Icon,
  data,
  x,
  y,
  xLabel,
  yLabel,
}: {
  title: string;
  icon: typeof Activity;
  data: Array<Record<string, number>>;
  x: string;
  y: string;
  xLabel: string;
  yLabel: string;
}) {
  return (
    <div className="border-t border-charcoal bg-charcoal p-5 sm:p-6">
      <div className="flex items-center gap-3 border-b border-white/15 pb-4">
        <Icon aria-hidden="true" className="size-4 text-signal" />
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-silver">{title}</p>
          <p className="mt-1 text-xs text-silver/65">Persisted official-test coordinates</p>
        </div>
      </div>
      {data.length ? (
        <div className="mt-5 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 10, bottom: 4, left: -18 }}>
              <XAxis dataKey={x} type="number" domain={[0, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontSize: 9 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: xLabel, position: "insideBottomRight", fill: "#787873", fontSize: 9 }} />
              <YAxis dataKey={y} type="number" domain={[0, 1]} tickLine={false} axisLine={false} tick={{ fill: "#C0C0C0", fontSize: 9 }} tickFormatter={(value: number) => value.toFixed(2)} label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "#787873", fontSize: 9 }} />
              <Tooltip contentStyle={{ border: "1px solid #787873", borderRadius: 0, background: "#2A2A2A", color: "#fff", fontSize: 10 }} formatter={(value) => Number(value).toFixed(4)} />
              <Line type="monotone" dataKey={y} stroke="#E10600" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 1.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-5 border border-dashed border-white/20 p-6 text-center text-xs text-silver/70">Curve coordinates unavailable.</p>
      )}
    </div>
  );
}

export const OfficialTestEvidence = React.memo(OfficialTestEvidenceComponent);

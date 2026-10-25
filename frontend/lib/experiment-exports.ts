import type { ExperimentHistoryRecord } from "@/types";

export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function experimentsToCsv(experiments: ExperimentHistoryRecord[]): string {
  const header = ["experiment_id", "name", "model", "dataset", "created_at", "status", "experiment_type", "pr_auc", "precision", "recall", "f1_score", "threshold", "false_positives", "false_negatives", "business_cost"];
  const rows = experiments.map((experiment) => {
    const metrics = experiment.evaluationResults;
    return [experiment.id, experiment.name, experiment.modelName, experiment.datasetName, experiment.createdAt, experiment.status, experiment.experimentType, metrics.prAuc, metrics.precision, metrics.recall, metrics.f1Score, metrics.classificationThreshold, metrics.businessImpact?.falsePositiveCount, metrics.businessImpact?.falseNegativeCount, metrics.businessImpact?.estimatedCost].map(csvCell);
  });
  return [header, ...rows].map((row) => row.join(",")).join("\n");
}

export function experimentsToJson(experiments: ExperimentHistoryRecord[]): string {
  return JSON.stringify({ source: "Demonstration records", experiments }, null, 2);
}

export function experimentToJson(experiment: ExperimentHistoryRecord): string {
  return JSON.stringify({ source: "Demonstration record", experiment }, null, 2);
}

export function experimentComparisonToCsv(experiments: ExperimentHistoryRecord[]): string {
  const header = ["experiment_id", "experiment", "model", "dataset", "pr_auc", "precision", "recall", "f1_score", "false_positives", "false_negatives", "threshold", "business_cost", "training_duration_seconds"];
  const rows = experiments.map((experiment) => {
    const metrics = experiment.evaluationResults;
    return [experiment.id, experiment.name, experiment.modelName, experiment.datasetName, metrics.prAuc, metrics.precision, metrics.recall, metrics.f1Score, metrics.businessImpact?.falsePositiveCount, metrics.businessImpact?.falseNegativeCount, metrics.classificationThreshold, metrics.businessImpact?.estimatedCost, metrics.trainingDurationSeconds].map(csvCell);
  });
  return [header, ...rows].map((row) => row.join(",")).join("\n");
}

function htmlEscape(value: unknown): string {
  return String(value ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPercent(value?: number): string {
  return value === undefined ? "Unavailable" : `${(value * 100).toFixed(1)}%`;
}

function formatCurrency(value?: number): string {
  return value === undefined ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function renderExperimentReportHtml(experiment: ExperimentHistoryRecord): string {
  const { details, evaluationResults } = experiment;
  const confusion = evaluationResults.confusionMatrix;
  const impact = evaluationResults.businessImpact;
  const unavailable = details.configurationSnapshot.unavailableFields.length > 0 ? details.configurationSnapshot.unavailableFields.join(", ") : "None recorded";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(experiment.id)} / APS Intelligence</title><style>body{font-family:Arial,sans-serif;color:#2A2A2A;margin:40px;line-height:1.45}h1,h2{font-family:Georgia,serif;font-weight:400}h1{font-size:40px;margin-bottom:4px}h2{font-size:24px;border-top:2px solid #E10600;padding-top:12px;margin-top:30px}.eyebrow{font:11px monospace;letter-spacing:.12em;text-transform:uppercase;color:#E10600}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.cell{border:1px solid #ccc;padding:12px}.label{font:10px monospace;text-transform:uppercase;color:#666}.value{font:18px monospace;margin-top:5px}.warning{border-left:3px solid #E10600;padding-left:12px}.matrix{border-collapse:collapse}.matrix th,.matrix td{border:1px solid #ccc;padding:10px;text-align:left}.footer{border-top:1px solid #ccc;margin-top:36px;padding-top:12px;font-size:12px;color:#666}@media print{body{margin:20px}.no-print{display:none}}</style></head><body><p class="eyebrow">APS Intelligence / demonstration report</p><h1>${htmlEscape(experiment.name)}</h1><p class="muted">${htmlEscape(experiment.id)} · ${htmlEscape(experiment.status)} · ${htmlEscape(experiment.createdAt)}</p><div class="warning"><strong>Demonstration record.</strong> This report contains frontend demonstration data and is not a verified production evaluation.</div><h2>Experiment information</h2><div class="grid"><div class="cell"><div class="label">Model</div><div class="value">${htmlEscape(experiment.modelName)}</div></div><div class="cell"><div class="label">Dataset</div><div class="value">${htmlEscape(experiment.datasetName)}</div></div><div class="cell"><div class="label">Type</div><div class="value">${htmlEscape(experiment.experimentType)}</div></div></div><h2>Evaluation metrics</h2><div class="grid"><div class="cell"><div class="label">PR-AUC</div><div class="value">${formatPercent(evaluationResults.prAuc)}</div></div><div class="cell"><div class="label">Precision</div><div class="value">${formatPercent(evaluationResults.precision)}</div></div><div class="cell"><div class="label">Recall</div><div class="value">${formatPercent(evaluationResults.recall)}</div></div><div class="cell"><div class="label">F1-score</div><div class="value">${formatPercent(evaluationResults.f1Score)}</div></div><div class="cell"><div class="label">Threshold</div><div class="value">${evaluationResults.classificationThreshold?.toFixed(2) ?? "Unavailable"}</div></div><div class="cell"><div class="label">Business cost</div><div class="value">${formatCurrency(impact?.estimatedCost)}</div></div></div><h2>Confusion matrix</h2>${confusion ? `<table class="matrix"><tr><th></th><th>Predicted normal</th><th>Predicted failure</th></tr><tr><th>Actual normal</th><td>TN ${confusion.trueNegative.toLocaleString()}</td><td>FP ${confusion.falsePositive.toLocaleString()}</td></tr><tr><th>Actual failure</th><td>FN ${confusion.falseNegative.toLocaleString()}</td><td>TP ${confusion.truePositive.toLocaleString()}</td></tr></table>` : `<p class="muted">Confusion matrix unavailable for this experiment status.</p>`}<h2>Model and dataset configuration</h2><p><strong>Model version:</strong> ${htmlEscape(details.modelConfiguration.modelVersion)}</p><p><strong>Training configuration:</strong> ${htmlEscape(details.modelConfiguration.trainingConfiguration)}</p><p><strong>Dataset fingerprint:</strong> ${htmlEscape(details.datasetInformation.fingerprint)}</p><p><strong>Feature count:</strong> ${htmlEscape(details.datasetInformation.featureCount)}</p><p><strong>Evaluation protocol:</strong> ${htmlEscape(details.datasetInformation.evaluationProtocol)}</p><p><strong>Unavailable fields:</strong> ${htmlEscape(unavailable)}</p><h2>Business cost breakdown</h2><p>False positives: ${htmlEscape(impact?.falsePositiveCount)} × assumed weight 10 = ${formatCurrency(impact?.falsePositiveCost)}.</p><p>False negatives: ${htmlEscape(impact?.falseNegativeCount)} × assumed weight 500 = ${formatCurrency(impact?.falseNegativeCost)}.</p><p><strong>Total assumed business cost:</strong> ${formatCurrency(impact?.estimatedCost)}.</p><h2>Limitations</h2><p class="muted">This report is a frontend demonstration. Backend artifact lineage, verified dataset fingerprints, final test evaluation and real operating costs are unavailable unless explicitly shown above.</p><p class="footer">APS Intelligence / industrial failure prediction and reliability analytics</p><script>window.onload=()=>window.print()</script></body></html>`;
}

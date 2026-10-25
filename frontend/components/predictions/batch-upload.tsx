"use client";

import * as React from "react";
import { Check, CloudUpload, Download, FileWarning, LoaderCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatNumber } from "@/lib/formatters";
import type { BatchUploadSummary } from "@/types";
import { BatchPreview, type BatchPreviewData } from "@/components/predictions/batch-preview";

interface BatchUploadProps {
  expectedFeatureIds: readonly string[];
  isProcessing: boolean;
  modelName: string;
  threshold: number;
  onProcessed: (summary: BatchUploadSummary) => void;
}

type BatchState = "idle" | "ready" | "processing" | "completed" | "error";

function BatchUpload({ expectedFeatureIds, isProcessing, modelName, threshold, onProcessed }: BatchUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<BatchPreviewData | null>(null);
  const [summary, setSummary] = React.useState<BatchUploadSummary | null>(null);
  const [status, setStatus] = React.useState<BatchState>("idle");
  const [progress, setProgress] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  async function inspectFile(nextFile: File) {
    setFile(null); setPreview(null); setSummary(null); setProgress(0); setErrorMessage(""); setStatus("idle");
    if (!nextFile.name.toLowerCase().endsWith(".csv")) { setStatus("error"); setErrorMessage("CSV files only. Upload a file with the APS feature header."); return; }
    if (nextFile.size > 100 * 1024 * 1024) { setStatus("error"); setErrorMessage("This demonstration workspace accepts CSV files up to 100 MB."); return; }
    try {
      const text = await nextFile.text();
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      const headers = (lines[0] ?? "").split(",").map((header) => header.trim()).filter(Boolean);
      const matchedFeatureIds = expectedFeatureIds.filter((featureId) => headers.includes(featureId));
      if (matchedFeatureIds.length < 10) { setStatus("error"); setErrorMessage("The CSV does not contain enough APS feature identifiers. Use the expected anonymized sensor schema."); return; }
      const rows = lines.slice(1, 6).map((line) => { const values = line.split(","); return headers.reduce<Record<string, string>>((record, header, index) => { record[header] = values[index]?.trim() ?? ""; return record; }, {}); });
      const missingValueCount = lines.slice(1).reduce((count, line) => count + line.split(",").filter((value) => !value.trim() || value.trim().toLowerCase() === "na").length, 0);
      const nextSummary: BatchUploadSummary = { fileName: nextFile.name, fileSizeBytes: nextFile.size, rowCount: Math.max(0, lines.length - 1), featureCount: matchedFeatureIds.length, missingFeatureCount: expectedFeatureIds.length - matchedFeatureIds.length, missingValueCount, status: "ready" };
      setFile(nextFile); setPreview({ headers, rows }); setSummary(nextSummary); setStatus("ready");
    } catch { setStatus("error"); setErrorMessage("The file could not be read in this browser. Try the CSV again."); }
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) { const nextFile = event.target.files?.[0]; if (nextFile) void inspectFile(nextFile); }
  function handleDrop(event: React.DragEvent<HTMLDivElement>) { event.preventDefault(); setIsDragging(false); const nextFile = event.dataTransfer.files[0]; if (nextFile) void inspectFile(nextFile); }

  function processBatch() {
    if (!file || !summary) return;
    setStatus("processing"); setProgress(8);
    const timer = window.setInterval(() => setProgress((current) => { const next = Math.min(current + 16, 100); if (next === 100) { window.clearInterval(timer); window.setTimeout(() => { const completed = { ...summary, status: "completed" as const }; setSummary(completed); setStatus("completed"); onProcessed(completed); }, 160); } return next; }), 180);
  }

  function clearFile() { setFile(null); setPreview(null); setSummary(null); setStatus("idle"); setProgress(0); setErrorMessage(""); if (inputRef.current) inputRef.current.value = ""; }

  function downloadResults() {
    if (!summary) return;
    const rowCount = Math.min(summary.rowCount, 5000);
    const rows = Array.from({ length: rowCount }, (_, index) => [`BATCH-DEMO-${String(index + 1).padStart(5, "0")}`, modelName, "demo", "0.50", threshold, "completed"].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([["prediction_id,model,predicted_class,failure_probability,threshold,status", ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "aps-batch-predictions-demo.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <section id="batch-prediction" aria-labelledby="batch-prediction-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14"><div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Batch prediction</p><h2 id="batch-prediction-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Process a fleet-sized CSV in one deliberate pass.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Upload a previewable APS-schema file, inspect its row and missing-value summary, then simulate prediction processing. No backend request is made in this phase.</p></div><Badge variant="neutral">CSV / {expectedFeatureIds.length} expected features</Badge></div><div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]"><div className={`relative flex min-h-56 flex-col items-center justify-center border border-dashed px-6 py-8 text-center ${isDragging ? "border-signal bg-signal-wash" : "border-line-strong bg-surface"}`} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><input ref={inputRef} className="sr-only" id="batch-file" type="file" accept=".csv,text/csv" onChange={handleInput} /><span className="flex size-10 items-center justify-center bg-charcoal text-silver">{status === "processing" ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-signal" /> : status === "completed" ? <Check aria-hidden="true" className="size-5 text-success" /> : status === "error" ? <FileWarning aria-hidden="true" className="size-5 text-signal" /> : <CloudUpload aria-hidden="true" className="size-5 text-signal" />}</span><p className="mt-5 font-display text-3xl leading-none text-ink">{status === "completed" ? "Batch complete" : status === "processing" ? "Processing demo batch" : "Drop a CSV here"}</p><p className="mt-3 max-w-sm text-sm leading-6 text-muted">Use touch or browse to choose a file with APS identifiers in its header.</p><Button variant="outline" size="sm" className="mt-5" onClick={() => inputRef.current?.click()} disabled={status === "processing" || isProcessing}>Browse CSV</Button>{status === "processing" ? <div className="absolute inset-x-6 bottom-5"><div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><span>Prediction progress</span><span>{progress}%</span></div><div className="mt-2 h-1 bg-canvas-deep"><div className="h-full bg-signal" style={{ width: `${progress}%` }} /></div></div> : null}</div><div className="border-t border-charcoal bg-surface p-5 sm:p-7"><div className="flex items-start justify-between gap-4 border-b border-line pb-5"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Batch source</p><p className="mt-2 break-all text-sm text-ink">{file?.name ?? "No file selected"}</p></div>{file ? <button type="button" className="text-muted hover:text-ink" aria-label="Clear batch file" onClick={clearFile}><X aria-hidden="true" className="size-4" /></button> : null}</div>{summary ? <div className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Rows</p><p className="mt-1 font-mono text-lg">{formatNumber(summary.rowCount)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Features</p><p className="mt-1 font-mono text-lg">{summary.featureCount}/{expectedFeatureIds.length}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Missing values</p><p className="mt-1 font-mono text-lg">{formatNumber(summary.missingValueCount)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">File size</p><p className="mt-1 font-mono text-lg">{formatBytes(summary.fileSizeBytes)}</p></div></div> : null}{errorMessage ? <p role="alert" className="mt-5 border-l-2 border-signal bg-signal-wash px-3 py-2 text-xs leading-5 text-ink-soft">{errorMessage}</p> : null}{summary?.missingFeatureCount ? <p className="mt-5 text-xs leading-5 text-muted">{summary.missingFeatureCount} expected identifiers are absent from the uploaded header. The demo keeps the gap visible rather than silently filling it.</p> : null}<div className="mt-6 flex flex-col gap-2 sm:flex-row"><Button variant="signal" className="flex-1" onClick={processBatch} disabled={!file || !summary || status === "processing" || isProcessing}>{status === "completed" ? "Process again" : "Simulate batch prediction"}</Button>{status === "completed" ? <Button variant="outline" onClick={downloadResults}><Download aria-hidden="true" className="size-3.5" /> Download results</Button> : null}</div></div></div>{preview ? <div className="mt-8"><BatchPreview preview={preview} /></div> : null}</section>;
}

export { BatchUpload };

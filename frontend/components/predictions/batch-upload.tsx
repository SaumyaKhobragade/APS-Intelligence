"use client";

import * as React from "react";
import { Check, CloudUpload, Download, FileWarning, LoaderCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes, formatNumber } from "@/lib/formatters";
import type { BatchPredictionResponse, BatchUploadSummary } from "@/types";
import { BatchPreview, type BatchPreviewData } from "@/components/predictions/batch-preview";
import { exportBatchPredictionsCsv, parseAndValidateBatchCsv } from "@/services/prediction-service";

interface BatchUploadProps {
  expectedFeatureIds: readonly string[];
  isProcessing: boolean;
  onProcessed: (records: Array<{ features: Record<string, number | null> }>, file: File) => Promise<BatchPredictionResponse | void>;
  batchResult?: BatchPredictionResponse;
  isBlocked?: boolean;
}

type BatchState = "idle" | "ready" | "processing" | "completed" | "error";

function BatchUpload({ expectedFeatureIds, isProcessing, onProcessed, batchResult, isBlocked = false }: BatchUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<BatchPreviewData | null>(null);
  const [summary, setSummary] = React.useState<BatchUploadSummary | null>(null);
  const [parsedRecords, setParsedRecords] = React.useState<Array<{ features: Record<string, number | null> }>>([]);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<BatchState>("idle");
  const [isDragging, setIsDragging] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");

  async function inspectFile(nextFile: File) {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setParsedRecords([]);
    setValidationErrors([]);
    setErrorMessage("");
    setStatus("idle");

    if (!nextFile.name.toLowerCase().endsWith(".csv")) {
      setStatus("error");
      setErrorMessage("CSV files only. Please upload a file with the APS 170-feature header.");
      return;
    }

    if (nextFile.size > 100 * 1024 * 1024) {
      setStatus("error");
      setErrorMessage("Batch file size exceeds the 100 MB limit.");
      return;
    }

    try {
      const text = await nextFile.text();
      const validation = parseAndValidateBatchCsv(text, nextFile.name, nextFile.size, expectedFeatureIds);

      setFile(nextFile);
      setPreview({ headers: validation.previewHeaders, rows: validation.previewRows });
      setSummary(validation.summary ?? null);

      if (!validation.valid) {
        setStatus("error");
        setValidationErrors(validation.errors);
        setErrorMessage(validation.errors[0] ?? "CSV validation failed.");
      } else {
        setStatus("ready");
        setParsedRecords(validation.records ?? []);
      }
    } catch {
      setStatus("error");
      setErrorMessage("The CSV file could not be read. Please verify encoding and format.");
    }
  }

  function handleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (nextFile) void inspectFile(nextFile);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const nextFile = event.dataTransfer.files[0];
    if (nextFile) void inspectFile(nextFile);
  }

  async function processBatch() {
    if (!file || !parsedRecords.length || status === "processing" || isProcessing) return;
    setStatus("processing");
    setErrorMessage("");

    try {
      await onProcessed(parsedRecords, file);
      setStatus("completed");
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "The backend batch prediction request failed.");
    }
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setParsedRecords([]);
    setValidationErrors([]);
    setStatus("idle");
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function downloadResults() {
    if (!batchResult) return;
    exportBatchPredictionsCsv(batchResult, file?.name ?? "aps-batch");
  }

  return (
    <section id="batch-prediction" aria-labelledby="batch-prediction-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Batch prediction</p>
          <h2 id="batch-prediction-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">
            Process a fleet-sized CSV in one deliberate pass.
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">
            Upload an APS-schema CSV (up to 1,000 records). Client-side pre-validation verifies all 170 columns before submitting to the backend inference endpoint.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="neutral">CSV / {expectedFeatureIds.length} expected features</Badge>
          {isBlocked ? <Badge variant="neutral">Inference Gated</Badge> : null}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div
          className={`relative flex min-h-56 flex-col items-center justify-center border border-dashed px-6 py-8 text-center ${
            isDragging ? "border-signal bg-signal-wash" : "border-line-strong bg-surface"
          }`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} className="sr-only" id="batch-file" type="file" accept=".csv,text/csv" onChange={handleInput} />
          <span className="flex size-10 items-center justify-center bg-charcoal text-silver">
            {status === "processing" ? (
              <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-signal" />
            ) : status === "completed" ? (
              <Check aria-hidden="true" className="size-5 text-success" />
            ) : status === "error" ? (
              <FileWarning aria-hidden="true" className="size-5 text-signal" />
            ) : (
              <CloudUpload aria-hidden="true" className="size-5 text-signal" />
            )}
          </span>
          <p className="mt-5 font-display text-3xl leading-none text-ink">
            {status === "completed" ? "Batch processed" : status === "processing" ? "Processing batch..." : "Drop a CSV here"}
          </p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
            Upload a CSV containing all 170 APS sensor features (max 1,000 rows).
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-5"
            onClick={() => inputRef.current?.click()}
            disabled={status === "processing" || isProcessing}
          >
            Browse CSV
          </Button>
          {status === "processing" || isProcessing ? (
            <div className="absolute inset-x-6 bottom-5" role="status" aria-live="polite">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                <span className="flex items-center gap-1.5 text-signal">
                  <span className="size-2 animate-ping rounded-full bg-signal" />
                  Awaiting backend inference
                </span>
                <span>Indeterminate</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden bg-canvas-deep">
                <div className="h-full w-full bg-signal animate-pulse" />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Batch source</p>
              <p className="mt-2 break-all text-sm text-ink">{file?.name ?? "No file selected"}</p>
            </div>
            {file ? (
              <button
                type="button"
                className="text-muted hover:text-ink"
                aria-label="Clear batch file"
                onClick={clearFile}
                disabled={status === "processing" || isProcessing}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>

          {summary ? (
            <div className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Rows</p>
                <p className="mt-1 font-mono text-lg">{formatNumber(summary.rowCount)}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Features</p>
                <p className="mt-1 font-mono text-lg">
                  {summary.featureCount}/{expectedFeatureIds.length}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Missing values</p>
                <p className="mt-1 font-mono text-lg">{formatNumber(summary.missingValueCount)}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">File size</p>
                <p className="mt-1 font-mono text-lg">{formatBytes(summary.fileSizeBytes)}</p>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div role="alert" className="mt-5 border-l-2 border-signal bg-signal-wash px-3 py-2 text-xs leading-5 text-ink-soft">
              <p className="font-semibold text-signal">{errorMessage}</p>
              {validationErrors.length > 1 ? (
                <ul className="mt-2 list-disc pl-4 space-y-1 text-muted">
                  {validationErrors.slice(1, 5).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {validationErrors.length > 5 ? (
                    <li>... and {validationErrors.length - 5} more errors.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}

          {batchResult ? (
            <div className="mt-6 border-y border-line bg-canvas-deep/30 p-4">
              <div className="flex items-center justify-between border-b border-line pb-2.5">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Server inference summary</p>
                <Badge
                  variant={
                    batchResult.status === "completed"
                      ? "success"
                      : batchResult.status === "partial"
                      ? "warning"
                      : "signal"
                  }
                >
                  {batchResult.status === "completed"
                    ? `Completed (${batchResult.completedCount}/${batchResult.rowCount})`
                    : batchResult.status === "partial"
                    ? `Partial (${batchResult.completedCount} succeeded, ${batchResult.failedCount} failed)`
                    : `Failed (${batchResult.failedCount}/${batchResult.rowCount} failed)`}
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
                <div>
                  <span className="text-muted block text-[10px]">Total</span>
                  <span className="text-ink font-semibold">{batchResult.rowCount}</span>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Succeeded</span>
                  <span className="text-success font-semibold">{batchResult.completedCount}</span>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Failed</span>
                  <span className={`${batchResult.failedCount > 0 ? "text-signal" : "text-muted"} font-semibold`}>
                    {batchResult.failedCount}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[10px]">Pos / Neg</span>
                  <span className="text-ink font-semibold">
                    {typeof batchResult.positiveCount === "number" && typeof batchResult.negativeCount === "number"
                      ? `${batchResult.positiveCount} / ${batchResult.negativeCount}`
                      : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-mono text-muted border-t border-line pt-2">
                {batchResult.serverTimestamp ? (
                  <span>Server inference: {batchResult.serverTimestamp}</span>
                ) : null}
                {batchResult.clientReceivedAt ? (
                  <span>Client received: {batchResult.clientReceivedAt}</span>
                ) : null}
              </div>
              {batchResult.failedCount > 0 && batchResult.items ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[10px] font-mono text-signal uppercase tracking-[0.1em]">Itemized Errors</p>
                  <ul className="mt-2 max-h-32 overflow-y-auto space-y-1 text-xs text-muted">
                    {batchResult.items
                      .filter((item) => item.error)
                      .slice(0, 10)
                      .map((item) => (
                        <li key={item.index} className="font-mono text-[11px]">
                          Row {item.index + 1}: [{item.error?.code}] {item.error?.message}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-start">
            <Button
              variant="signal"
              className="flex-1"
              onClick={processBatch}
              disabled={
                !file ||
                !parsedRecords.length ||
                status === "processing" ||
                isProcessing ||
                validationErrors.length > 0
              }
            >
              {status === "completed" ? "Process again" : "Execute batch prediction"}
            </Button>
            {batchResult ? (
              <div className="flex flex-col gap-1">
                <Button variant="outline" onClick={downloadResults}>
                  <Download aria-hidden="true" className="size-3.5" /> Export results CSV
                </Button>
                <span className="text-[10px] font-mono text-muted">
                  Exports prediction IDs, classifications, probabilities, thresholds, and server error codes.
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {preview ? (
        <div className="mt-8">
          <BatchPreview preview={preview} />
        </div>
      ) : null}
    </section>
  );
}

export { BatchUpload };

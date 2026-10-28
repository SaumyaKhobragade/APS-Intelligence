"use client";

import { useRef, useState } from "react";
import { Check, CloudUpload, FileUp, FileWarning, LoaderCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatBytes } from "@/lib/formatters";
import { uploadDataset } from "@/services/dataset-service";
import type { DatasetType } from "@/types";

interface DatasetUploadProps {
  onUploaded?: (datasetId: string) => void;
}

function DatasetUpload({ onUploaded }: DatasetUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetType, setDatasetType] = useState<DatasetType>("training");
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFile(file: File) {
    const normalizedName = file.name.toLowerCase();
    if (normalizedName.includes("test")) {
      setDatasetType("testing");
    } else {
      setDatasetType("training");
    }

    setUploadState("idle");
    setProgress(0);

    if (!normalizedName.endsWith(".csv")) {
      setErrorMessage("CSV files only. Choose an APS training or testing file.");
      setUploadState("error");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage("Maximum supported file size is 50 MB.");
      setUploadState("error");
      return;
    }

    setSelectedFile(file);
    setErrorMessage("");
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) selectFile(file);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) selectFile(file);
  }

  async function handleUpload() {
    if (!selectedFile) {
      setErrorMessage("Select a supported CSV before starting the upload.");
      setUploadState("error");
      return;
    }

    setUploadState("uploading");
    setProgress(30);
    try {
      const response = await uploadDataset(selectedFile);
      setProgress(100);
      setUploadState("success");
      onUploaded?.(response.datasetId);
      setErrorMessage("");
    } catch (error) {
      setUploadState("error");
      setErrorMessage(error instanceof Error ? error.message : "The dataset import failed.");
    }
  }

  function clearFile() {
    setSelectedFile(null);
    setUploadState("idle");
    setProgress(0);
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section id="dataset-upload" aria-labelledby="dataset-upload-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">01 / Dataset upload</p>
          <h2 id="dataset-upload-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Bring the source file in with its role intact.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">Select one of the original APS CSV files. Training and testing data stay explicitly separated from the first interaction.</p>
        </div>
        <Badge variant="neutral"><FileUp aria-hidden="true" className="size-3" /> CSV / max 50 MB</Badge>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div
          className={`relative flex min-h-64 flex-col items-center justify-center border border-dashed px-6 py-10 text-center transition-colors ${isDragging ? "border-signal bg-signal-wash/50" : "border-line-strong bg-surface hover:border-charcoal"}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} id="dataset-file" type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileInput} />
          {uploadState === "success" ? <Check aria-hidden="true" className="size-7 text-success" strokeWidth={1.5} /> : uploadState === "error" ? <FileWarning aria-hidden="true" className="size-7 text-signal" strokeWidth={1.5} /> : uploadState === "uploading" ? <LoaderCircle aria-hidden="true" className="size-7 animate-spin text-signal" strokeWidth={1.5} /> : <CloudUpload aria-hidden="true" className="size-7 text-signal" strokeWidth={1.5} />}
          <p className="mt-5 font-display text-3xl leading-none text-ink">{uploadState === "success" ? "Upload staged" : uploadState === "uploading" ? "Uploading dataset" : "Drop a CSV here"}</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted">or choose a CSV file from this device. Imports are sent to the backend custom-dataset boundary; configured APS files remain unchanged.</p>
          <Button className="mt-6" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploadState === "uploading"}>
            Browse files
          </Button>
          {uploadState === "uploading" ? (
            <div className="absolute inset-x-6 bottom-5">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-muted"><span>Transfer progress</span><span>{progress}%</span></div>
              <div className="mt-2 h-1 bg-canvas-deep"><div className="h-full bg-signal transition-[width] duration-150" style={{ width: `${progress}%` }} /></div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Selected source</p>
              <p className="mt-2 text-sm text-ink">{selectedFile?.name ?? "No file selected"}</p>
            </div>
            {selectedFile ? <button type="button" aria-label="Clear selected file" className="text-muted hover:text-ink" onClick={clearFile}><X aria-hidden="true" className="size-4" /></button> : null}
          </div>

          <div className="mt-6">
            <label htmlFor="dataset-type" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Dataset role</label>
            <Select id="dataset-type" value={datasetType} onChange={(event) => { setDatasetType(event.target.value as DatasetType); setErrorMessage(""); setUploadState("idle"); }} options={[{ label: "Training dataset", value: "training" }, { label: "Testing dataset", value: "testing" }]} disabled={uploadState === "uploading"} />
            <p className="mt-2 text-xs leading-5 text-muted">Detected from the supported filename and still visible for confirmation.</p>
          </div>

          {selectedFile ? <div className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">File size</p><p className="mt-1 font-mono text-sm text-ink">{formatBytes(selectedFile.size)}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">File type</p><p className="mt-1 font-mono text-sm uppercase text-ink">CSV</p></div></div> : null}

          {errorMessage ? <p role="alert" className="mt-5 border-l-2 border-signal bg-signal-wash/40 px-3 py-2 text-xs leading-5 text-ink-soft">{errorMessage}</p> : null}
          {uploadState === "success" ? <p role="status" className="mt-5 border-l-2 border-success bg-success/10 px-3 py-2 text-xs leading-5 text-ink-soft">{selectedFile?.name} was imported by the backend without modifying configured APS reference files.</p> : null}

          <Button className="mt-6 w-full" variant="signal" onClick={handleUpload} disabled={!selectedFile || uploadState === "uploading"}>
            {uploadState === "success" ? "Import again" : "Import CSV"}
          </Button>
        </div>
      </div>
      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Configured APS source files remain immutable / custom CSV imports are persisted separately</p>
    </section>
  );
}

export { DatasetUpload };

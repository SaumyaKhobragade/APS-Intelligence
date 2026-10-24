import { CalendarClock, CheckCircle2, FileCode2, HardDrive, Target, Rows3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricDisplay } from "@/components/shared/section-header";
import { formatBytes, formatNumber } from "@/lib/formatters";
import type { DatasetExplorerSnapshot, DatasetType } from "@/types";

interface DatasetOverviewProps {
  snapshot: DatasetExplorerSnapshot;
  onDatasetTypeChange: (datasetType: DatasetType) => void;
}

function DatasetOverview({ snapshot, onDatasetTypeChange }: DatasetOverviewProps) {
  const { dataset, file } = snapshot;

  return (
    <section id="dataset-overview" aria-labelledby="dataset-overview-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-5 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Dataset overview</p>
          <h2 id="dataset-overview-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Know the file before you trust the model.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">A compact contract for the current source file. Switch between the original training and testing datasets without collapsing their roles.</p>
        </div>
        <div className="flex border-b border-line">
          <Button variant={file.datasetType === "training" ? "default" : "ghost"} size="sm" onClick={() => onDatasetTypeChange("training")} aria-pressed={file.datasetType === "training"}>Training</Button>
          <Button variant={file.datasetType === "testing" ? "default" : "ghost"} size="sm" onClick={() => onDatasetTypeChange("testing")} aria-pressed={file.datasetType === "testing"}>Testing</Button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-silver">Active dataset</p>
              <h3 className="mt-4 max-w-sm font-display text-4xl leading-[0.94] tracking-[-0.04em]">{file.datasetType === "training" ? "Training set" : "Testing set"}</h3>
            </div>
            <Badge variant="dark"><CheckCircle2 aria-hidden="true" className="size-3 text-success" /> Ready</Badge>
          </div>
          <p className="mt-8 break-words font-mono text-xs leading-6 text-silver">{file.fileName}</p>
          <div className="mt-8 grid grid-cols-2 gap-5 border-t border-white/15 pt-5"><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/70">Target</p><p className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-white"><Target aria-hidden="true" className="size-3 text-signal" /> {dataset.targetColumn}</p></div><div><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-silver/70">File size</p><p className="mt-2 inline-flex items-center gap-2 font-mono text-sm text-white"><HardDrive aria-hidden="true" className="size-3 text-signal" /> {formatBytes(file.fileSizeBytes)}</p></div></div>
        </div>

        <div className="grid border-y border-line sm:grid-cols-2 lg:grid-cols-4">
          <MetricDisplay label="Dataset name" value="APS Failure" detail="UCI / Scania Trucks" className="border-l-0 px-4 py-5 sm:border-r" />
          <MetricDisplay label="Total records" value={formatNumber(dataset.rowCount)} detail={file.datasetType === "training" ? "Training rows" : "Testing rows"} className="border-l-0 px-4 py-5 sm:border-r" />
          <MetricDisplay label="Total features" value={String(dataset.featureCount)} detail="Including target schema" className="border-l-0 px-4 py-5 sm:border-r" />
          <MetricDisplay label="Status" value="READY" detail="Demo metadata loaded" accent className="border-l-0 px-4 py-5" />
        </div>
      </div>

      <div className="mt-6 grid gap-4 border-t border-line pt-5 text-xs text-muted sm:grid-cols-3">
        <span className="inline-flex items-center gap-2"><FileCode2 aria-hidden="true" className="size-4 text-signal" /> {dataset.source}</span>
        <span className="inline-flex items-center gap-2"><Rows3 aria-hidden="true" className="size-4 text-signal" /> Target / {dataset.positiveClassLabel}</span>
        <span className="inline-flex items-center gap-2"><CalendarClock aria-hidden="true" className="size-4 text-signal" /> Uploaded / {formatUploadDate(file.uploadedAt)}</span>
      </div>
    </section>
  );
}

function formatUploadDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

export { DatasetOverview };

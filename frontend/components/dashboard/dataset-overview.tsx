"use client";

import { BarChart3, Database, Minus, Plus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/formatters";
import type { DashboardSnapshot } from "@/types";

interface DatasetOverviewProps {
  snapshot: DashboardSnapshot;
}

function DatasetOverview({ snapshot }: DatasetOverviewProps) {
  const dataset = snapshot.dataset!;
  const distribution = snapshot.distribution!;
  const distributionData = [
    { label: "Normal", records: distribution.normalRecords, color: "#2A2A2A" },
    { label: "Failure", records: distribution.failureRecords, color: "#E10600" },
  ];

  return (
    <section aria-labelledby="dataset-overview-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="grid gap-10 xl:grid-cols-[0.75fr_1.25fr] xl:gap-16">
        <div>
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">02 / Dataset overview</p>
              <h2 id="dataset-overview-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">The class split sets the operating context.</h2>
            </div>
            <BarChart3 aria-hidden="true" className="hidden size-5 text-signal sm:block" strokeWidth={1.5} />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-6 text-muted">The demonstration snapshot makes the imbalance visible before any model score is interpreted. Failure detection is the signal; accuracy alone would hide it.</p>

          <div className="mt-10 grid grid-cols-2 border-y border-line sm:grid-cols-3">
            <div className="border-r border-line py-4 pr-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Records</p>
               <p className="mt-2 font-mono text-2xl tracking-[-0.05em] text-ink">{formatNumber(dataset.rowCount)}</p>
            </div>
            <div className="border-r border-line py-4 pl-4 pr-4 sm:pl-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Features</p>
               <p className="mt-2 font-mono text-2xl tracking-[-0.05em] text-ink">{dataset.featureCount}</p>
            </div>
            <div className="col-span-2 py-4 sm:col-span-1 sm:pl-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Imbalance</p>
               <p className="mt-2 font-mono text-2xl tracking-[-0.05em] text-signal">{distribution.imbalanceRatio}</p>
            </div>
          </div>

          <div className="mt-8 flex items-start gap-3 border-l-2 border-signal pl-4">
            <Database aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} />
             <p className="text-sm leading-6 text-ink-soft"><span className="font-medium text-ink">{formatNumber(dataset.missingValueCount)}</span> missing readings are recorded in the persisted dataset profile.</p>
          </div>
        </div>

        <div className="min-w-0 border-t border-charcoal bg-surface p-5 sm:p-7">
          <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Normal vs failure</p>
              <p className="mt-2 text-sm text-ink">Record distribution / demonstration</p>
            </div>
             <Badge variant="signal">{distribution.imbalanceRatio} imbalance</Badge>
          </div>
          <div className="mt-7 h-64 w-full sm:h-72" role="img" aria-label="Bar chart showing normal and failure records">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid horizontal={false} stroke="#d9d6ce" strokeDasharray="1 4" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "#787873", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 10 }} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
                <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} tick={{ fill: "#2A2A2A", fontFamily: "var(--font-dm-sans)", fontSize: 12 }} width={54} />
                <Tooltip cursor={{ fill: "#ebe8e0" }} contentStyle={{ border: "1px solid #b8b5ac", borderRadius: 0, background: "#fbfaf7", fontFamily: "var(--font-ibm-plex-mono)", fontSize: 11 }} />
                <Bar dataKey="records" barSize={24} radius={0}>
                  {distributionData.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
             <span className="inline-flex items-center gap-2"><span className="size-2 bg-charcoal" /> Normal / {formatNumber(distribution.normalRecords)}</span>
             <span className="inline-flex items-center gap-2"><span className="size-2 bg-signal" /> Failure / {formatNumber(distribution.failureRecords)}</span>
            <span className="inline-flex items-center gap-1"><Plus aria-hidden="true" className="size-3" /> Positive class focus</span>
            <span className="inline-flex items-center gap-1"><Minus aria-hidden="true" className="size-3" /> Negative class</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export { DatasetOverview };

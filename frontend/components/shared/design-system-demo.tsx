"use client";

import * as React from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Database,
  Download,
  Gauge,
  MoreHorizontal,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MetricDisplay, SectionHeader } from "@/components/shared/section-header";

const datasetRows = [
  { feature: "aa_000", type: "pressure", coverage: "100.0%", state: "ready" },
  { feature: "ag_000", type: "pressure", coverage: "99.8%", state: "review" },
  { feature: "ay_000", type: "temperature", coverage: "98.6%", state: "ready" },
  { feature: "az_000", type: "vibration", coverage: "97.9%", state: "review" },
];

const modelOptions = [
  { label: "Model artifact", value: "artifact", detail: "Select a trained artifact" },
  { label: "Baseline / logistic", value: "baseline", detail: "Reference model" },
  { label: "Gradient ensemble", value: "ensemble", detail: "Offline artifact" },
];

function StatusMark({ tone = "signal" }: { tone?: "signal" | "success" }) {
  return <span aria-hidden="true" className={`signal-pulse size-1.5 rounded-full ${tone === "success" ? "bg-success" : "bg-signal"}`} />;
}

function StatusBadge({ state }: { state: string }) {
  if (state === "ready") {
    return <Badge variant="success"><Check aria-hidden="true" className="size-3" /> Ready</Badge>;
  }

  return <Badge variant="warning">Review</Badge>;
}

function DesignSystemDemo() {
  const [activeModel, setActiveModel] = React.useState("artifact");

  return (
    <TooltipProvider>
      <AppShell>
        <div className="mx-auto max-w-[1600px]">
          <section id="overview" className="technical-grid border-b border-line px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)] lg:items-end lg:gap-20">
              <div>
                <div className="mb-8 flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-signal">
                  <span className="inline-flex items-center gap-2"><StatusMark /> Foundation / online</span>
                  <span className="text-line-strong">/</span>
                  <span className="text-muted">Phase 01</span>
                </div>
                <h1 className="max-w-4xl font-display text-[clamp(3.5rem,8vw,7.75rem)] leading-[0.86] tracking-[-0.065em] text-ink">
                  Predictive maintenance, composed with precision.
                </h1>
                <div className="mt-10 grid gap-8 border-t border-line pt-6 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)]">
                  <p className="max-w-2xl text-base leading-7 text-ink-soft sm:text-lg">
                    A restrained visual language for turning sensor data, model behavior and operational risk into decisions engineers can trust.
                  </p>
                  <p className="font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-muted">
                    APS / Scania truck systems<br />
                    Interface foundation<br />
                    v0.1 / design preview
                  </p>
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Button variant="signal" asChild>
                    <a href="#components">Inspect components <ArrowDownRight aria-hidden="true" className="size-4" /></a>
                  </Button>
                  <Button variant="outline" onClick={() => toast.success("API configuration is ready for the FastAPI service.") }>
                    Test connection <Radio aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="relative overflow-hidden bg-charcoal p-6 text-white sm:p-8">
                <div className="absolute right-0 top-0 size-28 border-b border-l border-white/10" aria-hidden="true" />
                <div className="relative">
                  <div className="flex items-center justify-between border-b border-white/15 pb-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-silver">System readout</span>
                    <Gauge aria-hidden="true" className="size-4 text-signal" strokeWidth={1.5} />
                  </div>
                  <div className="py-12">
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-silver">Current state</p>
                    <p className="mt-4 font-display text-5xl leading-none tracking-[-0.04em]">Awaiting signal</p>
                    <p className="mt-5 max-w-xs text-sm leading-6 text-silver/75">
                      The interface is connected to the design system. Model artifacts will arrive from the separate inference service.
                    </p>
                  </div>
                  <div className="flex items-center justify-between border-t border-white/15 pt-4 font-mono text-[10px] uppercase tracking-[0.12em]">
                    <span className="inline-flex items-center gap-2"><StatusMark tone="success" /> Local preview</span>
                    <span className="text-silver/60">01 / 05</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section aria-label="Foundation metrics" className="grid border-b border-line bg-surface sm:grid-cols-2 lg:grid-cols-4">
            <MetricDisplay label="Dataset rows" value="—" detail="Pending backend metadata" />
            <MetricDisplay label="Sensor features" value="—" detail="Schema will be inferred" />
            <MetricDisplay label="Best PR-AUC" value="—" detail="No model metrics in Phase 01" accent />
            <MetricDisplay label="API status" value="LOCAL" detail="NEXT_PUBLIC_API_BASE_URL" />
          </section>

          <section id="components" className="px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
            <SectionHeader
              eyebrow="02 / Component atlas"
              title="A small vocabulary for a high-signal workspace."
              description="Shared primitives stay quiet, precise and composable. Typography, dividers and surface changes do the structural work before decoration does."
              action={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="About the component atlas">
                      <CircleHelp aria-hidden="true" className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reusable primitives / Phase 01</TooltipContent>
                </Tooltip>
              }
            />

            <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
              <div className="border-t border-charcoal bg-charcoal p-6 text-white sm:p-8">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-silver">Design principle</p>
                    <h3 className="mt-6 max-w-sm font-display text-4xl leading-[0.95] tracking-[-0.04em]">Make the signal legible.</h3>
                  </div>
                  <Sparkles aria-hidden="true" className="size-5 text-signal" strokeWidth={1.5} />
                </div>
                <div className="mt-16 border-t border-white/15 pt-5 text-sm leading-6 text-silver/75">
                  <p>01 / Use space to separate meaning.</p>
                  <p>02 / Use mono for the machine layer.</p>
                  <p>03 / Use red only when it changes attention.</p>
                </div>
              </div>

              <div className="min-w-0">
                <Tabs defaultValue="controls">
                  <TabsList aria-label="Component categories" className="w-full justify-start overflow-x-auto">
                    <TabsTrigger value="controls">Controls</TabsTrigger>
                    <TabsTrigger value="data">Data display</TabsTrigger>
                    <TabsTrigger value="states">Feedback states</TabsTrigger>
                  </TabsList>

                  <TabsContent value="controls">
                    <div className="grid gap-8 border-b border-line pb-8 md:grid-cols-2">
                      <div className="space-y-5">
                        <div>
                          <label htmlFor="artifact-name" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Experiment label</label>
                          <Input id="artifact-name" placeholder="e.g. threshold review / 01" />
                        </div>
                        <div>
                          <label htmlFor="dataset-scope" className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Dataset scope</label>
                          <Select id="dataset-scope" options={[{ label: "All sensor channels", value: "all" }, { label: "Pressure channels", value: "pressure" }, { label: "Missingness review", value: "missing" }]} defaultValue="all" />
                        </div>
                      </div>
                      <div className="space-y-5">
                        <div>
                          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Model selector</p>
                          <DropdownMenu label="Artifact" options={modelOptions} value={activeModel} onValueChange={setActiveModel} className="w-full" />
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button variant="default" onClick={() => toast("Draft saved", { description: "This preview does not persist experiments yet." })}>Save draft</Button>
                          <Button variant="subtle" onClick={() => toast.info("Inference is intentionally out of scope for Phase 01.")}>Run preview <ArrowUpRight aria-hidden="true" className="size-4" /></Button>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <SlidersHorizontal aria-hidden="true" className="size-4 text-signal" />
                      <span>Inputs are keyboard accessible and ready for React Hook Form + Zod schemas.</span>
                    </div>
                  </TabsContent>

                  <TabsContent value="data">
                    <div className="border-y border-line bg-surface">
                      <div className="flex flex-col gap-4 border-b border-line px-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Schema preview</p>
                          <p className="mt-1 text-sm text-ink">Sensor channel inventory</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => toast("Export queued", { description: "Reports will be connected in a later phase." })}>
                          <Download aria-hidden="true" className="size-3.5" /> Export view
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Feature</TableHead>
                            <TableHead>Signal type</TableHead>
                            <TableHead>Coverage</TableHead>
                            <TableHead className="text-right">State</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {datasetRows.map((row) => (
                            <TableRow key={row.feature}>
                              <TableCell className="font-mono text-xs">{row.feature}</TableCell>
                              <TableCell className="text-xs text-muted">{row.type}</TableCell>
                              <TableCell className="font-mono text-xs">{row.coverage}</TableCell>
                              <TableCell className="text-right"><StatusBadge state={row.state} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="states">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <EmptyState title="No experiments yet" description="Experiment history will appear here when the inference service is connected." actionLabel="Create a draft" onAction={() => toast("Draft mode", { description: "The Phase 01 page is presentation-only." })} />
                      <ErrorState title="Service boundary" description="The backend is intentionally separate from this foundation. No request was made." onRetry={() => toast.info("No retry needed in preview mode.")} />
                    </div>
                    <div className="mt-4 border border-line bg-surface p-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="size-9 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <Skeleton className="h-2.5 w-1/3" />
                          <Skeleton className="h-2.5 w-2/3" />
                        </div>
                        <Skeleton className="h-8 w-20" />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </section>

          <section id="data" className="border-y border-line bg-canvas-deep/45 px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">03 / Architecture notes</p>
                <h2 className="mt-4 max-w-xl font-display text-5xl leading-[0.92] tracking-[-0.05em] text-ink sm:text-6xl">The machine layer stays close to the surface.</h2>
                <p className="mt-6 max-w-lg text-sm leading-7 text-muted">The interface is ready for dataset exploration, model comparison and threshold analysis without pretending those backend capabilities exist yet.</p>
              </div>
              <div className="grid border-t border-line sm:grid-cols-2">
                <div className="border-b border-line py-5 sm:border-r sm:pr-8">
                  <Database aria-hidden="true" className="size-5 text-signal" strokeWidth={1.5} />
                  <h3 className="mt-8 font-display text-3xl text-ink">Data first</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">Typed dataset metadata and experiment records establish the contract before screens multiply.</p>
                </div>
                <div className="border-b border-line py-5 sm:pl-8">
                  <Terminal aria-hidden="true" className="size-5 text-signal" strokeWidth={1.5} />
                  <h3 className="mt-8 font-display text-3xl text-ink">Technical by design</h3>
                  <p className="mt-3 text-sm leading-6 text-muted">IBM Plex Mono creates a clear visual lane for thresholds, identifiers and model outputs.</p>
                </div>
                <div className="pt-5 sm:col-span-2">
                  <div className="flex flex-col gap-4 border-l-2 border-signal pl-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="max-w-2xl text-sm leading-6 text-ink-soft">Open the system notes in a focused dialog when a future screen needs more context without leaving its workflow.</p>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">Open system notes <MoreHorizontal aria-hidden="true" className="size-4" /></Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Foundation boundary</DialogTitle>
                          <DialogDescription>Phase 01 establishes the visual and technical contracts. Inference, analytics and report generation remain future slices backed by FastAPI.</DialogDescription>
                        </DialogHeader>
                        <div className="border-t border-line pt-4 font-mono text-[10px] uppercase leading-6 tracking-[0.12em] text-muted">
                          <p>API / NEXT_PUBLIC_API_BASE_URL</p>
                          <p>Fonts / Instrument Serif · DM Sans · IBM Plex Mono</p>
                          <p>Palette / Charcoal · Silver · Signal Red</p>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <footer className="flex flex-col gap-3 px-5 py-8 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
            <span>APS Intelligence / design system foundation</span>
            <span className="inline-flex items-center gap-2"><StatusMark tone="success" /> Ready for Phase 02</span>
          </footer>
        </div>
      </AppShell>
      <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "border-line bg-surface text-ink", title: "font-sans text-sm", description: "font-sans text-xs text-muted" } }} />
    </TooltipProvider>
  );
}

export { DesignSystemDemo };

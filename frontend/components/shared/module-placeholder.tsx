import type { LucideIcon } from "lucide-react";
import { ArrowRight, Database, Sparkles } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { pageMetadata } from "@/constants/navigation";

type PageMetadata = (typeof pageMetadata)[keyof typeof pageMetadata];

interface ModulePlaceholderProps {
  metadata: PageMetadata;
  icon: LucideIcon;
  nextStep: string;
}

function ModulePlaceholder({ metadata, icon: Icon, nextStep }: ModulePlaceholderProps) {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
        <div className="grid min-h-[32rem] gap-10 border-t border-line pt-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <span className="flex size-12 items-center justify-center bg-charcoal text-silver"><Icon aria-hidden="true" className="size-5" strokeWidth={1.5} /></span>
            <h2 className="mt-8 max-w-xl font-display text-5xl leading-[0.9] tracking-[-0.05em] text-ink sm:text-6xl">The {metadata.title.toLowerCase()} is queued for the next slice.</h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted">{metadata.description} This route is connected so the navigation flow is ready while the backend contract is finalized.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="default" asChild><Link href="/">Return to dashboard <ArrowRight aria-hidden="true" className="size-4" /></Link></Button>
              <Button variant="outline" asChild><Link href="#module-notes">Read module notes</Link></Button>
            </div>
          </div>

          <div id="module-notes" className="self-start border-t border-charcoal bg-surface p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6 border-b border-line pb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">Route status</p>
                <p className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink">Foundation ready.</p>
              </div>
              <Badge variant="signal"><Sparkles aria-hidden="true" className="size-3" /> Planned</Badge>
            </div>
            <div className="mt-6 space-y-5">
              <div className="flex items-start gap-3">
                <Database aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-signal" strokeWidth={1.5} />
                <div><p className="text-sm font-medium text-ink">Data boundary</p><p className="mt-1 text-sm leading-6 text-muted">The screen will consume typed responses through the centralized FastAPI client.</p></div>
              </div>
              <div className="border-l-2 border-signal pl-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Next implementation</p>
                <p className="mt-2 text-sm leading-6 text-ink-soft">{nextStep}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export { ModulePlaceholder };

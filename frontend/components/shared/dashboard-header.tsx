"use client";

import { Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  lastUpdated: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

function DashboardHeader({
  eyebrow,
  title,
  description,
  lastUpdated,
  isRefreshing = false,
  onRefresh,
}: DashboardHeaderProps) {
  function handleRefresh() {
    if (onRefresh) {
      onRefresh();
      return;
    }

     toast.info("Refresh is not available for this module.", {
       description: "This page does not expose a backend refresh action.",
    });
  }

  return (
    <header className="border-b border-line bg-canvas px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-signal">
            <span>{eyebrow}</span>
            <span className="text-line-strong">/</span>
             <span className="inline-flex items-center gap-2 text-muted"><span className="signal-pulse size-1.5 rounded-full bg-signal" /> Backend integration</span>
          </div>
          <h1 className="mt-4 max-w-4xl break-words font-display text-4xl leading-[0.95] tracking-[-0.04em] text-ink sm:text-6xl sm:leading-[0.92] sm:tracking-[-0.045em] lg:text-7xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted sm:text-base">{description}</p>
        </div>

        <div className="flex flex-col gap-4 border-t border-line pt-4 xl:min-w-[22rem] xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="flex flex-wrap items-center gap-2">
             <Badge variant="signal"><Database aria-hidden="true" className="size-3" /> API DATA</Badge>
             <span className="break-words font-mono text-[10px] uppercase tracking-[0.12em] text-muted">UCI APS / persisted backend records</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Last updated</p>
              <p className="mt-1 break-words font-mono text-xs text-ink" aria-live="polite">{lastUpdated}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw aria-hidden="true" className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
               {isRefreshing ? "Refreshing" : "Refresh data"}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

export { DashboardHeader };

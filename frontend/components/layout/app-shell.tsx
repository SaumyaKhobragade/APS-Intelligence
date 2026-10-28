"use client";

import { Activity, ArrowUpRight, CircleHelp, Gauge, Menu, Settings2, X } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import { navigationGroups, pageMetadata } from "@/constants/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/shared/dashboard-header";
import { apiFetch } from "@/services/api-client";

function Wordmark() {
  return (
    <Link href="/" className="group inline-flex items-center gap-3" aria-label="APS Intelligence dashboard">
      <span className="flex size-9 items-center justify-center bg-signal text-white transition-transform group-hover:rotate-12">
        <Gauge aria-hidden="true" className="size-5" strokeWidth={1.6} />
      </span>
      <span>
        <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted">APS / 01</span>
        <span className="block font-display text-xl leading-none tracking-[-0.02em] text-ink">Intelligence</span>
      </span>
    </Link>
  );
}

type BackendHealthStatus = "connected" | "unavailable" | "unknown";

function useBackendHealth(): BackendHealthStatus {
  const [status, setStatus] = React.useState<BackendHealthStatus>("unknown");

  React.useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        await apiFetch<{ status?: string }>("/health", { timeoutMs: 3000 });
        if (active) setStatus("connected");
      } catch {
        if (active) setStatus("unavailable");
      }
    }
    void checkHealth();
    return () => {
      active = false;
    };
  }, []);

  return status;
}

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
  backendStatus: BackendHealthStatus;
}

function Sidebar({ mobileOpen, onClose, backendStatus }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-[min(84vw,20rem)] shrink-0 flex-col border-r border-line bg-surface px-6 py-7 transition-transform duration-200 lg:static lg:w-64 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      aria-label="Application navigation"
    >
      <Wordmark />
      <button
        type="button"
        className="absolute right-5 top-7 inline-flex size-9 items-center justify-center text-muted hover:text-ink lg:hidden"
        aria-label="Close navigation"
        onClick={onClose}
      >
        <X aria-hidden="true" className="size-4" />
      </button>

      <nav aria-label="Primary navigation" className="mt-14 space-y-7">
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p className="mb-3 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">{group.label}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex items-center gap-3 border-l px-3 py-2.5 text-sm transition-colors ${
                      isActive ? "border-signal bg-canvas-deep/70 text-ink" : "border-transparent text-muted hover:border-line-strong hover:bg-canvas-deep/45 hover:text-ink"
                    }`}
                    onClick={onClose}
                  >
                    <span className="font-mono text-[10px] text-muted">{item.index}</span>
                    <Icon aria-hidden="true" className={`size-4 ${isActive ? "text-signal" : "text-muted"}`} strokeWidth={1.6} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-line pt-5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${backendStatus === "connected" ? "bg-success" : backendStatus === "unavailable" ? "bg-signal" : "bg-muted"}`} />
            {backendStatus === "connected" ? "Backend connected" : backendStatus === "unavailable" ? "Backend unavailable" : "Backend status unknown"}
          </span>
          <span className="font-mono text-[10px]">v0.2</span>
        </div>
        <div className="mt-4 flex gap-2">
          <Button aria-label="Help" size="icon" variant="ghost">
            <CircleHelp aria-hidden="true" className="size-4" />
          </Button>
          <Button aria-label="Settings" size="icon" variant="ghost">
            <Settings2 aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastUpdated?: string;
}

function AppShell({ children, onRefresh, isRefreshing = false, lastUpdated = "Persisted backend data" }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const backendStatus = useBackendHealth();
  const pathname = usePathname();
  const metadata = pageMetadata[pathname] ?? pageMetadata["/"];

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} backendStatus={backendStatus} />
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-30 bg-charcoal/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between border-b border-line bg-canvas px-5 py-4 sm:px-8 lg:px-10">
            <div className="flex items-center gap-3 lg:hidden">
              <Wordmark />
            </div>
            <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
              <Activity aria-hidden="true" className="size-4 text-signal" />
              <span>Reliability workspace</span>
              <span className="text-line-strong">/</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{metadata.eyebrow}</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {backendStatus === "connected" ? (
                <Badge variant="neutral" className="px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-xs">
                  <span className="size-1.5 rounded-full bg-success" />
                  <span className="hidden sm:inline">Backend connected</span>
                  <span className="sm:hidden">Connected</span>
                </Badge>
              ) : backendStatus === "unavailable" ? (
                <Badge variant="signal" className="px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-xs">
                  <span className="size-1.5 rounded-full bg-signal" />
                  <span className="hidden sm:inline">Backend unavailable</span>
                  <span className="sm:hidden">Offline</span>
                </Badge>
              ) : (
                <Badge variant="neutral" className="px-2 py-0.5 text-[11px] sm:px-2.5 sm:text-xs">
                  <span className="size-1.5 rounded-full bg-muted" />
                  <span className="hidden sm:inline">Backend status unknown</span>
                  <span className="sm:hidden">Unknown</span>
                </Badge>
              )}
              <Button size="icon" variant="ghost" className="lg:hidden shrink-0" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
                <Menu aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </header>
          <DashboardHeader
            eyebrow={metadata.eyebrow}
            title={metadata.title}
            description={metadata.description}
            lastUpdated={lastUpdated}
            isRefreshing={isRefreshing}
            onRefresh={onRefresh}
          />
          <main>{children}</main>
          <footer className="border-t border-line px-5 py-6 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>APS Intelligence / industrial failure prediction &amp; reliability analytics</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                 Scania APS / persisted backend data <ArrowUpRight aria-hidden="true" className="size-3" />
              </span>
            </div>
          </footer>
        </div>
      </div>
      <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "border-line bg-surface text-ink", title: "font-sans text-sm", description: "font-sans text-xs text-muted" } }} />
    </div>
  );
}

export { AppShell, Wordmark };

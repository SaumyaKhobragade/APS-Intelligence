"use client";

import { Activity, ArrowUpRight, CircleHelp, Gauge, Menu, Settings2, X } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import { navigationItems } from "@/constants/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function Wordmark() {
  return (
    <Link href="#overview" className="group inline-flex items-center gap-3" aria-label="APS Intelligence home">
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

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

function Sidebar({ mobileOpen, onClose }: SidebarProps) {
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
      <div className="mt-14">
        <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Workspace</p>
        <nav aria-label="Primary navigation" className="space-y-1">
          {navigationItems.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 border-l px-3 py-2.5 text-sm transition-colors ${
                index === 0 ? "border-signal text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
              onClick={onClose}
            >
              <span className="font-mono text-[10px] text-muted">{item.index}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className="mt-auto border-t border-line pt-5">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="size-1.5 bg-success" /> API connected
          </span>
          <span className="font-mono text-[10px]">v0.1</span>
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

interface TopBarProps {
  onOpen: () => void;
}

function TopBar({ onOpen }: TopBarProps) {
  return (
    <header className="flex items-center justify-between border-b border-line bg-canvas px-5 py-4 sm:px-8 lg:px-10">
      <div className="flex items-center gap-3 lg:hidden">
        <Wordmark />
      </div>
      <div className="hidden items-center gap-3 text-xs text-muted sm:flex">
        <Activity aria-hidden="true" className="size-4 text-signal" />
        <span>Reliability workspace</span>
        <span className="text-line-strong">/</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em]">Design system preview</span>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="success">
          <span className="size-1.5 bg-success" /> Live API
        </Badge>
         <Button size="icon" variant="ghost" className="lg:hidden" aria-label="Open navigation" onClick={onOpen}>
          <Menu aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </header>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex min-h-screen">
        <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Close navigation overlay"
            className="fixed inset-0 z-30 bg-charcoal/35 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <TopBar onOpen={() => setMobileOpen(true)} />
          <main>{children}</main>
          <footer className="border-t border-line px-5 py-6 sm:px-8 lg:px-10">
            <div className="flex flex-col gap-3 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
              <span>APS Intelligence / Industrial failure prediction &amp; reliability analytics</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em]">
                Scania APS dataset <ArrowUpRight aria-hidden="true" className="size-3" />
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

export { AppShell, Wordmark };

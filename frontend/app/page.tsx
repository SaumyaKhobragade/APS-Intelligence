"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { fetchDashboardSnapshot } from "@/services/dashboard-service";
import type { DashboardSnapshot } from "@/types";

export default function HomePage() {
  const [snapshot, setSnapshot] = React.useState<DashboardSnapshot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true); else setIsLoading(true);
    setError(null);
    try {
      setSnapshot(await fetchDashboardSnapshot());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The dashboard data could not be loaded.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  return (
    <AppShell onRefresh={() => void load(true)} isRefreshing={isRefreshing} lastUpdated={snapshot?.lastUpdated ?? "Loading backend analytics"}>
      <div className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8 lg:px-10">
        {isLoading ? <p className="border border-line bg-surface px-6 py-10 text-center text-sm text-muted" role="status">Loading persisted dashboard analytics…</p> : null}
        {error ? <ErrorState title="Dashboard unavailable" description={error} onRetry={() => void load()} /> : null}
        {!isLoading && !error && snapshot && snapshot.dataset === null && snapshot.models.length === 0 && snapshot.recentExperiments.length === 0 ? (
          <EmptyState title="No persisted dashboard activity" description="The backend is connected, but no model runs, experiments or prediction activity are registered in the active application database." />
        ) : null}
        {!isLoading && !error && snapshot ? <OverviewDashboard snapshot={snapshot} /> : null}
      </div>
    </AppShell>
  );
}

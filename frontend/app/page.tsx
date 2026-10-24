"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";
import { getDemonstrationDashboard } from "@/lib/mock-data";
import type { DashboardSnapshot } from "@/types";

export default function HomePage() {
  const [snapshot, setSnapshot] = React.useState<DashboardSnapshot>(() => getDemonstrationDashboard());
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  function refreshDemonstrationData() {
    setIsRefreshing(true);
    window.setTimeout(() => {
      const refreshed = getDemonstrationDashboard();
      const refreshedAt = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(new Date());
      setSnapshot({ ...refreshed, lastUpdated: `Demo refreshed / ${refreshedAt} UTC` });
      setIsRefreshing(false);
    }, 650);
  }

  return (
    <AppShell onRefresh={refreshDemonstrationData} isRefreshing={isRefreshing} lastUpdated={snapshot.lastUpdated}>
      <OverviewDashboard snapshot={snapshot} />
    </AppShell>
  );
}

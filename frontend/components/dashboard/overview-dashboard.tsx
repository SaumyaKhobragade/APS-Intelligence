import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { DatasetOverview } from "@/components/dashboard/dataset-overview";
import { ModelPerformance } from "@/components/dashboard/model-performance";
import { BusinessImpact } from "@/components/dashboard/business-impact";
import { RecentExperiments } from "@/components/dashboard/recent-experiments";
import { EmptyState } from "@/components/ui/feedback";
import type { DashboardSnapshot } from "@/types";

interface OverviewDashboardProps {
  snapshot: DashboardSnapshot;
}

function OverviewDashboard({ snapshot }: OverviewDashboardProps) {
  return (
    <div className="mx-auto max-w-[1600px]">
      <KpiStrip snapshot={snapshot} />
        {snapshot.dataset && snapshot.distribution ? <DatasetOverview snapshot={snapshot} /> : <EmptyState title="Dataset distribution unavailable" description="The dashboard returned dataset metadata, but no persisted class-profile artifact is available for the active dataset." />}
        {snapshot.models.length ? <ModelPerformance models={snapshot.models} /> : <EmptyState title="Validation metrics unavailable" description="No persisted validation metrics are available in the active registry. Synthetic and official-test results are not substituted." />}
        {snapshot.businessImpact ? <BusinessImpact impact={snapshot.businessImpact} /> : <EmptyState title="Business impact unavailable" description="The dashboard does not have threshold confusion counts for a persisted validation result." />}
      <RecentExperiments experiments={snapshot.recentExperiments} models={snapshot.models} />
    </div>
  );
}

export { OverviewDashboard };

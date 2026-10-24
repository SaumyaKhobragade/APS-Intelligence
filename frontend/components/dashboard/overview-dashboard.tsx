import { KpiStrip } from "@/components/dashboard/kpi-strip";
import { DatasetOverview } from "@/components/dashboard/dataset-overview";
import { ModelPerformance } from "@/components/dashboard/model-performance";
import { BusinessImpact } from "@/components/dashboard/business-impact";
import { RecentExperiments } from "@/components/dashboard/recent-experiments";
import type { DashboardSnapshot } from "@/types";

interface OverviewDashboardProps {
  snapshot: DashboardSnapshot;
}

function OverviewDashboard({ snapshot }: OverviewDashboardProps) {
  return (
    <div className="mx-auto max-w-[1600px]">
      <KpiStrip snapshot={snapshot} />
      <DatasetOverview snapshot={snapshot} />
      <ModelPerformance models={snapshot.models} />
      <BusinessImpact impact={snapshot.businessImpact} />
      <RecentExperiments experiments={snapshot.recentExperiments} models={snapshot.models} />
    </div>
  );
}

export { OverviewDashboard };

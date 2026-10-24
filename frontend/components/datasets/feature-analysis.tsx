"use client";

import * as React from "react";
import { ScanSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FeatureDetailsPanel } from "@/components/datasets/feature-details-panel";
import { FeatureStatisticsTable } from "@/components/datasets/feature-statistics-table";
import type { FeatureStatistics } from "@/types";

interface FeatureAnalysisProps {
  features: FeatureStatistics[];
}

function FeatureAnalysis({ features }: FeatureAnalysisProps) {
  const firstFeature = features.find((feature) => feature.dataType !== "target") ?? features[0];
  const [selectedFeature, setSelectedFeature] = React.useState<FeatureStatistics | undefined>(firstFeature);

  return (
    <section id="feature-analysis" aria-labelledby="feature-analysis-heading" className="border-b border-line px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-signal">05 / Feature analysis</p>
          <h2 id="feature-analysis-heading" className="mt-3 font-display text-4xl leading-none tracking-[-0.035em] text-ink sm:text-5xl">Inspect one signal at a time.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted">The full schema stays searchable and paginated. Select a feature to inspect descriptive statistics without turning the page into a wall of columns.</p>
        </div>
        <Badge variant="neutral"><ScanSearch aria-hidden="true" className="size-3" /> 30 sample rows / 170 source features</Badge>
      </div>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.3fr_0.7fr]">
        <FeatureStatisticsTable features={features} selectedFeatureName={selectedFeature?.name} onSelectFeature={setSelectedFeature} />
        <FeatureDetailsPanel feature={selectedFeature} />
      </div>
    </section>
  );
}

export { FeatureAnalysis };

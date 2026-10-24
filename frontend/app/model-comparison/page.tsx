import { ChartNoAxesCombined } from "lucide-react";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { pageMetadata } from "@/constants/navigation";

export default function ModelComparisonPage() {
  return <ModulePlaceholder metadata={pageMetadata["/model-comparison"]} icon={ChartNoAxesCombined} nextStep="Side-by-side precision-recall curves and threshold-aware model evaluation." />;
}

import { SlidersHorizontal } from "lucide-react";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { pageMetadata } from "@/constants/navigation";

export default function ThresholdOptimizationPage() {
  return <ModulePlaceholder metadata={pageMetadata["/threshold-optimization"]} icon={SlidersHorizontal} nextStep="Cost curves, confusion-matrix trade-offs and a reviewable threshold decision." />;
}

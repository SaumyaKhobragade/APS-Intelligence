import { BrainCircuit } from "lucide-react";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { pageMetadata } from "@/constants/navigation";

export default function FailurePredictionPage() {
  return <ModulePlaceholder metadata={pageMetadata["/failure-prediction"]} icon={BrainCircuit} nextStep="A typed sensor-row form with model selection and prediction explanation." />;
}

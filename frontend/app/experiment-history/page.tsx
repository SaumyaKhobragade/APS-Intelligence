import { FlaskConical } from "lucide-react";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { pageMetadata } from "@/constants/navigation";

export default function ExperimentHistoryPage() {
  return <ModulePlaceholder metadata={pageMetadata["/experiment-history"]} icon={FlaskConical} nextStep="Sortable experiment records with downloadable evaluation reports." />;
}

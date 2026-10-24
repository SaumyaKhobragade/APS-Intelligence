import { Database } from "lucide-react";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";
import { pageMetadata } from "@/constants/navigation";

export default function DatasetExplorerPage() {
  return <ModulePlaceholder metadata={pageMetadata["/dataset-explorer"]} icon={Database} nextStep="Feature coverage, missing-value patterns and class distribution controls." />;
}

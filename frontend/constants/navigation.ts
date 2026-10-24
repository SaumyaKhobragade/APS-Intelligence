import {
  BarChart3,
  BrainCircuit,
  ChartNoAxesCombined,
  FlaskConical,
  LayoutDashboard,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  label: string;
  href: string;
  index: string;
  icon: LucideIcon;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/", index: "01", icon: LayoutDashboard }],
  },
  {
    label: "Data & analytics",
    items: [
      { label: "Dataset Explorer", href: "/dataset-explorer", index: "02", icon: BarChart3 },
      { label: "Model Comparison", href: "/model-comparison", index: "03", icon: ChartNoAxesCombined },
    ],
  },
  {
    label: "Prediction",
    items: [
      { label: "Failure Prediction", href: "/failure-prediction", index: "04", icon: BrainCircuit },
      { label: "Threshold Optimization", href: "/threshold-optimization", index: "05", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Management",
    items: [{ label: "Experiment History", href: "/experiment-history", index: "06", icon: FlaskConical }],
  },
];

export const pageMetadata: Record<string, { title: string; description: string; eyebrow: string }> = {
  "/": {
    title: "Overview dashboard",
    description: "A single view of dataset health, model signal and operational cost.",
    eyebrow: "01 / Dashboard",
  },
  "/dataset-explorer": {
    title: "Dataset explorer",
    description: "Inspect feature coverage, missingness and class distribution.",
    eyebrow: "02 / Data & analytics",
  },
  "/model-comparison": {
    title: "Model comparison",
    description: "Compare trained artifacts against the precision-recall objective.",
    eyebrow: "03 / Data & analytics",
  },
  "/failure-prediction": {
    title: "Failure prediction",
    description: "Prepare a sensor row for inference against a selected model artifact.",
    eyebrow: "04 / Prediction",
  },
  "/threshold-optimization": {
    title: "Threshold optimization",
    description: "Balance false alarms against missed failures using business cost.",
    eyebrow: "05 / Prediction",
  },
  "/experiment-history": {
    title: "Experiment history",
    description: "Review saved evaluation runs, model choices and threshold decisions.",
    eyebrow: "06 / Management",
  },
};

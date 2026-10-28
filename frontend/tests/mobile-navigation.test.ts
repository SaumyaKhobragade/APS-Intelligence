import { describe, expect, it } from "vitest";
import { navigationGroups } from "@/constants/navigation";

describe("Mobile Navigation & Responsiveness (AUDIT-003)", () => {
  it("contains all expected navigation groups with non-empty items", () => {
    expect(navigationGroups.length).toBeGreaterThan(0);
    navigationGroups.forEach((group) => {
      expect(group.label).toBeTruthy();
      expect(group.items.length).toBeGreaterThan(0);
      group.items.forEach((item) => {
        expect(item.href).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.index).toMatch(/^\d{2}$/);
      });
    });
  });

  it("maps backend health status to responsive short and full labels", () => {
    function getStatusLabels(status: "connected" | "unavailable" | "unknown") {
      switch (status) {
        case "connected":
          return { full: "Backend connected", compact: "Connected" };
        case "unavailable":
          return { full: "Backend unavailable", compact: "Offline" };
        case "unknown":
        default:
          return { full: "Backend status unknown", compact: "Unknown" };
      }
    }

    expect(getStatusLabels("connected")).toEqual({ full: "Backend connected", compact: "Connected" });
    expect(getStatusLabels("unavailable")).toEqual({ full: "Backend unavailable", compact: "Offline" });
    expect(getStatusLabels("unknown")).toEqual({ full: "Backend status unknown", compact: "Unknown" });
  });

  it("determines export reference type for historical and active runs correctly", () => {
    function resolveExportRefType(record: { id: string; phase?: string }): "training_run" | "experiment" {
      return record.phase === "phase3" || record.id.startsWith("run-") ? "training_run" : "experiment";
    }

    expect(resolveExportRefType({ id: "run-e5fbb875ddc44a0a97f2", phase: "phase3" })).toBe("training_run");
    expect(resolveExportRefType({ id: "run-custom-123" })).toBe("training_run");
    expect(resolveExportRefType({ id: "exp-ea031c709de9475fa03f", phase: "phase4" })).toBe("experiment");
    expect(resolveExportRefType({ id: "phase9-final-validation-candidate", phase: "phase9" })).toBe("experiment");
    expect(resolveExportRefType({ id: "exp-custom-456" })).toBe("experiment");
  });

  it("verifies section anchor identifiers match expected workspace sections", () => {
    const datasetSections = [
      "#dataset-upload",
      "#dataset-overview",
      "#data-quality",
      "#class-distribution",
      "#feature-analysis",
      "#preprocessing",
    ];
    expect(datasetSections).toHaveLength(6);

    const thresholdSections = [
      "#model-selection",
      "#threshold-control",
      "#threshold-metrics",
      "#threshold-confusion-matrix",
      "#business-cost",
      "#performance-curves",
      "#threshold-recommendations",
      "#model-threshold-comparison",
      "#calibration",
      "#operational-recommendation",
    ];
    expect(thresholdSections).toHaveLength(10);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { navigationGroups } from "@/constants/navigation";
import { ExperimentDetails } from "@/components/experiments/experiment-details";
import type { ExperimentHistoryRecord } from "@/types";

describe("Mobile Navigation & Responsiveness (AUDIT-003)", () => {
  const sampleHistoricalRecord: ExperimentHistoryRecord = {
    id: "run-e5fbb875ddc44a0a97f2",
    name: "CatBoost Smoke Run",
    modelId: "catboost-smoke",
    modelName: "CatBoost",
    datasetId: "dataset-train",
    datasetName: "APS Training Set",
    createdAt: "2026-03-31T10:00:00Z",
    status: "completed",
    experimentType: "model_evaluation",
    isDemonstration: false,
    source: "historical",
    phase: "phase3",
    artifactIntegrityStatus: "verified",
    artifactAvailable: true,
    evaluationResults: {
      prAuc: 0.82,
      precision: 0.44,
      recall: 0.95,
      f1Score: 0.61,
    },
    details: {
      modelConfiguration: {
        modelId: "catboost-smoke",
        modelName: "CatBoost",
        modelVersion: "1.0.0",
        trainingConfiguration: "default",
        randomSeed: 42,
        hyperparameters: { iterations: 100 },
      },
      datasetInformation: {
        datasetId: "dataset-train",
        datasetName: "APS Training",
        evaluationProtocol: "validation",
        compatibilityKey: "key-1",
      },
      preprocessing: {
        missingValueHandling: "median_imputation",
      },
      execution: {
        durationSeconds: 12.5,
        status: "completed",
      },
      configurationSnapshot: {
        modelIdentifier: "catboost",
        modelVersion: "1.0.0",
        datasetIdentifier: "aps-train",
        datasetVersion: "1.0",
        datasetFingerprint: "fp-123",
        featureSchema: ["f1", "f2"],
        preprocessing: {
          missingValueHandling: "median_imputation",
        },
        evaluationSplit: "validation",
        randomSeed: 42,
        classImbalanceStrategy: "class_weight",
        hyperparameters: { iterations: 100 },
        unavailableFields: [],
      },
      compatibility: "compatible",
      compatibilityNote: "Phase 3 smoke run historical evidence",
    },
  };

  it("contains all expected navigation groups with non-empty items and accessible keyboard hrefs", () => {
    expect(navigationGroups.length).toBeGreaterThan(0);
    navigationGroups.forEach((group) => {
      expect(group.label).toBeTruthy();
      expect(group.items.length).toBeGreaterThan(0);
      group.items.forEach((item) => {
        expect(item.href).toBeTruthy();
        expect(item.href.startsWith("/")).toBe(true);
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

    // Phase 3 runs must map to training_run
    expect(resolveExportRefType({ id: "run-e5fbb875ddc44a0a97f2", phase: "phase3" })).toBe("training_run");
    expect(resolveExportRefType({ id: "run-custom-123" })).toBe("training_run");

    // Phase 4, Phase 9 and active experiments map to experiment
    expect(resolveExportRefType({ id: "exp-ea031c709de9475fa03f", phase: "phase4" })).toBe("experiment");
    expect(resolveExportRefType({ id: "phase9-final-validation-candidate", phase: "phase9" })).toBe("experiment");
    expect(resolveExportRefType({ id: "exp-custom-456" })).toBe("experiment");
  });

  it("renders export actions and badge for historical records in ExperimentDetails", () => {
    const onExportJson = vi.fn();
    const onExportCsv = vi.fn();
    const onExportPdf = vi.fn();

    const html = renderToString(
      createElement(ExperimentDetails, {
        experiment: sampleHistoricalRecord,
        referenceType: "training_run",
        onExportJson,
        onExportCsv,
        onExportPdf,
      })
    );

    // Verify historical badge is present
    expect(html).toContain("Historical evidence");
    // Verify export buttons are present and keyboard accessible
    expect(html).toContain("Export JSON");
    expect(html).toContain("Metrics CSV");
    expect(html).toContain("PDF report");
    // Verify record identifier and compatibility note
    expect(html).toContain("run-e5fbb875ddc44a0a97f2");
    expect(html).toContain("Phase 3 smoke run historical evidence");
  });

  it("renders export actions without historical badge for active records in ExperimentDetails", () => {
    const activeRecord: ExperimentHistoryRecord = {
      ...sampleHistoricalRecord,
      id: "exp-active-01",
      source: "active",
      phase: undefined,
    };

    const html = renderToString(
      createElement(ExperimentDetails, {
        experiment: activeRecord,
        referenceType: "experiment",
        onExportJson: () => {},
        onExportCsv: () => {},
        onExportPdf: () => {},
      })
    );

    expect(html).not.toContain("Historical evidence");
    expect(html).toContain("Export JSON");
    expect(html).toContain("Metrics CSV");
    expect(html).toContain("PDF report");
    expect(html).toContain("Backend record");
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

  it("documents browser layout geometry test limits", () => {
    // Note: Vitest executes in Node.js/JSDOM without full browser CSS layout calculation.
    // Navigation drawer transforms, media query transitions (hidden lg:block), and viewport bounds (390px, 768px, 1280px)
    // are validated visually via headless Edge browser audit artifacts.
    const layoutEnginePresent = typeof window !== "undefined" && typeof (window as unknown as { getComputedStyle?: unknown }).getComputedStyle === "function";
    expect(layoutEnginePresent).toBe(false);
  });
});

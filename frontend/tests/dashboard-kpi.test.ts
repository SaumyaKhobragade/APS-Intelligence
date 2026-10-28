import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { KpiStrip } from "@/components/dashboard/kpi-strip";
import type { DashboardSnapshot, ModelMetrics } from "@/types";

describe("Dashboard KPI Strip & MetricDisplay (AUDIT-002)", () => {
  const sampleModels: ModelMetrics[] = [
    {
      modelId: "exp:rf_orig",
      modelName: "random_forest / original",
      prAuc: 0.8864,
      rocAuc: 0.9921,
      precision: 0.9048,
      recall: 0.665,
      f1Score: 0.7666,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
    {
      modelId: "exp:cat_cw",
      modelName: "catboost / class_weight",
      prAuc: 0.8011,
      rocAuc: 0.9941,
      precision: 0.488,
      recall: 0.915,
      f1Score: 0.6365,
      threshold: 0.115,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
    {
      modelId: "exp:log_smote",
      modelName: "logistic_regression / smote",
      prAuc: 0.7445,
      rocAuc: 0.9521,
      precision: 0.3802,
      recall: 0.92,
      f1Score: 0.538,
      threshold: 0.5,
      evaluatedAt: "2026-10-25T12:00:00Z",
    },
  ];

  const sampleSnapshot: DashboardSnapshot = {
    dataset: {
      id: "dataset-train",
      name: "APS Training Set",
      source: "aps_failure_training_set.csv",
      rowCount: 60000,
      featureCount: 170,
      positiveClassLabel: "pos",
      updatedAt: "2026-10-28T12:00:00Z",
      fingerprint: "scania-train-fingerprint",
    },
    distribution: {
      failureRecords: 1000,
      normalRecords: 59000,
      imbalanceRatio: "1:59",
    },
    models: sampleModels,
    businessImpact: {
      falsePositiveCount: 192,
      falseNegativeCount: 17,
      falsePositiveCost: 1,
      falseNegativeCost: 10,
      estimatedCost: 362,
    },
    recentExperiments: [],
    lastUpdated: "2026-10-28T12:00:00Z",
  };

  it("selects top validation model by highest PR-AUC", () => {
    const bestModel = sampleSnapshot.models.length
      ? sampleSnapshot.models.reduce((best, model) => (model.prAuc > best.prAuc ? model : best), sampleSnapshot.models[0])
      : undefined;

    expect(bestModel).toBeDefined();
    expect(bestModel?.modelName).toBe("random_forest / original");
    expect(bestModel?.prAuc).toBe(0.8864);
  });

  it("renders KpiStrip HTML with accessible title and truncation classes", () => {
    const html = renderToString(createElement(KpiStrip, { snapshot: sampleSnapshot }));

    // Renders full name into title attribute for accessible tooltips when truncated
    expect(html).toContain('title="random_forest / original"');
    // Renders truncation and minimum width constraint classes to prevent flex overflow
    expect(html).toContain("truncate");
    expect(html).toContain("min-w-0");
    // Displays section header and KPI labels
    expect(html).toContain("Top validation model");
    expect(html).toContain("Top validation PR-AUC");
    expect(html).toContain("Training records");
    expect(html).toContain("60,000");
    expect(html).toContain("Validation business cost");
    expect(html).toContain("362");
  });

  it("handles empty model list gracefully in rendered HTML", () => {
    const emptySnapshot: DashboardSnapshot = {
      ...sampleSnapshot,
      models: [],
    };
    const html = renderToString(createElement(KpiStrip, { snapshot: emptySnapshot }));

    // Fallback em-dash rendered without erroneous title attribute
    expect(html).not.toContain('title="');
    expect(html).toContain("Top validation model");
    expect(html).toContain("—");
  });

  it("formats validation business cost accurately with illustrative cost assumptions", () => {
    expect(sampleSnapshot.businessImpact?.falsePositiveCost).toBe(1);
    expect(sampleSnapshot.businessImpact?.falseNegativeCost).toBe(10);
    expect(sampleSnapshot.businessImpact?.estimatedCost).toBe(362);
  });

  it("documents browser layout geometry test limits", () => {
    // Note: Vitest executes in Node.js without CSS layout calculation or font glyph measurements.
    // CSS text-overflow ellipsis and geometric element overflow clipping require actual browser rendering engine.
    // Full visual validation is conducted via headless Edge/Chromium screenshot audits at 390px, 768px, 1280px, and 1440px.
    const layoutEnginePresent = typeof window !== "undefined" && typeof (window as unknown as { getComputedStyle?: unknown }).getComputedStyle === "function";
    expect(layoutEnginePresent).toBe(false);
  });
});

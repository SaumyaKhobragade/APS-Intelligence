import { describe, expect, it } from "vitest";
import { downsampleCurve } from "../lib/downsample";

describe("downsampleCurve", () => {
  it("handles empty arrays safely", () => {
    expect(downsampleCurve([], "x", "y", 100)).toEqual([]);
  });

  it("handles very small arrays without modification", () => {
    const single = [{ x: 0.5, y: 0.5 }];
    expect(downsampleCurve(single, "x", "y", 100)).toBe(single);

    const pair = [{ x: 0, y: 1 }, { x: 1, y: 0 }];
    expect(downsampleCurve(pair, "x", "y", 100)).toBe(pair);
  });

  it("returns original array if points length is less than or equal to targetCount", () => {
    const data = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
    const result = downsampleCurve(data, "x", "y", 50);
    expect(result).toBe(data);
    expect(result).toHaveLength(2);
  });

  it("downsamples 1000 points down to exact targetCount while preserving start and end points", () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({
      recall: i / 999,
      precision: 1 - Math.pow(i / 999, 2),
    }));

    const result = downsampleCurve(data, "recall", "precision", 100);

    expect(result).toHaveLength(100);
    expect(result[0]).toEqual(data[0]);
    expect(result[99]).toEqual(data[999]);
  });

  it("preserves prominent peaks and elbows in the curve", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: i === 50 ? 100 : 1, // sharp spike at index 50
    }));

    const result = downsampleCurve(data, "x", "y", 10);
    const hasSpike = result.some((p) => p.x === 50 && p.y === 100);
    expect(hasSpike).toBe(true);
  });

  it("handles non-finite, NaN, null, and missing coordinates without crashing or producing NaN", () => {
    const dirtyData = [
      { x: 0, y: 1 },
      { x: NaN, y: Infinity },
      { x: 0.25, y: -Infinity },
      { x: null as unknown as number, y: undefined as unknown as number },
      { x: 0.5, y: 0.8 },
      { x: 0.75, y: 0.4 },
      { x: 1, y: 0 },
    ];

    const result = downsampleCurve(dirtyData, "x", "y", 4);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(dirtyData[0]);
    expect(result[3]).toEqual(dirtyData[6]);

    // Check that downsampling ran without throwing and returned valid objects
    expect(result.every((item) => typeof item === "object" && item !== null)).toBe(true);
  });

  it("works accurately for both PR curves and ROC curves", () => {
    const prCurve = [
      { recall: 0, precision: 1, threshold: 0.99 },
      { recall: 0.5, precision: 0.8, threshold: 0.5 },
      { recall: 0.8, precision: 0.7, threshold: 0.2 },
      { recall: 0.95, precision: 0.5, threshold: 0.1 },
      { recall: 1.0, precision: 0.1, threshold: 0.01 },
    ];
    const prDownsampled = downsampleCurve(prCurve, "recall", "precision", 3);
    expect(prDownsampled).toHaveLength(3);
    expect(prDownsampled[0].recall).toBe(0);
    expect(prDownsampled[2].recall).toBe(1.0);

    const rocCurve = [
      { falsePositiveRate: 0, truePositiveRate: 0, threshold: 1.0 },
      { falsePositiveRate: 0.01, truePositiveRate: 0.8, threshold: 0.5 },
      { falsePositiveRate: 0.05, truePositiveRate: 0.92, threshold: 0.2 },
      { falsePositiveRate: 0.2, truePositiveRate: 0.98, threshold: 0.1 },
      { falsePositiveRate: 1.0, truePositiveRate: 1.0, threshold: 0.0 },
    ];
    const rocDownsampled = downsampleCurve(rocCurve, "falsePositiveRate", "truePositiveRate", 3);
    expect(rocDownsampled).toHaveLength(3);
    expect(rocDownsampled[0].falsePositiveRate).toBe(0);
    expect(rocDownsampled[2].falsePositiveRate).toBe(1.0);
  });

  it("never mutates original array or original point objects", () => {
    const original = [
      { x: 0, y: 1 },
      { x: 0.3, y: 0.9 },
      { x: 0.6, y: 0.6 },
      { x: 0.8, y: 0.4 },
      { x: 1, y: 0 },
    ];
    const originalClone = JSON.parse(JSON.stringify(original));

    const result = downsampleCurve(original, "x", "y", 3);

    // Verify original array and items are identical to before the call
    expect(original).toEqual(originalClone);
    expect(result).not.toBe(original);
  });
});

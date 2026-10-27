import { describe, expect, it } from "vitest";
import { downsampleCurve } from "../lib/downsample";

describe("downsampleCurve", () => {
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

  it("preserves prominent peaks in the curve", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      x: i,
      y: i === 50 ? 100 : 1, // sharp spike at index 50
    }));

    const result = downsampleCurve(data, "x", "y", 10);
    const hasSpike = result.some((p) => p.x === 50 && p.y === 100);
    expect(hasSpike).toBe(true);
  });
});

/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling for 2D visualization curves.
 * Downsamples dense coordinate arrays to reduce SVG DOM complexity while preserving
 * visual curve fidelity, extrema, and inflection points.
 *
 * IMPORTANT: This is for frontend chart rendering only. Original metric values,
 * thresholds, and persisted evaluation records remain unmodified.
 */

export function downsampleCurve<T extends object>(
  data: T[],
  xKey: keyof T,
  yKey: keyof T,
  targetCount: number = 100,
): T[] {
  const length = data.length;
  if (length <= targetCount || targetCount < 3) {
    return data;
  }

  const sampled: T[] = new Array(targetCount);
  let sampledIndex = 0;

  // Bucket size: leave room for first and last point
  const every = (length - 2) / (targetCount - 2);

  // Always include the first point
  sampled[sampledIndex++] = data[0];

  let aIndex = 0;

  for (let i = 0; i < targetCount - 2; i++) {
    // Calculate point average for next bucket (bucket C)
    let avgX = 0;
    let avgY = 0;
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 2) * every) + 1, length);
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    if (avgRangeLength > 0) {
      for (let j = avgRangeStart; j < avgRangeEnd; j++) {
        avgX += Number(data[j][xKey]) || 0;
        avgY += Number(data[j][yKey]) || 0;
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;
    } else {
      const fallbackPoint = data[Math.min(avgRangeStart, length - 1)];
      avgX = Number(fallbackPoint[xKey]) || 0;
      avgY = Number(fallbackPoint[yKey]) || 0;
    }

    // Current bucket range (bucket B)
    const rangeStart = Math.floor(i * every) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * every) + 1, length);

    // Point A
    const pointA = data[aIndex];
    const pointAX = Number(pointA[xKey]) || 0;
    const pointAY = Number(pointA[yKey]) || 0;

    let maxArea = -1;
    let maxAreaIndex = rangeStart;

    for (let j = rangeStart; j < rangeEnd; j++) {
      const currentX = Number(data[j][xKey]) || 0;
      const currentY = Number(data[j][yKey]) || 0;

      // Triangle area: 0.5 * |x_a(y_b - y_c) + x_b(y_c - y_a) + x_c(y_a - y_b)|
      const area = Math.abs(
        pointAX * (currentY - avgY) +
        currentX * (avgY - pointAY) +
        avgX * (pointAY - currentY),
      );

      if (area > maxArea) {
        maxArea = area;
        maxAreaIndex = j;
      }
    }

    sampled[sampledIndex++] = data[maxAreaIndex];
    aIndex = maxAreaIndex;
  }

  // Always include the last point
  sampled[sampledIndex] = data[length - 1];

  return sampled;
}

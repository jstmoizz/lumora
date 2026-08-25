import { describe, expect, test } from "vitest";
import { DRAG_THRESHOLD_PX, isDragGesture } from "../dragGesture";

describe("isDragGesture", () => {
  test("a pointer that never moves is not a drag", () => {
    expect(isDragGesture({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe(false);
  });

  test("movement under the threshold is still treated as a click", () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX - 1, y: 0 })).toBe(false);
  });

  test("movement past the threshold is a drag", () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: DRAG_THRESHOLD_PX + 1, y: 0 })).toBe(true);
  });

  test("diagonal movement is measured as straight-line distance, not per-axis", () => {
    // 3-4-5 triangle: dx=3, dy=4 => distance 5, comfortably past a
    // default-sized threshold even though neither axis alone crosses it.
    expect(isDragGesture({ x: 0, y: 0 }, { x: 3, y: 4 }, 4.5)).toBe(true);
    expect(isDragGesture({ x: 0, y: 0 }, { x: 3, y: 4 }, 5.5)).toBe(false);
  });

  test("a custom threshold overrides the default", () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: 50, y: 0 }, 100)).toBe(false);
    expect(isDragGesture({ x: 0, y: 0 }, { x: 50, y: 0 }, 10)).toBe(true);
  });
});

import { describe, expect, test } from "vitest";
import { levelForNodeCount, LEVELS } from "../levels";

describe("levelForNodeCount", () => {
  test("a fresh graph (0 nodes) is still Level 1, not unleveled", () => {
    expect(levelForNodeCount(0)).toEqual(LEVELS[0]);
    expect(levelForNodeCount(0).name).toBe("Curious");
  });

  test.each([
    [1, 1],
    [3, 1],
    [4, 2],
    [7, 2],
    [8, 3],
    [14, 3],
    [15, 4],
    [24, 4],
    [25, 5],
    [39, 5],
    [40, 6],
    [100, 6],
  ])("%i studied topics -> level %i", (count, expectedLevel) => {
    expect(levelForNodeCount(count).level).toBe(expectedLevel);
  });

  test("is monotonic: more topics never produces a lower level", () => {
    let previous = 0;
    for (let count = 0; count <= 50; count++) {
      const level = levelForNodeCount(count).level;
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});

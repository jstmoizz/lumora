import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { computeFloatOffset } from "../floatMotion";

describe("computeFloatOffset", () => {
  test("reduced motion disables floating entirely", () => {
    expect(computeFloatOffset("node-1", 12.3, true)).toEqual([0, 0, 0]);
  });

  test("reduced motion returns zero regardless of elapsed time or node id", () => {
    for (const [id, t] of [
      ["a", 0],
      ["b", 999],
      ["lumora-core", 42.5],
    ] as const) {
      expect(computeFloatOffset(id, t, true)).toEqual([0, 0, 0]);
    }
  });

  test("the same node id and elapsed time always produce the same offset (deterministic)", () => {
    const a = computeFloatOffset("node-1", 5.5, false);
    const b = computeFloatOffset("node-1", 5.5, false);
    expect(a).toEqual(b);
  });

  test("two different nodes do not move identically at the same instant", () => {
    const a = computeFloatOffset("mathematics", 10, false);
    const b = computeFloatOffset("computer-science", 10, false);
    expect(a).not.toEqual(b);
  });

  test("offsets stay small — restrained, not bouncing", () => {
    // Sample across a wide time range so this isn't just checking one lucky
    // instant near a sine trough.
    for (let t = 0; t < 60; t += 3.7) {
      const [x, y, z] = computeFloatOffset("node-1", t, false);
      for (const component of [x, y, z]) {
        expect(Math.abs(component)).toBeLessThan(0.1);
      }
    }
  });

  test("motion is continuous over time (no per-frame jumps) for a fixed node", () => {
    const a = computeFloatOffset("node-1", 10, false);
    const b = computeFloatOffset("node-1", 10.016, false); // one frame later at 60fps
    const delta = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    expect(delta).toBeLessThan(0.01);
  });

  test("every offset component is finite", () => {
    const [x, y, z] = computeFloatOffset("node-1", 123.456, false);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });

  test("does not use Math.random", () => {
    const source = readFileSync(path.join(process.cwd(), "app/explore/floatMotion.ts"), "utf-8");
    expect(source).not.toMatch(/Math\.random/);
  });
});

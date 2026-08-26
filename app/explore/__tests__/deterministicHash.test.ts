import { describe, expect, test } from "vitest";
import { hashToUnit } from "../deterministicHash";

describe("hashToUnit", () => {
  test("the same seed always produces the same value", () => {
    expect(hashToUnit("node-1")).toBe(hashToUnit("node-1"));
  });

  test("different seeds generally produce different values", () => {
    const values = new Set(["a", "b", "c", "d", "e"].map(hashToUnit));
    expect(values.size).toBe(5);
  });

  test("output stays within [0, 1)", () => {
    for (const seed of ["", "x", "a-long-uuid-like-node-id-1234567890", "🌙"]) {
      const value = hashToUnit(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  test("adjacent-looking seeds do not land suspiciously close together", () => {
    const a = hashToUnit("node-0");
    const b = hashToUnit("node-1");
    expect(Math.abs(a - b)).toBeGreaterThan(0.01);
  });
});

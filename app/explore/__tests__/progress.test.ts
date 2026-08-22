import { describe, expect, test } from "vitest";
import { familiarityFor } from "../progress";

describe("familiarityFor", () => {
  test("undefined (never studied) maps to the unstudied tier", () => {
    expect(familiarityFor(undefined)).toBe(0);
  });

  test("zero maps to the unstudied tier", () => {
    expect(familiarityFor(0)).toBe(0);
  });

  test("one maps to the studied-once tier", () => {
    expect(familiarityFor(1)).toBe(1);
  });

  test("any count above one maps to the studied-repeatedly tier", () => {
    expect(familiarityFor(2)).toBe(2);
    expect(familiarityFor(50)).toBe(2);
  });
});

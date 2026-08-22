import { describe, expect, test } from "vitest";
import { expansionStateFor, familiarityFor } from "../progress";

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

describe("expansionStateFor", () => {
  test("an unstudied topic hides its expanded concepts", () => {
    expect(expansionStateFor(undefined)).toBe("hidden");
    expect(expansionStateFor(0)).toBe("hidden");
  });

  test("a topic studied once only hints that concepts are available", () => {
    expect(expansionStateFor(1)).toBe("hinted");
  });

  test("a topic studied repeatedly reveals its concepts", () => {
    expect(expansionStateFor(2)).toBe("revealed");
    expect(expansionStateFor(50)).toBe("revealed");
  });

  test("is deterministic — the same study_count always yields the same state", () => {
    expect(expansionStateFor(1)).toBe(expansionStateFor(1));
    expect(expansionStateFor(3)).toBe(expansionStateFor(3));
  });
});

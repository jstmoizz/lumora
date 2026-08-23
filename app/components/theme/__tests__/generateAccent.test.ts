import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyGenerateAccent,
  DEFAULT_GENERATE_ACCENT,
  GENERATE_ACCENT_STORAGE_KEY,
  GENERATE_ACCENTS,
  getStoredGenerateAccent,
  isGenerateAccent,
} from "../generateAccent";
import { THEME_STORAGE_KEY } from "../theme";

beforeEach(() => {
  window.localStorage.clear();
});

describe("isGenerateAccent", () => {
  test("accepts exactly the ten defined accents", () => {
    for (const { value } of GENERATE_ACCENTS) {
      expect(isGenerateAccent(value)).toBe(true);
    }
    expect(GENERATE_ACCENTS).toHaveLength(10);
  });

  test("rejects anything else", () => {
    expect(isGenerateAccent("magenta")).toBe(false);
    expect(isGenerateAccent("")).toBe(false);
  });
});

describe("DEFAULT_GENERATE_ACCENT", () => {
  test("is indigo", () => {
    expect(DEFAULT_GENERATE_ACCENT).toBe("indigo");
  });
});

describe("getStoredGenerateAccent", () => {
  test("defaults to indigo when nothing is stored", () => {
    expect(getStoredGenerateAccent()).toBe("indigo");
  });

  test("returns a validly stored accent", () => {
    window.localStorage.setItem(GENERATE_ACCENT_STORAGE_KEY, "pink");
    expect(getStoredGenerateAccent()).toBe("pink");
  });

  test("falls back to indigo for a corrupted/unexpected stored value", () => {
    window.localStorage.setItem(GENERATE_ACCENT_STORAGE_KEY, "not-a-real-accent");
    expect(getStoredGenerateAccent()).toBe("indigo");
  });
});

describe("applyGenerateAccent", () => {
  test("persists the accent under its own storage key", () => {
    applyGenerateAccent("green");

    expect(window.localStorage.getItem(GENERATE_ACCENT_STORAGE_KEY)).toBe("green");
  });

  test("never touches the global theme's storage key", () => {
    applyGenerateAccent("blue");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  test("never throws when storage is unavailable", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = vi.fn(() => {
      throw new Error("storage disabled");
    });

    expect(() => applyGenerateAccent("teal")).not.toThrow();

    window.localStorage.setItem = original;
  });
});

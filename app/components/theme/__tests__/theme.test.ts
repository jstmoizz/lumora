import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  applyThemePreference,
  getStoredThemePreference,
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from "../theme";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

describe("isThemePreference", () => {
  test("accepts exactly the three valid preferences", () => {
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isThemePreference("solarized")).toBe(false);
    expect(isThemePreference("")).toBe(false);
  });
});

describe("resolveTheme", () => {
  test("an explicit light/dark preference resolves to itself regardless of OS preference", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  test("'system' resolves via the OS media query", () => {
    // vitest.setup.ts stubs matchMedia to always report matches: true.
    expect(resolveTheme("system")).toBe("dark");
  });
});

describe("getStoredThemePreference", () => {
  test("defaults to 'system' when nothing is stored", () => {
    expect(getStoredThemePreference()).toBe("system");
  });

  test("returns a validly stored preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(getStoredThemePreference()).toBe("light");
  });

  test("falls back to 'system' for a corrupted/unexpected stored value", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "not-a-real-theme");
    expect(getStoredThemePreference()).toBe("system");
  });
});

describe("applyThemePreference", () => {
  test("persists the preference and applies the resolved class", () => {
    applyThemePreference("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  test("switching preferences swaps the class rather than accumulating both", () => {
    applyThemePreference("dark");
    applyThemePreference("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  test("never throws when storage is unavailable", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = vi.fn(() => {
      throw new Error("storage disabled");
    });

    expect(() => applyThemePreference("dark")).not.toThrow();
    // The class still applies for this page view even though persistence
    // failed.
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    window.localStorage.setItem = original;
  });
});

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { THEME_INIT_SCRIPT } from "../ThemeScript";
import { THEME_STORAGE_KEY } from "../theme";

// jsdom does not execute a <script> injected via dangerouslySetInnerHTML,
// so the only way to exercise the pre-hydration script's actual runtime
// behavior is to run its source directly against the jsdom globals —
// exactly what the real inline script does in a browser <head>.
function runThemeInitScript() {
  new Function(THEME_INIT_SCRIPT)();
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("light", "dark");
});

describe("ThemeScript — normal (non-throwing) path", () => {
  test("a validly stored preference wins, regardless of OS preference", () => {
    // vitest.setup.ts stubs matchMedia to always report matches: true
    // (dark) — an explicit stored "light" must still win.
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");

    runThemeInitScript();

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("no stored preference resolves via the OS preference ('system')", () => {
    runThemeInitScript();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });
});

describe("ThemeScript — storage-restricted fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("localStorage.getItem throwing still applies a deterministic theme class, via the OS preference", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(() => runThemeInitScript()).not.toThrow();

    // matchMedia is stubbed to matches: true (dark) in vitest.setup.ts.
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  test("localStorage.getItem throwing AND matchMedia throwing still applies a deterministic (light) class", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = () => {
      throw new Error("matchMedia unavailable");
    };

    expect(() => runThemeInitScript()).not.toThrow();

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    window.matchMedia = originalMatchMedia;
  });

  test("never applies both classes at once, even on the fallback path", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    runThemeInitScript();

    const classes = [...document.documentElement.classList].filter(
      (c) => c === "light" || c === "dark",
    );
    expect(classes).toHaveLength(1);
  });
});

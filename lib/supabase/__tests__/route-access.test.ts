import { describe, expect, test } from "vitest";
import { isAuthOnlyForSignedOutPath, isProtectedPath } from "../route-access";

describe("isProtectedPath", () => {
  test("protects /generate, /history, /explore, /settings and their subpaths", () => {
    for (const path of [
      "/generate",
      "/generate/anything",
      "/history",
      "/explore",
      "/explore/topic",
      "/settings",
    ]) {
      expect(isProtectedPath(path)).toBe(true);
    }
  });

  test("does not protect public pages", () => {
    for (const path of ["/", "/about", "/health", "/login", "/signup"]) {
      expect(isProtectedPath(path)).toBe(false);
    }
  });

  test("does not protect /playground — dev/coursework demo content, not user-specific", () => {
    expect(isProtectedPath("/playground")).toBe(false);
    expect(isProtectedPath("/playground/modal")).toBe(false);
  });

  test("does not false-positive on a path that merely starts with a protected prefix", () => {
    expect(isProtectedPath("/generated-content")).toBe(false);
  });
});

describe("isAuthOnlyForSignedOutPath", () => {
  test("flags /login and /signup", () => {
    expect(isAuthOnlyForSignedOutPath("/login")).toBe(true);
    expect(isAuthOnlyForSignedOutPath("/signup")).toBe(true);
  });

  test("does not flag /verify or /reset-password — both are reached via an email link that establishes a session before rendering", () => {
    expect(isAuthOnlyForSignedOutPath("/verify")).toBe(false);
    expect(isAuthOnlyForSignedOutPath("/reset-password")).toBe(false);
  });

  test("does not flag unrelated paths", () => {
    expect(isAuthOnlyForSignedOutPath("/generate")).toBe(false);
  });
});

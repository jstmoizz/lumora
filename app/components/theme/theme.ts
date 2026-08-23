/**
 * Shared theme logic for Phase 4.4's Light/Dark/System support. Hand-rolled
 * rather than a library (next-themes etc.): the actual mechanism is small
 * (read/write one localStorage key, toggle one class, listen to one media
 * query) and this keeps it dependency-free and fully under this app's own
 * control, matching "prefer CSS/existing tooling" for this phase.
 *
 * Source of truth split:
 * - localStorage (`THEME_STORAGE_KEY`) drives instant, no-reload
 *   application on every page — read synchronously by the inline
 *   ThemeScript before first paint, so returning visitors never see a
 *   flash of the wrong theme.
 * - `user_settings.theme` (Supabase) is the durable, cross-device record —
 *   written via `updateUserSetting("theme", ...)` alongside every local
 *   change, and reconciled into localStorage once when Settings loads (see
 *   SettingsClient), so a new device converges after one Settings visit.
 * Full rationale for this split is in the Phase 4.4 report.
 */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "lumora-theme";

export function isThemePreference(value: string): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function prefersDarkOS(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") {
    return prefersDarkOS() ? "dark" : "light";
  }
  return preference;
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored && isThemePreference(stored) ? stored : "system";
  } catch {
    // Private browsing / storage disabled — fall back to system rather
    // than throwing.
    return "system";
  }
}

// Distinguishes "nothing has ever been stored" from "system" as a stored
// value — getStoredThemePreference() collapses both to "system", which
// isn't enough to tell a genuinely fresh browser apart from one where the
// user explicitly picked System. Settings' cross-device reconciliation
// (see AppearanceRow in app/settings/SettingsClient.tsx) needs exactly
// that distinction: it should only ever pull the database's value in on a
// browser that has never made a local choice at all, never as a general
// "these two disagree, database wins" rule — the database read can be
// stale or defaulted for reasons that have nothing to do with which one is
// actually more recent.
export function hasStoredThemePreference(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Applies a theme preference: persists it locally and toggles the `.dark`
 * class `@custom-variant dark` in globals.css keys every `dark:` utility
 * off of. Never touches the database — callers that need durability (the
 * Settings Appearance control) additionally call `updateUserSetting`.
 */
export function applyThemePreference(preference: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Ignore storage failures — the class still gets applied for this
    // page view, it just won't persist across reloads.
  }
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.classList.toggle("light", resolved === "light");
}

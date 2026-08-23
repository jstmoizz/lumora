"use client";

import { useEffect } from "react";
import { applyThemePreference, getStoredThemePreference } from "./theme";

// Mounted once in the root layout. Renders nothing — its only job is to
// keep the resolved theme correct for the "system" preference while
// Lumora stays open in one tab: ThemeScript already resolves it once at
// load, but only a live matchMedia listener catches the OS preference
// changing *while the page is open* (e.g. the OS switching to dark at
// sunset). A user who picked an explicit Light or Dark override is
// intentionally unaffected — this only ever re-resolves when the stored
// preference is "system".
export default function ThemeListener() {
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleChange() {
      if (getStoredThemePreference() === "system") {
        applyThemePreference("system");
      }
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return null;
}

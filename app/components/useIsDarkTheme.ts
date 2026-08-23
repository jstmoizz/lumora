"use client";

import { useSyncExternalStore } from "react";

// Lumora's theme is a plain `.dark`/`.light` class on <html> (see
// app/components/theme/theme.ts) rather than a React context, so a
// MutationObserver on that one attribute is the correct way to read it
// reactively without touching the existing theme system at all.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot() {
  return document.documentElement.classList.contains("dark");
}

// `true` here is just a placeholder — ThemeScript (see
// app/components/theme/ThemeScript.tsx) sets the real `.dark`/`.light`
// class before hydration even starts, so useSyncExternalStore's
// tearing-prevention behavior reconciles this to the actual value before
// the first paint, exactly like useReducedMotion's server snapshot.
function getServerSnapshot() {
  return true;
}

// Shared across the app shell: originally the shader's `u_isLight` uniform
// (ShaderScene.tsx), now also SpecularButton's and ClickSpark's theme-aware
// color defaults — anywhere that needs to pick a literal color value (not a
// CSS var) based on the live theme, reactively, without a remount.
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

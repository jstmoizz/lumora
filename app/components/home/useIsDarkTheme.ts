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

// Never rendered during SSR (ShaderScene is loaded via next/dynamic with
// ssr:false), so this value is never actually read on the server.
function getServerSnapshot() {
  return true;
}

// Feeds the shader's `u_isLight` uniform, so switching themes mid-session
// (Settings' Light/Dark/System control) retunes the shader's palette
// intensity without needing a remount.
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

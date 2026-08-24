"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const mediaQueryList = window.matchMedia(QUERY);
  mediaQueryList.addEventListener("change", onChange);
  return () => mediaQueryList.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

// Server has no matchMedia; `false` here is corrected against the real
// client snapshot before paint (useSyncExternalStore's tearing-prevention
// behavior), so there's no visible flash even when the OS setting is on.
function getServerSnapshot() {
  return false;
}

// Shared across the app shell: GlobalDock disables its magnification via
// this, HeroShaderBackground swaps to AuroraBackground via this. (Explore
// keeps its own copy, app/explore/useReducedMotion.ts, left unmigrated.)
// Reactive, not a one-time read, so a mid-session OS toggle is picked up
// immediately.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

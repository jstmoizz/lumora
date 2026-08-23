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

// Shared across the app shell: the global Dock (GlobalDock.tsx) uses this
// to disable its magnification/distance interaction, and Home's
// HeroShaderBackground uses it to swap to the static AuroraBackground.
// (Explore keeps its own copy, app/explore/useReducedMotion.ts — same tiny
// mechanism, left alone rather than migrated, since Explore's module tree
// is otherwise untouched this phase.) Reactive, not a one-time read, so a
// user who toggles the OS setting mid-session is picked up immediately.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

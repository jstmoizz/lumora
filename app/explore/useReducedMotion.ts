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

// Reactive, not a one-time read — ExploreClient unmounts the whole Canvas
// the moment this flips true, so it must respond to the media query's
// `change` event for a user who toggles the OS setting mid-session.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

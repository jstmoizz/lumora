"use client";

import { useSyncExternalStore } from "react";

// Cheap, synchronous WebGL capability check.
function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

// WebGL support can't change during a session, so there's nothing to
// subscribe to — this only exists to get the SSR-safe `false` default and
// the pre-paint correction to the real client value "for free" from
// useSyncExternalStore, the same as useReducedMotion.
function subscribe() {
  return () => {};
}

function getServerSnapshot() {
  return false;
}

export function useWebglSupported(): boolean {
  return useSyncExternalStore(subscribe, hasWebGL, getServerSnapshot);
}

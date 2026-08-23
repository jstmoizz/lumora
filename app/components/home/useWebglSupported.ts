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

// Home-scoped copy of app/explore/webgl.ts — kept local rather than shared
// so the Home hero's shader doesn't reach into Explore's module tree for
// one capability check.
export function useWebglSupported(): boolean {
  return useSyncExternalStore(subscribe, hasWebGL, getServerSnapshot);
}

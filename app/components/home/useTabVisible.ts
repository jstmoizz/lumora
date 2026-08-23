"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getSnapshot() {
  return document.visibilityState === "visible";
}

// Never rendered during SSR (ShaderScene is loaded via next/dynamic with
// ssr:false), so this value is never actually read on the server — `true`
// is just a reasonable placeholder.
function getServerSnapshot() {
  return true;
}

// Drives the shader Canvas's `frameloop` prop: "never" stops R3F's render
// loop entirely (freezing u_time along with it) the instant the tab is
// backgrounded, and "always" resumes it — see ShaderScene.tsx.
export function useTabVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

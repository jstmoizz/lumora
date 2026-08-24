"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useIsDarkTheme } from "@/app/components/useIsDarkTheme";
import { useReducedMotion } from "@/app/components/useReducedMotion";
import { useWebglSupported } from "./useWebglSupported";

// Keeps `ogl` entirely out of the initial History bundle and out of the
// server-rendered HTML — same reasoning as Home's
// dynamic(() => import("./ShaderScene"), { ssr: false }) and Explore's
// dynamic(() => import("./components/Scene"), { ssr: false }).
const Particles = dynamic(() => import("./components/Particles"), {
  ssr: false,
  loading: () => null,
});

// Dark-mode tones reuse LumoraMark.css's own dark-mode `--mark-*` tokens
// (indigo-300/violet-300/pink-300); light-mode reuses its light-mode
// tokens (indigo-600/violet-600/pink-600, deeper for contrast against a
// light background) — the same "Lumora's own palette" progression as the
// header mark, the Home hero shader, and Explore's knowledge graph, not a
// separate invented palette.
const DARK_COLORS = ["#a5b4fc", "#c4b5fd", "#f9a8d4"];
const LIGHT_COLORS = ["#4f46e5", "#7c3aed", "#db2777"];

function getPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return coarsePointer ? 1 : Math.min(window.devicePixelRatio || 1, 2);
}

// Purely decorative, ambient full-page background for History — never
// blocks interaction with the real content in front of it (`pointer-
// events-none` below; Particles.tsx itself tracks the pointer on `window`,
// not this container, for the same reason). Renders nothing at all under
// reduced motion or without WebGL — this is pure visual flourish, not
// content, so "no extra background" is an honest, sufficient fallback
// rather than a second bespoke static treatment to build and maintain.
export default function HistoryParticlesBackground() {
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebglSupported();
  const isDark = useIsDarkTheme();

  const colors = useMemo(() => (isDark ? DARK_COLORS : LIGHT_COLORS), [isDark]);

  if (reducedMotion || !webglSupported) return null;

  return (
    // `fixed`, not `absolute` — History's own <main> can grow much taller
    // than the viewport (a long conversation list), and an absolutely
    // positioned div sized to that full scrollable height would spread the
    // same particle count across all of it, leaving whatever's actually on
    // screen looking sparse. `fixed inset-0` always exactly matches the
    // viewport, the same way the whole-app background wash does (see
    // `body::before` in globals.css).
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <Particles
        particleColors={colors}
        particleCount={220}
        particleSpread={11}
        speed={0.08}
        particleBaseSize={110}
        sizeRandomness={1}
        alphaParticles
        moveParticlesOnHover
        particleHoverFactor={0.3}
        pixelRatio={getPixelRatio()}
      />
    </div>
  );
}

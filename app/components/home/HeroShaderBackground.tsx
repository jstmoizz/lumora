"use client";

import dynamic from "next/dynamic";
import AuroraBackground from "./AuroraBackground";
import { useReducedMotion } from "../useReducedMotion";
import { useWebglSupported } from "./useWebglSupported";

// Keeps three/@react-three/* entirely out of the initial Home bundle and
// out of the server-rendered HTML — same reasoning as Explore's own
// dynamic(() => import("./components/Scene"), { ssr: false }).
const Galaxy = dynamic(() => import("./Galaxy"), {
  ssr: false,
  loading: () => <AuroraBackground />,
});

// The hero's background layer. Renders exactly one of two things, never
// both — this is the "don't stack two competing Aurora systems" call from
// the Phase 4.5 brief:
//
// - reduced motion, or no WebGL: the original AuroraBackground (Phase
//   4.4's blurred CSS blobs). It's already a valid static/reduced-motion
//   treatment on its own (see its `prefers-reduced-motion` handling in
//   globals.css) using the exact same indigo/violet/pink palette, so it
//   doubles as Galaxy's fallback with zero new code — see Galaxy.tsx's own
//   comment on why it doesn't duplicate this reduced-motion/WebGL gating.
// - otherwise: the restrained Galaxy star field, which becomes the hero's
//   primary atmosphere (replacing the old flowing-ribbon shader — see
//   Galaxy.tsx and galaxy.frag.ts for why and how).
//
// A soft radial scrim sits between whichever background renders and the
// real hero content, so the heading/description/CTA stay readable without
// a giant opaque rectangle blocking the shader — see the comment on the
// scrim div below.
export default function HeroShaderBackground() {
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebglSupported();

  const showShader = !reducedMotion && webglSupported;

  return (
    <>
      {showShader ? <Galaxy /> : <AuroraBackground />}

      {/*
        A soft, centered fade toward the page's own background color,
        sitting only where the heading/description/CTA actually are —
        not a full-hero rectangle. The shader (or AuroraBackground) stays
        fully visible at the hero's edges and corners; only the text's own
        neighborhood gets calmed down.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 65% 60% at 50% 45%, color-mix(in oklch, var(--background) 74%, transparent) 0%, transparent 72%)",
        }}
      />
    </>
  );
}

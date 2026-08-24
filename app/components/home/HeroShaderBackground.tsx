"use client";

import dynamic from "next/dynamic";
import AuroraBackground from "./AuroraBackground";
import { useReducedMotion } from "../useReducedMotion";
import { useWebglSupported } from "./useWebglSupported";

// Keeps three/@react-three/* entirely out of the initial Home bundle and
// out of the server-rendered HTML — same reasoning as Explore's own
// dynamic(() => import("./components/Scene"), { ssr: false }).
const ShaderScene = dynamic(() => import("./ShaderScene"), {
  ssr: false,
  loading: () => <AuroraBackground />,
});

// The hero's background layer. Renders exactly one of two things, never
// both:
//
// - reduced motion, or no WebGL: AuroraBackground's blurred CSS blobs,
//   already a valid static/reduced-motion treatment on its own (same
//   indigo/violet/pink palette), so it doubles as the shader's fallback.
// - otherwise: the GLSL shader, as the hero's primary atmosphere.
//
// A soft radial scrim sits between whichever background renders and the
// real hero content, so the heading/description/CTA stay readable without
// a giant opaque rectangle blocking the shader — see the scrim div below.
export default function HeroShaderBackground() {
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebglSupported();

  const showShader = !reducedMotion && webglSupported;

  return (
    <>
      {showShader ? <ShaderScene /> : <AuroraBackground />}

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

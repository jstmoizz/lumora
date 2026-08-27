"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
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

interface Props {
  // Fires once this background layer has settled into whatever it's
  // actually going to be: immediately when the shader won't render at all
  // (reduced motion / no WebGL — AuroraBackground needs no async setup), or
  // once ShaderScene's own dynamic chunk has actually mounted otherwise.
  // page.tsx waits for this alongside WarpText's own onReady before lifting
  // the hero's loading curtain — ShaderScene is a separate lazy chunk from
  // WarpText's static import, so on some devices/connections WarpText can
  // be ready well before the shader chunk arrives; without this, the
  // curtain would lift onto the plain AuroraBackground loading fallback,
  // which then visibly pops into the real shader a moment later.
  onBackgroundReady?: () => void;
}

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
export default function HeroShaderBackground({ onBackgroundReady }: Props) {
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebglSupported();

  const showShader = !reducedMotion && webglSupported;

  // Both hooks above start at an SSR-safe `false` default and correct to
  // the real client value a render or two after hydration (the same
  // tearing-prevention dance useSyncExternalStore always does) — so
  // `showShader` can read `false` for one brief, transient render even on
  // a browser that fully supports WebGL, before flipping to `true` once
  // corrected. Firing onBackgroundReady straight off that first reading
  // would call it before the real shader ever gets a chance to mount. This
  // ref+timer pair is scheduled at most once, and is cancelled the moment
  // `showShader` becomes true (see the cleanup below) — so on any browser
  // that actually shows the shader, this timer never fires at all; it only
  // resolves "no shader, ready now" once that's had a moment to be certain.
  const onBackgroundReadyRef = useRef(onBackgroundReady);
  useEffect(() => {
    onBackgroundReadyRef.current = onBackgroundReady;
  }, [onBackgroundReady]);

  const noShaderTimerScheduled = useRef(false);
  useEffect(() => {
    if (showShader || noShaderTimerScheduled.current) return undefined;
    noShaderTimerScheduled.current = true;
    const timer = setTimeout(() => onBackgroundReadyRef.current?.(), 250);
    return () => clearTimeout(timer);
  }, [showShader]);

  return (
    <>
      {showShader ? (
        <ShaderScene onMounted={onBackgroundReady} />
      ) : (
        <AuroraBackground />
      )}

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

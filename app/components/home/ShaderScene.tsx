"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Mesh, ShaderMaterial, Vector2 } from "three";
import { fragmentShader } from "./shaders/lumora.frag";
import { vertexShader } from "./shaders/lumora.vert";
import { useIsDarkTheme } from "../useIsDarkTheme";
import { useElementVisible } from "./useElementVisible";
import { useTabVisible } from "./useTabVisible";
import "./ShaderScene.css";

// Coarse pointers (touch) skip straight to the cap's floor — a phone's GPU
// doesn't need to shade this many physical pixels for a decorative
// full-bleed background.
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
function getDpr(): [number, number] {
  return isCoarsePointer() ? [1, 1] : [1, 1.5];
}

interface ShaderPlaneProps {
  isDark: boolean;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

// The actual fullscreen-plane + shader material. Split out from
// ShaderScene so `useFrame`/`useThree` (R3F hooks — only valid inside a
// <Canvas>) sit right next to the JSX that needs them.
function ShaderPlane({ isDark, mouseRef, wrapperRef }: ShaderPlaneProps) {
  const meshRef = useRef<Mesh>(null);
  // Holds the live three.js material instance. Only read/written inside
  // effects and useFrame, never render body/JSX — what React Compiler's
  // ref rules require, and the right tool anyway for "mutates every frame,
  // shouldn't trigger a re-render".
  const materialRef = useRef<ShaderMaterial | null>(null);

  // Constructed once, before paint, and attached directly to the mesh —
  // sidesteps ever needing to pass a freshly-allocated uniforms object
  // through JSX props on every render.
  useLayoutEffect(() => {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new Vector2(1, 1) },
        u_mouse: { value: new Vector2(0.5, 0.5) },
        u_isLight: { value: isDark ? 0 : 1 },
        u_aspect: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    materialRef.current = material;
    if (meshRef.current) meshRef.current.material = material;

    return () => {
      materialRef.current = null;
      material.dispose();
    };
    // Constructed exactly once; `isDark`'s value here only seeds the very
    // first frame — later theme changes are pushed through the effect
    // below instead of rebuilding the material.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme can change after the shader has already mounted (Settings'
  // Light/Dark/System control) — push the new value into the existing
  // uniform immediately rather than waiting for it to matter next frame.
  useEffect(() => {
    const material = materialRef.current;
    if (material) material.uniforms.u_isLight.value = isDark ? 0 : 1;
  }, [isDark]);

  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;

    // Only reached while the Canvas's frameloop is "always" (tab visible),
    // so u_time naturally stops advancing the instant the tab is hidden —
    // see ShaderScene's `frameloop` prop below.
    material.uniforms.u_time.value = state.clock.elapsedTime;

    // gl_FragCoord is in physical framebuffer pixels, so u_resolution must
    // match: logical CSS size scaled by the actual (capped) device pixel
    // ratio R3F resolved.
    const dpr = state.viewport.dpr;
    material.uniforms.u_resolution.value.set(state.size.width * dpr, state.size.height * dpr);

    // u_resolution tracks R3F's debounced measured size (stale for up to
    // 500ms during HeroScrollShell's scroll-linked resize) — reading the
    // wrapper's live box here instead keeps the shader's aspect correction
    // matching what's actually displayed, so the CSS stretch never visibly
    // squishes the ribbons mid-scroll. u_resolution itself stays debounced;
    // it only normalizes gl_FragCoord into UV space, which doesn't need to
    // be live.
    const wrapper = wrapperRef.current;
    if (wrapper) {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        material.uniforms.u_aspect.value = rect.width / rect.height;
      }
    }

    // Ease toward the latest pointer sample instead of snapping to it, so
    // the field's response to the mouse reads as a gentle pull rather than
    // a twitch.
    const target = mouseRef.current;
    const current = material.uniforms.u_mouse.value;
    current.x += (target.x - current.x) * 0.05;
    current.y += (target.y - current.y) * 0.05;
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default function ShaderScene() {
  const isDark = useIsDarkTheme();
  const tabVisible = useTabVisible();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const heroVisible = useElementVisible(wrapperRef);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  // Tracked on `window`, independent of the canvas's own (deliberately
  // pointer-events: none) hit-testing — see the wrapping div in
  // HeroShaderBackground.tsx, which blocks the canvas from ever
  // intercepting clicks meant for the hero's real content.
  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      mouseRef.current = {
        x: event.clientX / window.innerWidth,
        y: 1 - event.clientY / window.innerHeight,
      };
    }
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, []);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="shader-scene pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <Canvas
        dpr={getDpr()}
        gl={{ antialias: false, alpha: false }}
        // "never" fully stops R3F's render loop (including u_time) whenever
        // the tab is backgrounded or the hero has scrolled out of view —
        // HeroScrollShell only pins this section for a bounded scroll
        // range, so there's no reason to keep paying for a WebGL frame past
        // that. Only changes frameloop mode on the existing Canvas/renderer;
        // nothing here ever unmounts or recreates them.
        frameloop={tabVisible && heroVisible ? "always" : "never"}
        // react-use-measure's resize callback is wired to the `scroll`
        // debounce (not `resize`, which only covers real window resizes),
        // since HeroScrollShell's scroll-linked shrink resizes this
        // wrapper every animation frame. ShaderScene.css forces the
        // canvas's *visual* size to always match its parent regardless of
        // how stale the measured size is, so a long debounce here has zero
        // visual downside (the browser just bitmap-scales the existing
        // frame in between) and only trades off how often the actual WebGL
        // framebuffer gets reallocated — raised to 500ms so that only
        // happens once scrolling has stopped.
        resize={{ debounce: { scroll: 500, resize: 0 } }}
      >
        <ShaderPlane isDark={isDark} mouseRef={mouseRef} wrapperRef={wrapperRef} />
      </Canvas>
    </div>
  );
}

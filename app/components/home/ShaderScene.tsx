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
  // Holds the live three.js material instance. Only ever read/written
  // inside effects and useFrame — never in the render body/JSX — which is
  // what React Compiler's ref/immutability rules actually require; a
  // plain `useRef` is otherwise exactly the right tool for "an object that
  // mutates every frame but shouldn't trigger a re-render".
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

    // u_resolution above tracks R3F's measured size, which is debounced
    // (see the Canvas `resize` prop below) and so goes stale for up to
    // 500ms while HeroScrollShell's MotionValues animate this wrapper's
    // box every scroll tick. Reading the wrapper's live box here — once
    // per frame, no separate ResizeObserver/state/effect — keeps the
    // shader's aspect correction (used in the fragment shader) always
    // matching the box it's actually being displayed in, so the CSS
    // stretch from ShaderScene.css never visibly squishes the ribbons
    // mid-scroll. u_resolution itself is left untouched: it still only
    // needs to normalize gl_FragCoord into 0..1 UV space, which staying
    // debounced doesn't visibly affect.
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
        // "never" fully stops R3F's render loop (and every useFrame
        // callback inside it, including the one advancing u_time) whenever
        // either condition isn't met: tab backgrounded (useTabVisible) or
        // the hero has scrolled out of the viewport (useElementVisible) —
        // HeroScrollShell keeps this section pinned only for a bounded
        // scroll range, then lets it scroll away normally like any other
        // section, at which point there's no reason left to keep paying for
        // a WebGL frame every tick. Toggling this prop only changes the
        // frameloop mode on the existing Canvas/renderer/program — nothing
        // here ever unmounts or recreates them, so a hero leaving/re-
        // entering the viewport is a pause/resume, never a reinit.
        frameloop={tabVisible && heroVisible ? "always" : "never"}
        // R3F measures this wrapper via react-use-measure and calls
        // renderer.setSize on every reported change. Counter-intuitively,
        // react-use-measure's ResizeObserver callback itself — the one that
        // fires when *this element's own box* resizes, exactly what
        // HeroScrollShell's scroll-linked shrink does every animation frame
        // while mid-transition — is wired to the `scroll` debounce value,
        // not `resize` (`resize`'s debounce only governs actual
        // window-resize events; see react-use-measure's source).
        //
        // That debounce alone turned out not to be enough: three.js's
        // renderer.setSize() also rewrites the <canvas> element's own CSS
        // pixel width/height (see ShaderScene.css), so for the length of
        // this debounce window the canvas sits at its *previous* size while
        // its actual (ordinary-CSS, instantly correct) parent has already
        // shrunk or grown with the scroll — and when the debounced resize
        // finally fires, both the CSS box and the WebGL buffer snap to the
        // new size at once, which is the visible "hitch" reported when
        // scrolling back into the hero. ShaderScene.css now forces the
        // canvas's *visual* size to always be 100% of its parent (decoupled
        // from how stale the measured size is), so that snap is gone
        // regardless of this debounce's length — which means the debounce
        // itself can now be tuned purely for reallocation cost (how often
        // the actual WebGL framebuffer gets rebuilt) with zero visual
        // downside, so it's raised further here: from ~37 ResizeObserver
        // fires / ~75 buffer resizes across one slow scroll through the
        // hero at the original 50ms default, down to a handful at 200ms,
        // down further still at 500ms — the browser just bitmap-scales the
        // existing frame to fit in between, imperceptible on a soft
        // gradient shader, while the actual expensive buffer resize now
        // only happens once scrolling has properly stopped.
        resize={{ debounce: { scroll: 500, resize: 0 } }}
      >
        <ShaderPlane isDark={isDark} mouseRef={mouseRef} wrapperRef={wrapperRef} />
      </Canvas>
    </div>
  );
}

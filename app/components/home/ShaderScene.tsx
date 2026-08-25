"use client";

import { useEffect, useRef } from "react";
import {
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from "three";
import { fragmentShader } from "./shaders/lumora.frag";
import { vertexShader } from "./shaders/lumora.vert";
import { useIsDarkTheme } from "../useIsDarkTheme";
import { useElementVisible } from "./useElementVisible";
import { useTabVisible } from "./useTabVisible";
import "./ShaderScene.css";

// Deliberately no @react-three/fiber here: R3F's Canvas imports `* as THREE
// from "three"` internally (to build its JSX-element catalog), which forces
// bundlers to keep the entire three.js namespace alongside R3F's own
// reconciler runtime in whatever chunk contains it. That's the ~900KB chunk
// Home and Explore were sharing. Explore genuinely needs R3F's declarative
// scene graph (many nodes, camera rig, Drei controls) — Home only ever
// draws one fullscreen shader plane, so it's cheaper and simpler to drive
// three.js's own renderer directly with named (tree-shakeable) imports and
// a plain requestAnimationFrame loop than to pay for a reconciler here.

// Coarse pointers (touch) skip straight to the cap's floor — a phone's GPU
// doesn't need to shade this many physical pixels for a decorative
// full-bleed background.
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
function getDprRange(): [number, number] {
  return isCoarsePointer() ? [1, 1] : [1, 1.5];
}
// Matches @react-three/fiber's own dpr-clamping formula
// (Math.min(Math.max(min, devicePixelRatio), max)) — replicated by hand now
// that R3F isn't the one resolving it for us.
function resolveDpr([min, max]: [number, number]): number {
  const target = typeof window !== "undefined" ? (window.devicePixelRatio ?? 2) : 1;
  return Math.min(Math.max(min, target), max);
}

interface Engine {
  start: () => void;
  stop: () => void;
  material: ShaderMaterial;
}

// A plain module-level function, not a closure — same pattern already used
// elsewhere in this codebase (see explore/components/OptionWheel.tsx's
// `runFrame`) to sidestep `react-hooks/immutability` flagging a mutation of
// a ref-held imperative object (the shader material's own uniform, not
// React-managed render state) from inside a component-scoped effect.
function setIsLightUniform(material: ShaderMaterial, isDark: boolean): void {
  material.uniforms.u_isLight.value = isDark ? 0 : 1;
}

export default function ShaderScene() {
  const isDark = useIsDarkTheme();
  const tabVisible = useTabVisible();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const heroVisible = useElementVisible(wrapperRef);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const engineRef = useRef<Engine | null>(null);

  // Tracked on `window`, independent of the canvas's own (deliberately
  // pointer-events: none) hit-testing — see the wrapping div below, which
  // blocks the canvas from ever intercepting clicks meant for the hero's
  // real content.
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

  // Mount-once: owns the renderer/scene/material/render-loop for this
  // component's whole lifetime. Split out from the visibility effect below
  // so toggling frameloop on/off never tears down or recreates the WebGL
  // context — it only starts/stops the same loop.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const canvas = document.createElement("canvas");
    // Canvases default to `display: inline`, which leaves a few pixels of
    // baseline whitespace below them — R3F's own Canvas sets this same
    // `block` override; ShaderScene.css handles the actual width/height.
    canvas.style.display = "block";
    wrapper.appendChild(canvas);

    const renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });

    const scene = new Scene();
    // The vertex shader below writes straight to clip space and ignores
    // the camera entirely (see lumora.vert.ts), so the camera's own
    // fov/position/aspect never affect what's on screen — this is just
    // three.js's WebGLRenderer.render() requiring *a* camera argument to
    // exist.
    const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);

    const geometry = new PlaneGeometry(2, 2);
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
    const mesh = new Mesh(geometry, material);
    // The shader's fullscreen-clip-space trick doesn't behave like a normal
    // 3D object for frustum-intersection purposes — disable culling rather
    // than risk it being (incorrectly) treated as off-screen.
    mesh.frustumCulled = false;
    scene.add(mesh);

    let dprRange = getDprRange();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    function applySize() {
      // Non-null assertion: `wrapper` was already null-checked above: TS
      // just can't carry that narrowing through a nested function
      // declaration for a captured closure variable.
      const rect = wrapper!.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setPixelRatio(resolveDpr(dprRange));
      renderer.setSize(width, height, true);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    // HeroScrollShell resizes this wrapper continuously while the hero
    // shrinks from 100svh down to its resting height as the page scrolls —
    // reallocating the WebGL drawing buffer on every one of those ticks
    // caused a visible hitch. ShaderScene.css forces the canvas's *visual*
    // size to always match its parent via `!important`, decoupled from
    // when the buffer itself actually catches up, so a long debounce here
    // has no visual downside (the browser just bitmap-scales the existing
    // frame in the meantime) — it only trades off how often the buffer is
    // reallocated. A plain window resize (not scroll-driven) applies
    // immediately instead, since there's no continuous-resize hitch to
    // guard against there.
    function scheduleResize(delayMs: number) {
      if (resizeTimer) clearTimeout(resizeTimer);
      if (delayMs <= 0) {
        applySize();
      } else {
        resizeTimer = setTimeout(applySize, delayMs);
      }
    }

    applySize();

    const resizeObserver = new ResizeObserver(() => scheduleResize(500));
    resizeObserver.observe(wrapper);

    function handleWindowResize() {
      dprRange = getDprRange();
      scheduleResize(0);
    }
    function handleWindowScroll() {
      scheduleResize(500);
    }
    window.addEventListener("resize", handleWindowResize);
    window.addEventListener("scroll", handleWindowScroll, { passive: true });

    const clockStart = performance.now();
    let rafId: number | null = null;

    function tick() {
      rafId = requestAnimationFrame(tick);

      // Wall-clock elapsed time, not a pausable clock — the loop simply
      // isn't scheduled while frameloop is stopped (see start/stop below),
      // so u_time freezes at its last value while paused and jumps ahead
      // (rather than resuming smoothly) once frames resume. Matches the
      // previous R3F-driven behavior exactly, since useFrame callbacks
      // there were likewise just not invoked while stopped.
      material.uniforms.u_time.value = (performance.now() - clockStart) / 1000;

      // The renderer's own drawing-buffer size already equals
      // CSS-size * resolved-DPR (that's what setSize/setPixelRatio above
      // produce) — reading it straight off the canvas keeps this in sync
      // with whatever the renderer is actually using, with no separate
      // bookkeeping.
      material.uniforms.u_resolution.value.set(canvas.width, canvas.height);

      // Read live, every frame, independent of the debounced resize above —
      // keeps aspect correction accurate during HeroScrollShell's
      // scroll-linked resize instead of lagging behind by up to 500ms.
      const rect = wrapper!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        material.uniforms.u_aspect.value = rect.width / rect.height;
      }

      // Ease toward the latest pointer sample instead of snapping to it, so
      // the field's response to the mouse reads as a gentle pull rather
      // than a twitch.
      const target = mouseRef.current;
      const current = material.uniforms.u_mouse.value;
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;

      renderer.render(scene, camera);
    }

    let running = false;
    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(tick);
    }
    function stop() {
      running = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    engineRef.current = { start, stop, material };

    return () => {
      stop();
      engineRef.current = null;
      resizeObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleWindowResize);
      window.removeEventListener("scroll", handleWindowScroll);
      geometry.dispose();
      material.dispose();
      // Matches @react-three/fiber's own unmount teardown (dispose +
      // forceContextLoss), which explicitly releases the GPU context
      // rather than relying on garbage collection to get to it eventually.
      renderer.dispose();
      renderer.forceContextLoss();
      wrapper.removeChild(canvas);
    };
    // Constructed exactly once; `isDark`'s value here only seeds the very
    // first frame — later theme changes are pushed through the effect
    // below instead of rebuilding the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "never" stops the render loop entirely (freezing u_time along with it)
  // whenever the tab is backgrounded or the hero has scrolled out of
  // HeroScrollShell's pinned range — there's no reason to keep paying for
  // a WebGL frame past that. Only starts/stops the existing loop; never
  // recreates the renderer/scene.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (tabVisible && heroVisible) {
      engine.start();
    } else {
      engine.stop();
    }
  }, [tabVisible, heroVisible]);

  // Theme can change after mount (Settings' Light/Dark/System control) —
  // push the new value into the existing uniform immediately rather than
  // waiting for it to matter next frame.
  useEffect(() => {
    const material = engineRef.current?.material;
    if (material) setIsLightUniform(material, isDark);
  }, [isDark]);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="shader-scene pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    />
  );
}

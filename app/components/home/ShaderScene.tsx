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

// No @react-three/fiber here: R3F's Canvas imports the whole three.js
// namespace, which forced Home and Explore to share a ~900KB chunk. Home
// only ever draws one fullscreen shader plane, so a plain
// requestAnimationFrame loop with tree-shakeable imports is cheaper than
// paying for a reconciler.

// Coarse pointers (touch) skip to the cap's floor — a phone's GPU doesn't
// need to shade this many pixels for a decorative background.
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
function getDprRange(): [number, number] {
  return isCoarsePointer() ? [1, 1] : [1, 1.5];
}
// Matches @react-three/fiber's own dpr-clamping formula, replicated by
// hand now that R3F isn't resolving it for us.
function resolveDpr([min, max]: [number, number]): number {
  const target = typeof window !== "undefined" ? (window.devicePixelRatio ?? 2) : 1;
  return Math.min(Math.max(min, target), max);
}

interface Engine {
  start: () => void;
  stop: () => void;
  material: ShaderMaterial;
}

// Module-level so mutating the material's uniform doesn't trip react-hooks/immutability.
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

  // Tracked on `window`, independent of the canvas's own pointer-events:
  // none hit-testing (see the wrapping div below).
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

  // Mount-once: owns the renderer/scene/material/render-loop. Split out
  // from the visibility effect below so toggling the loop never tears down
  // the WebGL context.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const canvas = document.createElement("canvas");
    // Canvases default to display: inline, leaving baseline whitespace below.
    canvas.style.display = "block";
    wrapper.appendChild(canvas);

    const renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });

    const scene = new Scene();
    // The vertex shader writes straight to clip space and ignores the
    // camera — this only exists because render() requires one.
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
    // The fullscreen-clip-space trick doesn't behave like a normal 3D
    // object for frustum-intersection, so disable culling.
    mesh.frustumCulled = false;
    scene.add(mesh);

    let dprRange = getDprRange();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;

    function applySize() {
      // Non-null: TS can't carry the earlier null-check through this
      // nested closure.
      const rect = wrapper!.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      renderer.setPixelRatio(resolveDpr(dprRange));
      renderer.setSize(width, height, true);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    // HeroScrollShell resizes this wrapper continuously as the hero shrinks
    // on scroll — reallocating the WebGL buffer on every tick caused a
    // visible hitch. ShaderScene.css locks the canvas's visual size to its
    // parent, so a long debounce here has no visual downside; a plain
    // window resize applies immediately since there's no scroll hitch to
    // guard against.
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

      // Wall-clock elapsed time — the loop simply isn't scheduled while
      // stopped, so u_time freezes and jumps ahead on resume rather than
      // pausing smoothly.
      material.uniforms.u_time.value = (performance.now() - clockStart) / 1000;

      // Reading straight off the canvas keeps this in sync with whatever
      // the renderer is actually using, with no separate bookkeeping.
      material.uniforms.u_resolution.value.set(canvas.width, canvas.height);

      // Read live every frame, independent of the debounced resize, so
      // aspect stays accurate during scroll-linked resizing.
      const rect = wrapper!.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        material.uniforms.u_aspect.value = rect.width / rect.height;
      }

      // Ease toward the latest pointer sample so the response reads as a
      // gentle pull, not a twitch.
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
      // Explicitly releases the GPU context rather than waiting on GC.
      renderer.dispose();
      renderer.forceContextLoss();
      wrapper.removeChild(canvas);
    };
    // Constructed once; `isDark` here only seeds the first frame — later
    // changes go through the effect below instead of rebuilding the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stops the render loop (freezing u_time) when the tab is backgrounded
  // or the hero scrolls out of view — only starts/stops, never recreates.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (tabVisible && heroVisible) {
      engine.start();
    } else {
      engine.stop();
    }
  }, [tabVisible, heroVisible]);

  // Push a theme change into the existing uniform immediately.
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

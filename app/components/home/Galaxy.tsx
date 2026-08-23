"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Color, Mesh, ShaderMaterial, Vector2, Vector3 } from "three";
import { vertexShader } from "./shaders/lumora.vert";
import { fragmentShader } from "./shaders/galaxy.frag";
import { useIsDarkTheme } from "../useIsDarkTheme";
import { useElementVisible } from "./useElementVisible";
import { useTabVisible } from "./useTabVisible";

// Coarse pointers (touch) skip straight to the cap's floor and get a
// thinner field — same reasoning as ShaderScene's own `getDpr()`: a phone
// GPU doesn't need to shade this many physical pixels for a decorative
// background, and it never receives pointermove for the repulsion effect
// anyway.
function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
function getDpr(): [number, number] {
  return isCoarsePointer() ? [1, 1] : [1, 1.5];
}

// Lumora's existing indigo/violet accent family — the same hue language
// already used by ClickSpark, SpecularButton, and BorderGlow's glow (see
// each file's own palette comment) — reused here rather than inventing a
// new palette. `bright` is the minority "contrast star" color; `a`/`b` are
// the majority indigo/violet stars. Light mode uses deeper tones of the
// same hues (not the dark-mode values at lower opacity) so stars carry
// real contrast against a light background, same approach as the old
// shader's own dark/light palettes.
const DARK_PALETTE = {
  bright: new Color("#f8fafc"),
  a: new Color("#818cf8"),
  b: new Color("#a78bfa"),
};
const LIGHT_PALETTE = {
  bright: new Color("#312e81"),
  a: new Color("#4f46e5"),
  b: new Color("#7c3aed"),
};

export interface GalaxyProps {
  density?: number;
  starSpeed?: number;
  speed?: number;
  glowIntensity?: number;
  saturation?: number;
  twinkleIntensity?: number;
  rotationSpeed?: number;
  mouseInteraction?: boolean;
  repulsionStrength?: number;
  className?: string;
}

interface GalaxyConfig {
  density: number;
  starSpeed: number;
  speed: number;
  glowIntensity: number;
  saturation: number;
  twinkleIntensity: number;
  rotationSpeed: number;
  mouseInteraction: boolean;
  repulsionStrength: number;
}

interface MousePointer {
  x: number;
  y: number;
  active: number;
}

interface GalaxyPlaneProps {
  isDark: boolean;
  mouseRef: React.RefObject<MousePointer>;
  config: GalaxyConfig;
}

// The actual fullscreen-plane + shader material, split out from Galaxy so
// useFrame/useThree (R3F hooks) sit next to the JSX that needs them — same
// split as ShaderScene.tsx/ShaderPlane.
function GalaxyPlane({ isDark, mouseRef, config }: GalaxyPlaneProps) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const coarseRef = useRef(false);

  const { gl } = useThree();

  useLayoutEffect(() => {
    coarseRef.current = isCoarsePointer();
    const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
    const densityScale = coarseRef.current ? 0.7 : 1;
    const repulsionEnabled = config.mouseInteraction && !coarseRef.current;

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new Vector2(1, 1) },
        u_mouse: { value: new Vector2(0.5, 0.5) },
        u_mouseActive: { value: 0 },
        u_density: { value: config.density * densityScale },
        u_starSpeed: { value: config.starSpeed },
        u_speed: { value: config.speed },
        u_glowIntensity: { value: config.glowIntensity },
        u_saturation: { value: config.saturation },
        u_twinkleIntensity: { value: config.twinkleIntensity },
        u_rotationSpeed: { value: config.rotationSpeed },
        u_mouseRepulsion: { value: repulsionEnabled ? 1 : 0 },
        u_repulsionStrength: { value: config.repulsionStrength },
        u_colorBright: { value: new Vector3(palette.bright.r, palette.bright.g, palette.bright.b) },
        u_colorA: { value: new Vector3(palette.a.r, palette.a.g, palette.a.b) },
        u_colorB: { value: new Vector3(palette.b.r, palette.b.g, palette.b.b) },
      },
    });
    materialRef.current = material;
    if (meshRef.current) meshRef.current.material = material;

    // R3F's default clear color is opaque black — this is a `transparent:
    // true` background layer meant to sit over Lumora's own page
    // background (see the shader's own file comment), so the canvas
    // itself must clear to zero alpha rather than painting over it.
    gl.setClearColor(0x000000, 0);

    return () => {
      materialRef.current = null;
      material.dispose();
    };
    // Constructed exactly once; theme/config changes are pushed into the
    // live uniforms by the effects below rather than rebuilding the
    // material (same pattern as ShaderScene.tsx).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const palette = isDark ? DARK_PALETTE : LIGHT_PALETTE;
    (material.uniforms.u_colorBright.value as Vector3).set(palette.bright.r, palette.bright.g, palette.bright.b);
    (material.uniforms.u_colorA.value as Vector3).set(palette.a.r, palette.a.g, palette.a.b);
    (material.uniforms.u_colorB.value as Vector3).set(palette.b.r, palette.b.g, palette.b.b);
  }, [isDark]);

  // Tuning props can change at runtime (a caller passing dynamic values) —
  // pushed straight into the uniforms rather than rebuilding the material.
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    const densityScale = coarseRef.current ? 0.7 : 1;
    const repulsionEnabled = config.mouseInteraction && !coarseRef.current;
    const u = material.uniforms;
    u.u_density.value = config.density * densityScale;
    u.u_starSpeed.value = config.starSpeed;
    u.u_speed.value = config.speed;
    u.u_glowIntensity.value = config.glowIntensity;
    u.u_saturation.value = config.saturation;
    u.u_twinkleIntensity.value = config.twinkleIntensity;
    u.u_rotationSpeed.value = config.rotationSpeed;
    u.u_mouseRepulsion.value = repulsionEnabled ? 1 : 0;
    u.u_repulsionStrength.value = config.repulsionStrength;
  }, [
    config.density,
    config.starSpeed,
    config.speed,
    config.glowIntensity,
    config.saturation,
    config.twinkleIntensity,
    config.rotationSpeed,
    config.mouseInteraction,
    config.repulsionStrength,
  ]);

  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;

    // Only reached while the Canvas's frameloop is "always" — see Galaxy's
    // own frameloop prop below, gated on tab + hero visibility exactly
    // like ShaderScene.
    material.uniforms.u_time.value = state.clock.elapsedTime;

    const dpr = state.viewport.dpr;
    material.uniforms.u_resolution.value.set(state.size.width * dpr, state.size.height * dpr);

    // Ease toward the latest pointer sample (position AND activity) rather
    // than snapping — the same technique ShaderScene uses for its own
    // mouse uniform, extended with a third "active" channel so the
    // repulsion effect fades in gently after the first pointer move
    // instead of starting at full strength.
    const target = mouseRef.current;
    const current = material.uniforms.u_mouse.value as Vector2;
    current.x += (target.x - current.x) * 0.06;
    current.y += (target.y - current.y) * 0.06;
    material.uniforms.u_mouseActive.value += (target.active - material.uniforms.u_mouseActive.value) * 0.04;
  });

  return (
    <mesh ref={meshRef} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

// Home hero's atmospheric background: a restrained, theme-aware star field
// (see galaxy.frag.ts for the shader itself). Structured identically to
// ShaderScene.tsx — same visibility-gated frameloop, same resize-debounce
// fix — since that component already solved the exact scroll/resize cost
// problem this replaces ShaderScene *for*; there's no reason to invent a
// second mechanism for the same problem.
//
// Reduced-motion and no-WebGL fallback are NOT handled here: the caller
// (HeroShaderBackground.tsx) already renders the static AuroraBackground
// instead of mounting this component at all in either case, exactly as it
// already did for ShaderScene — Galaxy stays focused on the one job of
// rendering the field.
export default function Galaxy({
  density = 0.85,
  starSpeed = 0.22,
  speed = 0.55,
  glowIntensity = 0.28,
  saturation = 0.38,
  twinkleIntensity = 0.2,
  rotationSpeed = 0.035,
  mouseInteraction = true,
  repulsionStrength = 0.5,
  className,
}: GalaxyProps) {
  const isDark = useIsDarkTheme();
  const tabVisible = useTabVisible();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const heroVisible = useElementVisible(wrapperRef);
  const mouseRef = useRef<MousePointer>({ x: 0.5, y: 0.5, active: 0 });

  // Tracked on `window`, independent of the canvas's own (deliberately
  // pointer-events: none) hit-testing — see ShaderScene's identical note.
  // Touch never fires pointermove the way a mouse does, so this is already
  // effectively mouse-only; `pointerType === "touch"` is filtered anyway
  // for the rare device that reports both.
  useEffect(() => {
    if (!mouseInteraction || isCoarsePointer()) return undefined;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType === "touch") return;
      mouseRef.current = {
        x: event.clientX / window.innerWidth,
        y: 1 - event.clientY / window.innerHeight,
        active: 1,
      };
    }
    window.addEventListener("pointermove", handlePointerMove);
    return () => window.removeEventListener("pointermove", handlePointerMove);
  }, [mouseInteraction]);

  const config: GalaxyConfig = {
    density,
    starSpeed,
    speed,
    glowIntensity,
    saturation,
    twinkleIntensity,
    rotationSpeed,
    mouseInteraction,
    repulsionStrength,
  };

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden${className ? ` ${className}` : ""}`}
    >
      <Canvas
        dpr={getDpr()}
        gl={{ antialias: false, alpha: true }}
        frameloop={tabVisible && heroVisible ? "always" : "never"}
        resize={{ debounce: { scroll: 200, resize: 0 } }}
      >
        <GalaxyPlane isDark={isDark} mouseRef={mouseRef} config={config} />
      </Canvas>
    </div>
  );
}

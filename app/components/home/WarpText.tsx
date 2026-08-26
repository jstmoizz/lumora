"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { Renderer, Program, Mesh, Triangle, Texture, type OGLRenderingContext } from "ogl";
import { useIsDarkTheme } from "../useIsDarkTheme";
import "./WarpText.css";

// A faithful port of React Bits' WarpText component
// (https://reactbits.dev/text-animations/warp-text), shader and all —
// DPR cap, visibility-gated rAF loop, reduced-motion, and WebGL cleanup
// came with it. Two additions on top of upstream:
//
// - `color` defaults to a theme-aware value via useIsDarkTheme() instead of
//   upstream's hardcoded near-white, which would be unreadable in light mode.
// - `text` also accepts an array of runs (`WarpTextRun[]`), each with its
//   own optional `fontFamily`/`fontWeight`, so a phrase can mix fonts (Home
//   uses this for "Lumora" in the brand's wordmark font).
export interface WarpTextRun {
  text: string;
  fontFamily?: string;
  fontWeight?: string | number;
}

export interface Props {
  text?: string | WarpTextRun[];
  color?: string;
  warpStrength?: number;
  warpScale?: number;
  speed?: number;
  pointerInfluence?: number;
  pointerStrength?: number;
  refraction?: number;
  ripple?: boolean;
  fontSize?: string | number;
  fontWeight?: string | number;
  fontFamily?: string;
  letterSpacing?: string | number;
  lineHeight?: string | number;
  className?: string;
  style?: CSSProperties;
}

interface RuntimeProps {
  text: string | WarpTextRun[];
  color: string;
  fontSize: string | number;
  fontWeight: string | number;
  fontFamily: string;
  letterSpacing: string | number;
  lineHeight: string | number;
  warpStrength: number;
  warpScale: number;
  speed: number;
  pointerInfluence: number;
  pointerStrength: number;
  refraction: number;
  ripple: boolean;
}

interface RuntimeContext {
  program: Program;
  rasterize: () => void;
}

interface BuildTextCanvasArgs {
  container: HTMLElement;
  width: number;
  height: number;
  dpr: number;
  props: RuntimeProps;
}

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform sampler2D uTextTexture;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uPointerActive;
uniform float uTime;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform float uSpeed;
uniform float uPointerInfluence;
uniform float uPointerStrength;
uniform float uRefraction;
uniform float uRipple;
uniform float uMotion;

in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.02;
    amplitude *= 0.5;
  }
  return value;
}

vec4 sampleText(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4(0.0);
  }
  return texture(uTextTexture, uv);
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float time = uTime * uSpeed;
  float scale = max(uWarpScale, 0.001);

  vec2 drift = vec2(time * 0.055, -time * 0.045);
  float n1 = fbm(uv * scale * 3.1 + drift);
  float n2 = fbm((uv + 19.17) * scale * 3.4 - drift.yx);
  vec2 ambient = (vec2(n1, n2) - 0.5) * uWarpStrength * 0.045 * uMotion;

  vec2 pointerDelta = uv - uPointer;
  vec2 aspectDelta = vec2(pointerDelta.x * aspect, pointerDelta.y);
  float dist = length(aspectDelta);
  float radius = max(uPointerInfluence, 0.001);
  float t = clamp(dist / radius, 0.0, 1.0);
  float lens = smoothstep(radius, 0.0, dist) * uPointerActive;
  float bulge = t * (1.0 - t) * (1.0 - t) * 6.75 * uPointerActive;
  vec2 dir = dist > 0.0001 ? vec2(aspectDelta.x / aspect, aspectDelta.y) / dist : vec2(0.0);

  float rippleWave = sin(dist * 28.0 - time * 4.2) * 0.5 + 0.5;
  float rippleRing = (rippleWave - 0.5) * uRipple;
  vec2 pointerWarp = -dir * bulge * uPointerStrength * 0.045;
  pointerWarp += dir * rippleRing * bulge * uPointerStrength * 0.016;

  vec2 displaced = uv + ambient + pointerWarp;
  vec2 splitDir = ambient + pointerWarp;
  float splitLen = length(splitDir);
  splitDir = splitLen > 0.00001 ? splitDir / splitLen : vec2(0.7071, 0.7071);
  vec2 split = splitDir * uRefraction * 0.16 * (0.35 + lens * 1.65);

  vec4 base = sampleText(displaced);
  float r = sampleText(displaced + split).r;
  float g = base.g;
  float b = sampleText(displaced - split).b;
  float a = max(max(sampleText(displaced + split).a, base.a), sampleText(displaced - split).a);

  vec3 color = vec3(r, g, b) + lens * base.a * 0.055;
  fragColor = vec4(color, a);
}
`;

const getFontValue = (value: string | number): string => (typeof value === "number" ? `${value}px` : value);

// A single rasterized character, tagged with its resolved font (see
// resolveRuns below). `fontSizePx` isn't baked in here since it can still
// shrink by the fit-to-box factor computed further down.
interface ResolvedChar {
  char: string;
  fontFamily: string;
  fontWeight: string;
}

const charFont = (fontSizePx: number, resolved: ResolvedChar): string =>
  `${resolved.fontWeight} ${fontSizePx}px ${resolved.fontFamily}`;

const measureLine = (ctx: CanvasRenderingContext2D, line: ResolvedChar[], letterSpacing: number, fontSizePx: number): number => {
  const textWidth = line.reduce((width, resolved) => {
    ctx.font = charFont(fontSizePx, resolved);
    return width + ctx.measureText(resolved.char).width;
  }, 0);
  return textWidth + Math.max(0, line.length - 1) * letterSpacing;
};

const drawLine = (
  ctx: CanvasRenderingContext2D,
  line: ResolvedChar[],
  x: number,
  y: number,
  letterSpacing: number,
  fontSizePx: number,
): void => {
  let cursor = x - measureLine(ctx, line, letterSpacing, fontSizePx) / 2;

  line.forEach((resolved, index) => {
    ctx.font = charFont(fontSizePx, resolved);
    ctx.fillText(resolved.char, cursor, y);
    cursor += ctx.measureText(resolved.char).width + (index === line.length - 1 ? 0 : letterSpacing);
  });
};

// Resolves every distinct (fontFamily, fontWeight) pair used across the
// runs via the same hidden-probe technique upstream used for its one font.
// `fontSize`/`letterSpacing`/`lineHeight` come from the first run's probe
// only — they're explicit rem/vw props, so they don't vary by font.
function resolveRuns(
  container: HTMLElement,
  runs: WarpTextRun[],
  props: RuntimeProps,
): { lines: ResolvedChar[][]; fontSizePx: number; letterSpacing: number; lineHeight: number } {
  const resolvedFonts = new Map<string, { fontFamily: string; fontWeight: string }>();
  let fontSizePx = 96;
  let letterSpacing = 0;
  let lineHeight = 0;

  runs.forEach((run, index) => {
    const fontFamily = run.fontFamily ?? props.fontFamily;
    const fontWeight = run.fontWeight ?? props.fontWeight;
    const key = `${fontFamily}__${fontWeight}`;
    if (resolvedFonts.has(key)) return;

    const probe = document.createElement("span");
    probe.textContent = run.text || "x";
    Object.assign(probe.style, {
      position: "absolute",
      visibility: "hidden",
      pointerEvents: "none",
      whiteSpace: "pre",
      inset: "0 auto auto 0",
      fontFamily,
      fontSize: getFontValue(props.fontSize),
      fontWeight: String(fontWeight),
      letterSpacing: getFontValue(props.letterSpacing),
      lineHeight: typeof props.lineHeight === "number" ? String(props.lineHeight) : props.lineHeight,
    });
    container.appendChild(probe);
    const computed = window.getComputedStyle(probe);

    if (index === 0) {
      fontSizePx = parseFloat(computed.fontSize) || 96;
      letterSpacing = computed.letterSpacing === "normal" ? 0 : parseFloat(computed.letterSpacing) || 0;
      lineHeight = parseFloat(computed.lineHeight);
      if (!Number.isFinite(lineHeight)) {
        lineHeight = fontSizePx * (typeof props.lineHeight === "number" ? props.lineHeight : 0.92);
      }
    }
    resolvedFonts.set(key, {
      fontFamily: computed.fontFamily || "sans-serif",
      fontWeight: computed.fontWeight || String(fontWeight),
    });
    probe.remove();
  });

  const lines: ResolvedChar[][] = [[]];
  runs.forEach((run) => {
    const fontFamily = run.fontFamily ?? props.fontFamily;
    const fontWeight = run.fontWeight ?? props.fontWeight;
    const resolved = resolvedFonts.get(`${fontFamily}__${fontWeight}`)!;

    run.text.split("\n").forEach((part, partIndex) => {
      if (partIndex > 0) lines.push([]);
      for (const char of Array.from(part)) {
        lines[lines.length - 1].push({ char, fontFamily: resolved.fontFamily, fontWeight: resolved.fontWeight });
      }
    });
  });

  return { lines, fontSizePx, letterSpacing, lineHeight };
}

const buildTextCanvas = ({ container, width, height, dpr, props }: BuildTextCanvasArgs): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const runs: WarpTextRun[] = typeof props.text === "string" ? [{ text: props.text }] : props.text;
  const resolved = resolveRuns(container, runs, props);
  const { lines } = resolved;
  let fontSizePx = resolved.fontSizePx;
  let letterSpacing = resolved.letterSpacing;
  let lineHeight = resolved.lineHeight;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = props.color;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const maxWidth = width * 0.86;
  const maxHeight = height * 0.78;
  const widest = Math.max(...lines.map((line) => measureLine(ctx, line, letterSpacing, fontSizePx)), 1);
  const blockHeight = Math.max(lineHeight * lines.length, 1);
  const fit = Math.min(1, maxWidth / widest, maxHeight / blockHeight);

  if (fit < 1) {
    fontSizePx *= fit;
    letterSpacing *= fit;
    lineHeight *= fit;
  }

  const startY = height / 2 - (lineHeight * (lines.length - 1)) / 2;
  lines.forEach((line, index) => drawLine(ctx, line, width / 2, startY + index * lineHeight, letterSpacing, fontSizePx));

  return canvas;
};

const syncUniforms = (program: Program, props: RuntimeProps): void => {
  const uniforms = program.uniforms;
  uniforms.uWarpStrength.value = props.warpStrength;
  uniforms.uWarpScale.value = props.warpScale;
  uniforms.uSpeed.value = props.speed;
  uniforms.uPointerInfluence.value = props.pointerInfluence;
  uniforms.uPointerStrength.value = props.pointerStrength;
  uniforms.uRefraction.value = props.refraction;
  uniforms.uRipple.value = props.ripple ? 1 : 0;
};

const WarpText = ({
  text = "Bend the moment",
  color,
  warpStrength = 0.08,
  warpScale = 1.7,
  speed = 0.55,
  pointerInfluence = 0.42,
  pointerStrength = 0.38,
  refraction = 0.018,
  ripple = true,
  fontSize = "clamp(3rem, 10vw, 9rem)",
  fontWeight = 800,
  fontFamily = "inherit",
  letterSpacing = "-0.06em",
  lineHeight = 0.9,
  className = "",
  style,
}: Props) => {
  const isDark = useIsDarkTheme();
  // Near-white in dark mode, dark indigo-slate in light mode — see the
  // file-level comment. Only kicks in when the caller doesn't pass `color`.
  const resolvedColor = color ?? (isDark ? "#fafafa" : "#1e1b4b");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef<RuntimeProps>({
    text,
    color: resolvedColor,
    fontSize,
    fontWeight,
    fontFamily,
    letterSpacing,
    lineHeight,
    warpStrength,
    warpScale,
    speed,
    pointerInfluence,
    pointerStrength,
    refraction,
    ripple,
  });
  const contextRef = useRef<RuntimeContext | null>(null);

  useEffect(() => {
    propsRef.current = {
      text,
      color: resolvedColor,
      fontSize,
      fontWeight,
      fontFamily,
      letterSpacing,
      lineHeight,
      warpStrength,
      warpScale,
      speed,
      pointerInfluence,
      pointerStrength,
      refraction,
      ripple,
    };

    if (contextRef.current) {
      syncUniforms(contextRef.current.program, propsRef.current);
      contextRef.current.rasterize();
    }
  }, [
    text,
    resolvedColor,
    fontSize,
    fontWeight,
    fontFamily,
    letterSpacing,
    lineHeight,
    warpStrength,
    warpScale,
    speed,
    pointerInfluence,
    pointerStrength,
    refraction,
    ripple,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return undefined;

    let renderer: Renderer;
    let gl: OGLRenderingContext;
    // program/geometry/mesh/texture aren't forward-declared here (unlike
    // upstream) — this project's stricter `prefer-const` lint rule flags that.
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let raf = 0;
    let disposed = false;
    let contextLost = false;
    let visible = true;
    let pageVisible = !document.hidden;
    let reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let rasterVersion = 0;

    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, activeTarget: 0 };
    const startTime = performance.now();

    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: false,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      });
      gl = renderer.gl;
    } catch (error) {
      console.warn("WarpText: WebGL could not be initialized.", error);
      return undefined;
    }

    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);

    const texture = new Texture(gl, {
      generateMipmaps: false,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      wrapS: gl.CLAMP_TO_EDGE,
      wrapT: gl.CLAMP_TO_EDGE,
    });

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTextTexture: { value: texture },
        uResolution: { value: new Float32Array([1, 1]) },
        uPointer: { value: new Float32Array([0.5, 0.5]) },
        uPointerActive: { value: 0 },
        uTime: { value: 0 },
        uWarpStrength: { value: propsRef.current.warpStrength },
        uWarpScale: { value: propsRef.current.warpScale },
        uSpeed: { value: propsRef.current.speed },
        uPointerInfluence: { value: propsRef.current.pointerInfluence },
        uPointerStrength: { value: propsRef.current.pointerStrength },
        uRefraction: { value: propsRef.current.refraction },
        uRipple: { value: propsRef.current.ripple ? 1 : 0 },
        uMotion: { value: reduceMotion ? 0 : 1 },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });

    const renderOnce = () => {
      if (disposed || contextLost) return;
      renderer.render({ scene: mesh });
    };

    const rasterize = async () => {
      const version = ++rasterVersion;
      if (document.fonts?.ready) {
        try {
          await document.fonts.ready;
        } catch {}
      }
      if (disposed || contextLost || version !== rasterVersion) return;

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const textCanvas = buildTextCanvas({
        container,
        width: rect.width,
        height: rect.height,
        dpr,
        props: propsRef.current,
      });
      texture.image = textCanvas;
      texture.needsUpdate = true;
      renderOnce();
    };

    const resize = () => {
      if (disposed || contextLost) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      renderer.dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setSize(rect.width, rect.height);
      program.uniforms.uResolution.value[0] = gl.drawingBufferWidth;
      program.uniforms.uResolution.value[1] = gl.drawingBufferHeight;
      rasterize();
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerType === "touch") return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointer.tx = (event.clientX - rect.left) / rect.width;
      pointer.ty = 1 - (event.clientY - rect.top) / rect.height;
      pointer.activeTarget = 1;
    };

    const onPointerLeave = (): void => {
      pointer.activeTarget = 0;
    };

    const onContextLost = (event: Event): void => {
      event.preventDefault();
      contextLost = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onVisibility = (): void => {
      pageVisible = !document.hidden;
      if (pageVisible && visible && !raf) raf = requestAnimationFrame(loop);
      if (!pageVisible && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const onReducedMotion = (event: MediaQueryListEvent): void => {
      reduceMotion = event.matches;
      program.uniforms.uMotion.value = reduceMotion ? 0 : 1;
      renderOnce();
    };

    const loop = (now: number): void => {
      if (disposed || contextLost) return;

      const elapsed = (now - startTime) * 0.001;
      const idleX = 0.5 + Math.sin(elapsed * 0.33) * 0.12;
      const idleY = 0.5 + Math.cos(elapsed * 0.27) * 0.1;
      const targetX = pointer.activeTarget > 0 ? pointer.tx : idleX;
      const targetY = pointer.activeTarget > 0 ? pointer.ty : idleY;
      const damping = pointer.activeTarget > 0 ? 0.12 : 0.035;

      pointer.x += (targetX - pointer.x) * damping;
      pointer.y += (targetY - pointer.y) * damping;
      pointer.active += ((pointer.activeTarget > 0 ? 1 : 0.18) - pointer.active) * 0.06;

      program.uniforms.uPointer.value[0] = pointer.x;
      program.uniforms.uPointer.value[1] = pointer.y;
      program.uniforms.uPointerActive.value = reduceMotion ? pointer.active * 0.35 : pointer.active;
      program.uniforms.uTime.value = reduceMotion ? 0 : elapsed;

      renderOnce();
      raf = requestAnimationFrame(loop);
    };

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    intersectionObserver = new IntersectionObserver(
      ([entry]: IntersectionObserverEntry[]) => {
        visible = entry.isIntersecting;
        if (visible && pageVisible && !raf) raf = requestAnimationFrame(loop);
        if (!visible && raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("webglcontextlost", onContextLost, false);
    document.addEventListener("visibilitychange", onVisibility);
    mediaQuery?.addEventListener("change", onReducedMotion);

    syncUniforms(program, propsRef.current);
    contextRef.current = { program, rasterize };
    resize();
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      contextRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      document.removeEventListener("visibilitychange", onVisibility);
      mediaQuery?.removeEventListener("change", onReducedMotion);

      if (!contextLost) {
        try {
          if (texture?.texture) gl.deleteTexture(texture.texture);
          geometry?.remove?.();
          program?.remove?.();
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {}
      }

      if (canvas.parentNode === container) container.removeChild(canvas);
    };
  }, []);

  const accessibleLabel = typeof text === "string" ? text : text.map((run) => run.text).join("");

  return (
    <div
      ref={containerRef}
      className={`warp-text ${className}`.trim()}
      style={style}
      role="img"
      aria-label={accessibleLabel}
    />
  );
};

export default WarpText;

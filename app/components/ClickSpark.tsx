"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useIsDarkTheme } from "./useIsDarkTheme";
import { useReducedMotion } from "./useReducedMotion";

// Adapted from React Bits' ClickSpark component
// (https://reactbits.dev/animations/click-spark, source: DavidHDev/react-
// bits, src/ts-default/Animations/ClickSpark). The spark math (radial burst
// of fading lines, eased outward) is reproduced as-is; the surrounding
// integration is rebuilt for "global interaction layer" rather than
// upstream's "wrap one card" use case:
//
// - Upstream sizes its canvas to its own wrapping div (via ResizeObserver)
//   and reads click coordinates relative to that div. Wrapping the *whole
//   app* in that div would mean a canvas resized to the full, ever-changing
//   document height (Generate's chat grows/shrinks constantly) — expensive
//   to keep in sync, and exactly the kind of "wrapping creates problems"
//   risk the brief calls out. Instead this renders a `position: fixed`,
//   viewport-sized canvas as a sibling of `children` (no wrapping DOM
//   element at all — see the Fragment below), so there's nothing to affect
//   stacking contexts, scrolling, or any descendant's layout.
// - Click coordinates come from a single `window`-level click listener
//   (bubble phase, never preventDefault/stopPropagation) instead of an
//   onClick on the wrapper — works identically whether the click originated
//   on Home, inside a dialog, or inside the Generate chat, and can't
//   intercept or block anything it didn't dispatch itself.
// - Keyboard-activated clicks (Enter/Space on a button) report
//   clientX/clientY as 0 in every browser tested — falls back to the
//   activated element's own center so keyboard users get a spark in a
//   sensible place instead of the viewport corner.
// - The rAF loop only runs while at least one spark is alive, and doesn't
//   start at all under prefers-reduced-motion.
interface Spark {
  x: number;
  y: number;
  angle: number;
  startTime: number;
  color: string;
}

interface ClickSparkProps {
  children?: ReactNode;
}

const SPARK_COUNT = 7;
const SPARK_SIZE = 9;
const SPARK_RADIUS = 16;
const DURATION = 400;
const LINE_WIDTH = 1.5;

// Dark mode: muted white / indigo. Light mode: muted slate / indigo — a
// literal white spark would be invisible against a light page.
const DARK_COLORS = ["rgba(244, 244, 245, 0.55)", "rgba(165, 180, 252, 0.5)"];
const LIGHT_COLORS = ["rgba(71, 85, 105, 0.45)", "rgba(99, 102, 241, 0.4)"];

function easeOutQuad(t: number): number {
  return t * (2 - t);
}

export default function ClickSpark({ children }: ClickSparkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sparksRef = useRef<Spark[]>([]);
  const isDarkRef = useRef(true);
  const reducedMotion = useReducedMotion();
  const isDark = useIsDarkTheme();

  // Written in an effect, not the render body — see the identical note in
  // SpecularButton.tsx.
  useEffect(() => {
    isDarkRef.current = isDark;
  }, [isDark]);

  useEffect(() => {
    if (reducedMotion) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 100);
    };
    window.addEventListener("resize", handleResize);

    const draw = (timestamp: number) => {
      if (sparksRef.current.length === 0) {
        raf = 0;
        return;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      sparksRef.current = sparksRef.current.filter((spark) => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= DURATION) return false;

        const progress = elapsed / DURATION;
        const eased = easeOutQuad(progress);
        const distance = eased * SPARK_RADIUS;
        const lineLength = SPARK_SIZE * (1 - eased);

        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);

        ctx.globalAlpha = 1 - progress;
        ctx.strokeStyle = spark.color;
        ctx.lineWidth = LINE_WIDTH;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        return true;
      });
      ctx.globalAlpha = 1;

      raf = sparksRef.current.length > 0 ? requestAnimationFrame(draw) : 0;
    };

    const spawnSparks = (x: number, y: number) => {
      const colors = isDarkRef.current ? DARK_COLORS : LIGHT_COLORS;
      const now = performance.now();
      const newSparks: Spark[] = Array.from({ length: SPARK_COUNT }, (_, i) => ({
        x,
        y,
        angle: (2 * Math.PI * i) / SPARK_COUNT,
        startTime: now,
        color: colors[i % colors.length],
      }));
      sparksRef.current.push(...newSparks);
      if (raf === 0) raf = requestAnimationFrame(draw);
    };

    const handleClick = (event: MouseEvent) => {
      let x = event.clientX;
      let y = event.clientY;
      if (x === 0 && y === 0 && event.target instanceof Element) {
        const rect = event.target.getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
      }
      spawnSparks(x, y);
    };
    window.addEventListener("click", handleClick);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("click", handleClick);
      clearTimeout(resizeTimeout);
      if (raf) cancelAnimationFrame(raf);
      sparksRef.current = [];
    };
  }, [reducedMotion]);

  return (
    <>
      {!reducedMotion && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[100]"
        />
      )}
      {children}
    </>
  );
}

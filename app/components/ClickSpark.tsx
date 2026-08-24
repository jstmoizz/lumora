"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useIsDarkTheme } from "./useIsDarkTheme";
import { useReducedMotion } from "./useReducedMotion";

// Adapted from React Bits' ClickSpark component
// (https://reactbits.dev/animations/click-spark). Spark math (radial burst
// of fading lines, eased outward) reproduced as-is; integration rebuilt for
// a global interaction layer rather than upstream's "wrap one card":
//
// - A `position: fixed`, viewport-sized canvas as a sibling of `children`
//   (no wrapping element — see the Fragment below), instead of upstream's
//   own-div ResizeObserver sizing, which would track the full, ever-
//   growing document height here.
// - Click coordinates come from one `window`-level click listener (bubble
//   phase, no preventDefault/stopPropagation), so it works from anywhere
//   and can't intercept clicks it didn't dispatch itself.
// - Keyboard-activated clicks (Enter/Space) report clientX/clientY as 0 —
//   falls back to the activated element's center instead of the corner.
// - The rAF loop only runs while a spark is alive, and never starts under
//   prefers-reduced-motion.
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

// Straight contrast against the page: white sparks on a dark background,
// black sparks on a light one — not a muted/tinted color, since the whole
// point is the spark reads clearly against whatever's behind it.
const DARK_COLORS = ["rgba(255, 255, 255, 0.75)", "rgba(255, 255, 255, 0.5)"];
const LIGHT_COLORS = ["rgba(0, 0, 0, 0.65)", "rgba(0, 0, 0, 0.4)"];

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

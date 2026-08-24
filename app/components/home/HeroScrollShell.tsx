"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "../useReducedMotion";

// Extra scroll distance (beyond the initial 100svh) the shrink plays out
// across. Larger = a slower, more gradual settle; smaller = a snappier one.
const SHRINK_TRAVEL = "55vh";
const SETTLED_HEIGHT = "68svh";
const SETTLED_MARGIN_INLINE = "16px";
const SETTLED_RADIUS = 28;

interface HeroScrollShellProps {
  children: ReactNode;
}

// Wraps Home's hero <section> so it opens fullscreen (100svh) and, as the
// user scrolls past it, smoothly settles into a smaller, contained, rounded
// card (~68svh) rather than just scrolling away like an ordinary section.
//
// Technique: `spacerRef` reserves extra scroll distance (100svh of initial
// viewing room + SHRINK_TRAVEL of "settle" room). The visible box is
// `position: sticky; top: 0` inside that spacer, pinned to the viewport for
// that scroll distance while its height/margin/radius animate, then normal
// flow resumes where the Feature cards section begins.
//
// `useScroll`'s `scrollYProgress` is a MotionValue, not React state, so this
// runs without re-rendering on every scroll tick.
export default function HeroScrollShell({ children }: HeroScrollShellProps) {
  const reducedMotion = useReducedMotion();
  const spacerRef = useRef<HTMLDivElement>(null);

  // Rules of Hooks means this runs even on the reduced-motion early return
  // below, which never renders the spacer div `spacerRef` points at — an
  // unconditional `target: spacerRef` would leave the ref permanently
  // un-hydrated, which motion/react treats as an error. Only wire up the
  // target when the branch that renders it will actually run.
  const { scrollYProgress } = useScroll(
    reducedMotion ? undefined : { target: spacerRef, offset: ["start start", "end start"] },
  );

  const height = useTransform(scrollYProgress, [0, 1], ["100svh", SETTLED_HEIGHT]);
  const marginInline = useTransform(scrollYProgress, [0, 1], ["0px", SETTLED_MARGIN_INLINE]);
  const borderRadius = useTransform(scrollYProgress, [0, 1], [0, SETTLED_RADIUS]);
  // Subtle, per the brief — not a dramatic zoom, just enough to read as
  // the content "settling" along with its container.
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.97]);

  // Reduced motion: skip the scroll-linked journey and render the settled,
  // contained state directly — no "static fullscreen" middle ground for a
  // continuously scroll-tied effect like this.
  if (reducedMotion) {
    return (
      <div
        className="overflow-hidden"
        style={{
          height: SETTLED_HEIGHT,
          marginInline: SETTLED_MARGIN_INLINE,
          borderRadius: SETTLED_RADIUS,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={spacerRef}
      className="bg-background"
      style={{ height: `calc(100svh + ${SHRINK_TRAVEL})` }}
    >
      <motion.div
        className="sticky top-0 overflow-hidden bg-background"
        style={{ height, marginInline, borderRadius }}
      >
        <motion.div className="h-full" style={{ scale }}>
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}

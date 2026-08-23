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
// user scrolls past it, smoothly settles into a smaller, contained,
// rounded card (~68svh) rather than just scrolling away like an ordinary
// section.
//
// The technique: `spacerRef` reserves extra scroll distance (100svh of
// initial viewing room + SHRINK_TRAVEL of "settle" room) that the rest of
// this component's animation plays out across. The actual visible box is
// `position: sticky; top: 0` inside that spacer, so it stays pinned to the
// top of the viewport for exactly that scroll distance while its own
// height/margin/radius animate — then normal document flow resumes the
// instant the spacer's reserved height is exhausted, exactly where the
// Feature cards section begins.
//
// `useScroll`'s `scrollYProgress` is a MotionValue, not React state — it
// updates outside React's render cycle, so this whole animation runs
// without re-rendering the component on every scroll tick (motion/react's
// standard scroll-linked-value pattern, not a custom scroll listener).
export default function HeroScrollShell({ children }: HeroScrollShellProps) {
  const reducedMotion = useReducedMotion();
  const spacerRef = useRef<HTMLDivElement>(null);

  // Rules of Hooks means this runs even on the reduced-motion early return
  // below, which never renders the spacer div `spacerRef` points at —
  // passing `target: spacerRef` unconditionally in that case left the ref
  // permanently un-hydrated, which motion/react treats as an error. Only
  // wire up the target when the scroll-linked branch below will actually
  // render it; the resulting scrollYProgress goes unused either way when
  // reducedMotion is true, exactly like `height`/`marginInline`/etc. below.
  const { scrollYProgress } = useScroll(
    reducedMotion ? undefined : { target: spacerRef, offset: ["start start", "end start"] },
  );

  const height = useTransform(scrollYProgress, [0, 1], ["100svh", SETTLED_HEIGHT]);
  const marginInline = useTransform(scrollYProgress, [0, 1], ["0px", SETTLED_MARGIN_INLINE]);
  const borderRadius = useTransform(scrollYProgress, [0, 1], [0, SETTLED_RADIUS]);
  // Subtle, per the brief — not a dramatic zoom, just enough to read as
  // the content "settling" along with its container.
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.97]);

  // Reduced motion: skip the scroll-linked journey entirely and render the
  // settled, contained state directly. This is exactly the kind of
  // continuously scroll-tied visual effect prefers-reduced-motion exists
  // to suppress, so there's no "static fullscreen" middle ground here —
  // just the calm resting state, immediately.
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

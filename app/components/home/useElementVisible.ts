"use client";

import { useEffect, useState, type RefObject } from "react";

// Drives the shader Canvas's `frameloop` prop alongside useTabVisible: the
// hero is only pinned on-screen (via HeroScrollShell's `position: sticky`)
// for a bounded scroll range — once the user scrolls past it, it leaves the
// viewport like any other section, but nothing was previously telling the
// Canvas to stop rendering, so it kept paying for a WebGL frame every tick
// the tab was open no matter how far away the hero had scrolled. That's the
// main cost behind "scrolling feels heavy" — this closes the gap.
//
// Starts `true` (the hero is what's on screen on first paint) and lets the
// observer correct it once it has something to measure.
export function useElementVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return visible;
}

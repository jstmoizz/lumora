"use client";

import { useEffect, useState, type RefObject } from "react";

// Drives the shader Canvas's `frameloop` prop alongside useTabVisible: once
// the hero scrolls out of HeroScrollShell's pinned range, there's no reason
// to keep paying for a WebGL frame every tick. See ShaderScene.tsx.
//
// Starts `true` (the hero is on screen on first paint); the observer
// corrects it once it has something to measure.
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

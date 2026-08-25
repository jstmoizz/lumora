// Distinguishes a real drag from a plain click during a single pointer
// gesture on a KnowledgeNode. R3F's pointerdown/pointerup don't tell them
// apart on their own — without this, a click-to-select could misfire as a
// zero-distance "drag" (committing a no-op manual position and skipping
// selection), or a real drag could still fire selection on release. Kept as
// a plain, framework-free function so it's testable without any R3F/WebGL
// scaffolding — see this directory's own test file.
export const DRAG_THRESHOLD_PX = 6;

export function isDragGesture(
  start: { x: number; y: number },
  end: { x: number; y: number },
  thresholdPx: number = DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) > thresholdPx;
}

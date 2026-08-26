// Distinguishes a real drag from a plain click on a KnowledgeNode. Kept
// framework-free so it's testable without any R3F/WebGL scaffolding.
export const DRAG_THRESHOLD_PX = 6;

export function isDragGesture(
  start: { x: number; y: number },
  end: { x: number; y: number },
  thresholdPx: number = DRAG_THRESHOLD_PX,
): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) > thresholdPx;
}

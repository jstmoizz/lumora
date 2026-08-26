/**
 * The pure decision behind CameraRig's fly-to animation: given the relevant
 * inputs before and after a render, should a new camera transition start?
 *
 * Pulled out of CameraRig.tsx (a React Three Fiber component, awkward to
 * unit-test in isolation since it needs a live Canvas/useThree context) so
 * the actual decision — not the R3F wiring around it — has direct,
 * deterministic test coverage.
 *
 * `structuralMaxRadius` must come from the graph's automatically computed
 * layout only (`maxLayoutRadius(baseLayout)` in graphLayout.ts/Scene.tsx),
 * never from a layout that includes manually dragged positions. That's what
 * keeps "the user repositioned an existing node" from ever looking like "the
 * graph itself changed" here, no matter how far a node is dragged or
 * whether it was already the graph's outermost node.
 */
export interface CameraTransitionInputs {
  selectedNodeId: string | null;
  structuralMaxRadius: number;
}

export function shouldStartCameraTransition(
  previous: CameraTransitionInputs,
  next: CameraTransitionInputs,
): boolean {
  return (
    previous.selectedNodeId !== next.selectedNodeId ||
    previous.structuralMaxRadius !== next.structuralMaxRadius
  );
}

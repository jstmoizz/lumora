/**
 * The pure decision behind CameraRig's fly-to animation, pulled out of the
 * R3F component so it's directly unit-testable.
 *
 * `structuralMaxRadius` must come from the automatic layout only, never one
 * that includes manual drags — otherwise repositioning a node would look
 * like the graph itself changed.
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

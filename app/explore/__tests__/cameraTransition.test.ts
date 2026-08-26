import { describe, expect, test } from "vitest";
import { shouldStartCameraTransition, type CameraTransitionInputs } from "../cameraTransition";

function inputs(
  selectedNodeId: string | null,
  structuralMaxRadius: number,
): CameraTransitionInputs {
  return { selectedNodeId, structuralMaxRadius };
}

describe("shouldStartCameraTransition", () => {
  test("does not re-arm for an ordinary node drag", () => {
    const before = inputs(null, 10);
    const after = inputs(null, 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  test("does not re-arm when the current outermost node is dragged", () => {
    const before = inputs(null, 10);
    const afterCloser = inputs(null, 10);
    const afterFarther = inputs(null, 10);
    expect(shouldStartCameraTransition(before, afterCloser)).toBe(false);
    expect(shouldStartCameraTransition(before, afterFarther)).toBe(false);
  });

  // Dragging a node beyond the current extent must not touch
  // structuralMaxRadius, which only comes from the automatic layout.
  test("does not re-arm when a node is dragged beyond the current extent", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  test("does not re-arm when the selected node itself is dragged", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  test("does not re-arm when a different node is dragged while one is selected", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  test("re-arms when the selected node id changes", () => {
    const before = inputs(null, 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(true);
  });

  test("re-arms when selection moves from one node to another", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-b", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(true);
  });

  test("re-arms when the selection is cleared", () => {
    const before = inputs("node-a", 10);
    const after = inputs(null, 10);
    expect(shouldStartCameraTransition(before, after)).toBe(true);
  });

  test("re-arms when the structural extent changes", () => {
    const before = inputs(null, 10);
    const after = inputs(null, 14);
    expect(shouldStartCameraTransition(before, after)).toBe(true);
  });

  test("re-arms when both selection and structural extent change together", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-b", 14);
    expect(shouldStartCameraTransition(before, after)).toBe(true);
  });
});

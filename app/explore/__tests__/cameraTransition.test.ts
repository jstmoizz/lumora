import { describe, expect, test } from "vitest";
import { shouldStartCameraTransition, type CameraTransitionInputs } from "../cameraTransition";

function inputs(
  selectedNodeId: string | null,
  structuralMaxRadius: number,
): CameraTransitionInputs {
  return { selectedNodeId, structuralMaxRadius };
}

describe("shouldStartCameraTransition", () => {
  // Test 1 — ordinary drag: a node moves, but it's not (and doesn't become)
  // the graph's outermost node, so `structuralMaxRadius` (derived from the
  // automatic layout only) is untouched either way.
  test("does not re-arm for an ordinary node drag", () => {
    const before = inputs(null, 10);
    const after = inputs(null, 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  // Test 2 — dragging the current outermost node (closer or farther) never
  // changes `structuralMaxRadius`, since that value only ever comes from the
  // automatically computed layout, never from manual overrides.
  test("does not re-arm when the current outermost node is dragged", () => {
    const before = inputs(null, 10);
    const afterCloser = inputs(null, 10);
    const afterFarther = inputs(null, 10);
    expect(shouldStartCameraTransition(before, afterCloser)).toBe(false);
    expect(shouldStartCameraTransition(before, afterFarther)).toBe(false);
  });

  // Test 3 — dragging a previously-closer node out beyond the graph's
  // current visual extent still leaves the *structural* radius alone — this
  // is the exact scenario that reproduced the original bug.
  test("does not re-arm when a node is dragged beyond the current extent", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  // Test 4 — dragging the currently-selected node must not retrigger its own
  // focus animation: selectedNodeId is unchanged, and a drag alone can't
  // change structuralMaxRadius.
  test("does not re-arm when the selected node itself is dragged", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  // Test 5 — dragging some other node while a different node is selected
  // must leave the camera alone.
  test("does not re-arm when a different node is dragged while one is selected", () => {
    const before = inputs("node-a", 10);
    const after = inputs("node-a", 10);
    expect(shouldStartCameraTransition(before, after)).toBe(false);
  });

  // Test 6 — a normal click/selection change must still re-arm.
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

  // Test 7 — clearing the selection (back to overview) must still re-arm.
  test("re-arms when the selection is cleared", () => {
    const before = inputs("node-a", 10);
    const after = inputs(null, 10);
    expect(shouldStartCameraTransition(before, after)).toBe(true);
  });

  // A genuine structural change (a topic studied or deleted, changing the
  // automatically computed layout's own extent) must still re-arm.
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

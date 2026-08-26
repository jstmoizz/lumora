"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { shouldStartCameraTransition, type CameraTransitionInputs } from "../cameraTransition";

// `state.controls` is typed generically; drei's OrbitControls (via
// `makeDefault`) sets it to itself, which has `target`/`update` and
// (as a real EventDispatcher) `addEventListener` — used below to detect
// the user grabbing the camera.
interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

// How close position/target need to get before this rig hands control back
// to OrbitControls — "arrived," not an exact match an exponential lerp
// never quite reaches.
const SETTLE_EPSILON = 0.01;

// Lumora (the origin) is always what "overview" looks at; only the camera's
// distance changes with the graph's extent (see Scene.tsx's overviewPosition).
const OVERVIEW_TARGET = new Vector3(0, 0, 0);
// How far the camera leans toward a selected node and zooms in — kept small
// so selection reads as a nudge, not a fly-through.
const FOCUS_NUDGE = 0.18;
const FOCUS_ZOOM = 0.97;
// The camera target only travels this fraction of the way from Lumora to
// the selected node, so Lumora stays near frame center.
const TARGET_FOCUS = 0.55;
// TopicPanel is a right-side card above this width and a bottom sheet
// below it; the composition leans away from whichever side it occupies.
const DESKTOP_PANEL_BREAKPOINT_PX = 640;
const PANEL_BIAS_HORIZONTAL = 0.85;
const PANEL_BIAS_VERTICAL = 0.55;
// Exponential smoothing rate, tuned to settle in roughly 600-900ms.
const LERP_SPEED = 3.2;

interface CameraRigProps {
  selectedNodeId: string | null;
  // Every focusable id's absolute 3D position.
  focusPositions: Record<string, [number, number, number]>;
  // Where "back to overview" returns to — sized to the graph's extent by
  // Scene.tsx.
  overviewPosition: [number, number, number];
  // Re-arm signal only, never used for framing. Derived from the graph's
  // automatic layout, excluding manual drags, so repositioning a node can
  // never restart the fly-to no matter how far it moves.
  structuralMaxRadius: number;
}

export default function CameraRig({
  selectedNodeId,
  focusPositions,
  overviewPosition,
  structuralMaxRadius,
}: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsLike | null;

  // Seeded straight from `overviewPosition` rather than another ref, since
  // reading a ref during render trips react-hooks/refs.
  const overviewPositionVec = useRef(new Vector3(...overviewPosition));
  const overviewDistance = useRef(new Vector3(...overviewPosition).length());
  const desiredPosition = useRef(new Vector3(...overviewPosition));
  const desiredTarget = useRef(new Vector3().copy(OVERVIEW_TARGET));
  const scratchNode = useRef(new Vector3());
  const scratchDir = useRef(new Vector3());
  const scratchRight = useRef(new Vector3());
  const selectedPositionRef = useRef<[number, number, number] | undefined>(undefined);
  // Last (selectedNodeId, structuralMaxRadius) this effect reacted to, fed
  // through shouldStartCameraTransition so the decision is unit-tested
  // independently of this R3F wiring.
  const lastTransitionInputs = useRef<CameraTransitionInputs>({
    selectedNodeId,
    structuralMaxRadius,
  });

  // True only while flying to a target, so OrbitControls fully owns the
  // camera the rest of the time.
  const isAnimating = useRef(false);

  useEffect(() => {
    // Kept fresh even while idle, so a later fly-to targets the node's
    // current position, not a stale one.
    selectedPositionRef.current = selectedNodeId ? focusPositions[selectedNodeId] : undefined;

    // Re-arms only on a real selection or structural change — not on
    // `focusPositions` itself, which gets a new reference on every drag.
    // A drag still updates selectedPositionRef above without touching
    // isAnimating, so a dragged selected node isn't chased mid-drag but the
    // next real change still flies to its current position.
    const next: CameraTransitionInputs = { selectedNodeId, structuralMaxRadius };
    if (shouldStartCameraTransition(lastTransitionInputs.current, next)) {
      isAnimating.current = true;
    }
    lastTransitionInputs.current = next;
  }, [selectedNodeId, structuralMaxRadius, focusPositions]);

  // Keeps framing in sync with manual drags without ever re-arming the
  // fly-to itself (see the effect above for that).
  useEffect(() => {
    overviewPositionVec.current.set(...overviewPosition);
    overviewDistance.current = overviewPositionVec.current.length();
  }, [overviewPosition]);

  // The moment the user grabs the camera, their input wins immediately
  // instead of fighting whatever fly-to was in progress.
  useEffect(() => {
    if (!controls) return;
    const handleStart = () => {
      isAnimating.current = false;
    };
    controls.addEventListener("start", handleStart);
    return () => controls.removeEventListener("start", handleStart);
  }, [controls]);

  useFrame((_, delta) => {
    if (!controls || !isAnimating.current) return;

    const selectedPosition = selectedPositionRef.current;

    // Scene.tsx's fov is vertical; on a portrait canvas the horizontal fov
    // is narrower, so pull back further by the same factor a horizontal
    // fit would need.
    const perspectiveCamera = camera as unknown as { aspect?: number };
    const aspectScale =
      typeof perspectiveCamera.aspect === "number" && perspectiveCamera.aspect < 1
        ? // Capped so an extremely narrow window doesn't exceed OrbitControls' own maxDistance.
          Math.min(1.8, 1 / perspectiveCamera.aspect)
        : 1;
    const fittedDistance = overviewDistance.current * aspectScale;

    if (selectedPosition) {
      const [x, y, z] = selectedPosition;
      scratchNode.current.set(x, y, z);

      desiredTarget.current
        .copy(OVERVIEW_TARGET)
        .lerp(scratchNode.current, TARGET_FOCUS);

      // Lean away from whichever side TopicPanel occupies: right on
      // desktop, below on mobile (bottom sheet).
      if (typeof window !== "undefined" && window.innerWidth >= DESKTOP_PANEL_BREAKPOINT_PX) {
        scratchRight.current.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        desiredTarget.current.addScaledVector(scratchRight.current, PANEL_BIAS_HORIZONTAL);
      } else {
        desiredTarget.current.y -= PANEL_BIAS_VERTICAL;
      }

      scratchDir.current
        .copy(scratchNode.current)
        .normalize()
        .multiplyScalar(fittedDistance);
      desiredPosition.current
        .copy(overviewPositionVec.current)
        .multiplyScalar(aspectScale)
        .lerp(scratchDir.current, FOCUS_NUDGE)
        .multiplyScalar(FOCUS_ZOOM);
    } else {
      desiredTarget.current.copy(OVERVIEW_TARGET);
      desiredPosition.current.copy(overviewPositionVec.current).multiplyScalar(aspectScale);
    }

    const t = 1 - Math.exp(-LERP_SPEED * delta);
    camera.position.lerp(desiredPosition.current, t);
    controls.target.lerp(desiredTarget.current, t);
    controls.update();

    // Arrived — stop driving the camera so OrbitControls' own drag/zoom
    // fully owns it until the next transition.
    if (
      camera.position.distanceTo(desiredPosition.current) < SETTLE_EPSILON &&
      controls.target.distanceTo(desiredTarget.current) < SETTLE_EPSILON
    ) {
      isAnimating.current = false;
    }
  });

  return null;
}

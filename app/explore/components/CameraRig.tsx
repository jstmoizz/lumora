"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

// `state.controls` is typed generically (`THREE.EventDispatcher | null`) so
// it can hold any controls implementation; drei's OrbitControls (with
// `makeDefault`) sets it to itself, which does have `target`/`update`, and
// (being a real three.js EventDispatcher) `addEventListener`/
// `removeEventListener` — used below to detect the user grabbing the camera.
interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

// How close position/target need to get to their targets before this rig
// stops driving the camera and hands full control to OrbitControls — close
// enough to read as "arrived," not an exact match (which an exponential
// lerp never quite reaches).
const SETTLE_EPSILON = 0.01;

// Lumora (the origin) is always what "overview" looks at — only how far back
// the camera sits changes, based on how big the graph actually is (see
// Scene.tsx's `overviewPosition`, computed from the graph's extent so a
// small graph isn't dwarfed by empty space and a big one isn't cropped).
const OVERVIEW_TARGET = new Vector3(0, 0, 0);
// How far the camera leans toward the selected node's direction, and how
// much closer it moves — both kept deliberately small, so a selection reads
// as a gentle nudge, never a fly-through that isolates one node from the
// rest of the space.
const FOCUS_NUDGE = 0.18;
const FOCUS_ZOOM = 0.97;
// The camera *target* only travels this fraction of the way from Lumora
// (the origin) to the selected node — focusTarget = lerp(lumora, node,
// TARGET_FOCUS) — rather than landing fully on it, so Lumora stays close to
// frame center instead of being panned out of view.
const TARGET_FOCUS = 0.55;
// TopicPanel sits as a right-side card above this width (matches its own
// `sm:` breakpoint in TopicPanel.tsx) and as a bottom sheet below it. The
// composition leans away from whichever side the panel occupies so it
// doesn't cover the selected node or Lumora.
const DESKTOP_PANEL_BREAKPOINT_PX = 640;
const PANEL_BIAS_HORIZONTAL = 0.85;
const PANEL_BIAS_VERTICAL = 0.55;
// Exponential smoothing rate, tuned so the camera settles in roughly 600-900ms.
const LERP_SPEED = 3.2;

interface CameraRigProps {
  selectedNodeId: string | null;
  // Every focusable id's absolute 3D position. A plain position lookup
  // rather than typed node objects, since this rig only ever needs a
  // place to look at, not anything else about what's selected.
  focusPositions: Record<string, [number, number, number]>;
  // Where "back to overview" returns to — computed by Scene.tsx from the
  // graph's own extent, not a fixed constant, so the framing fits whatever
  // is actually there instead of overlapping a wide graph or leaving a
  // sparse one adrift in empty space.
  overviewPosition: [number, number, number];
}

export default function CameraRig({
  selectedNodeId,
  focusPositions,
  overviewPosition,
}: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsLike | null;

  // Each ref computes its own initial value straight from `overviewPosition`
  // rather than another ref's `.current` — reading a ref during render (even
  // just to seed a second one) trips `react-hooks/refs`.
  const overviewPositionVec = useRef(new Vector3(...overviewPosition));
  const overviewDistance = useRef(new Vector3(...overviewPosition).length());
  const desiredPosition = useRef(new Vector3(...overviewPosition));
  const desiredTarget = useRef(new Vector3().copy(OVERVIEW_TARGET));
  const scratchNode = useRef(new Vector3());
  const scratchDir = useRef(new Vector3());
  const scratchRight = useRef(new Vector3());
  const selectedPositionRef = useRef<[number, number, number] | undefined>(undefined);
  // The last `selectedNodeId` this effect actually reacted to — distinct
  // from reading `selectedNodeId` directly in the dependency array, since
  // that alone can't tell "the selection changed" apart from "the same
  // selected node's own position changed" once both are effect deps.
  const lastSelectedNodeId = useRef<string | null>(null);

  // True only while actively flying the camera to a target; false the rest
  // of the time so OrbitControls' drag/zoom fully owns the camera and
  // free-look actually sticks. Starts false — the Canvas's initial camera
  // prop already places it at the overview position.
  const isAnimating = useRef(false);

  useEffect(() => {
    // Always kept fresh — including while nothing is animating — so that
    // *if* a fly-to does start later (a genuine selection change), it flies
    // to wherever the selected node actually is right now, not a stale
    // pre-drag position.
    selectedPositionRef.current = selectedNodeId ? focusPositions[selectedNodeId] : undefined;

    // Only re-arms the fly-to when the *selected node itself* changes —
    // deliberately not a dependency on `focusPositions`' own value: that
    // record gets a new reference on every layout change, including every
    // single node drag (see Scene.tsx), and dragging any node — selected or
    // not — must never restart the camera's fly-to animation (that's what
    // reads as "the camera reset"). A drag committing does update
    // `selectedPositionRef.current` above, just without touching
    // `isAnimating` — so the camera doesn't chase a dragged, currently-
    // selected node around, but the *next* real selection change still
    // flies to its up-to-date position.
    if (selectedNodeId !== lastSelectedNodeId.current) {
      lastSelectedNodeId.current = selectedNodeId;
      isAnimating.current = true;
    }
  }, [selectedNodeId, focusPositions]);

  // Recomputed whenever the graph's extent changes (a topic studied or
  // deleted), not just on mount — growing the graph should pull the overview
  // back to fit the new content next time nothing's selected.
  useEffect(() => {
    overviewPositionVec.current.set(...overviewPosition);
    overviewDistance.current = overviewPositionVec.current.length();
    isAnimating.current = true;
  }, [overviewPosition]);

  // The moment the user actually grabs the camera (drag to orbit, wheel to
  // zoom), their input wins immediately rather than finishing whatever
  // fly-to transition was in progress — cutting a transition short here
  // reads as "my drag took over," not as a fight.
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

    // Sized to fit the graph vertically (Scene.tsx's fov is vertical). On a
    // portrait canvas (aspect < 1) the horizontal fov is narrower, so a
    // graph that fits top-to-bottom can still clip left/right — pull back
    // further by the same factor a horizontal fit would need.
    const perspectiveCamera = camera as unknown as { aspect?: number };
    const aspectScale =
      typeof perspectiveCamera.aspect === "number" && perspectiveCamera.aspect < 1
        ? // Capped — an extremely tall/narrow window would otherwise pull the
          // camera back further than OrbitControls' own maxDistance allows.
          Math.min(1.8, 1 / perspectiveCamera.aspect)
        : 1;
    const fittedDistance = overviewDistance.current * aspectScale;

    if (selectedPosition) {
      const [x, y, z] = selectedPosition;
      scratchNode.current.set(x, y, z);

      desiredTarget.current
        .copy(OVERVIEW_TARGET)
        .lerp(scratchNode.current, TARGET_FOCUS);

      // Lean the composition away from whichever side TopicPanel occupies.
      // Desktop: aim slightly right of the subject (camera's own local
      // right) to push the panel left. Mobile: aim slightly below to push
      // it upward, since the panel is a bottom sheet.
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

    // Arrived — stop driving the camera every frame so OrbitControls' own
    // drag/zoom fully owns it from here (free-look actually sticks) until
    // the next selection or overview change starts a new transition.
    if (
      camera.position.distanceTo(desiredPosition.current) < SETTLE_EPSILON &&
      controls.target.distanceTo(desiredTarget.current) < SETTLE_EPSILON
    ) {
      isAnimating.current = false;
    }
  });

  return null;
}

"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { KnowledgeNode } from "../data";

// `state.controls` is typed generically (`THREE.EventDispatcher | null`) so
// it can hold any controls implementation; drei's OrbitControls (with
// `makeDefault`) sets it to itself, which does have `target`/`update`.
interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
}

// Must match Scene.tsx's initial `camera` prop — this is where "back to
// overview" returns to.
const OVERVIEW_POSITION = new Vector3(0, 1.6, 8.6);
const OVERVIEW_TARGET = new Vector3(0, 0, 0);
const OVERVIEW_DISTANCE = OVERVIEW_POSITION.length();
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
  nodes: KnowledgeNode[];
}

export default function CameraRig({ selectedNodeId, nodes }: CameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as OrbitControlsLike | null;

  const desiredPosition = useRef(new Vector3().copy(OVERVIEW_POSITION));
  const desiredTarget = useRef(new Vector3().copy(OVERVIEW_TARGET));
  const scratchNode = useRef(new Vector3());
  const scratchDir = useRef(new Vector3());
  const scratchRight = useRef(new Vector3());
  const selectedNodeRef = useRef<KnowledgeNode | undefined>(undefined);

  useEffect(() => {
    selectedNodeRef.current = selectedNodeId
      ? nodes.find((node) => node.id === selectedNodeId)
      : undefined;
  }, [selectedNodeId, nodes]);

  useFrame((_, delta) => {
    if (!controls) return;

    const selectedNode = selectedNodeRef.current;

    if (selectedNode) {
      const [x, y, z] = selectedNode.position;
      scratchNode.current.set(x, y, z);

      desiredTarget.current
        .copy(OVERVIEW_TARGET)
        .lerp(scratchNode.current, TARGET_FOCUS);

      // Lean the composition away from whichever side TopicPanel occupies,
      // so it doesn't end up covering the node it's describing. Desktop:
      // panel is a right-side card, so aim slightly right of the subject
      // (camera's own local right, since OrbitControls lets the user orbit
      // freely) to push it left, toward the open side. Mobile: panel is a
      // bottom sheet, so aim slightly below the subject to push it upward.
      if (typeof window !== "undefined" && window.innerWidth >= DESKTOP_PANEL_BREAKPOINT_PX) {
        scratchRight.current.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        desiredTarget.current.addScaledVector(scratchRight.current, PANEL_BIAS_HORIZONTAL);
      } else {
        desiredTarget.current.y -= PANEL_BIAS_VERTICAL;
      }

      scratchDir.current
        .copy(scratchNode.current)
        .normalize()
        .multiplyScalar(OVERVIEW_DISTANCE);
      desiredPosition.current
        .copy(OVERVIEW_POSITION)
        .lerp(scratchDir.current, FOCUS_NUDGE)
        .multiplyScalar(FOCUS_ZOOM);
    } else {
      desiredTarget.current.copy(OVERVIEW_TARGET);
      desiredPosition.current.copy(OVERVIEW_POSITION);
    }

    const t = 1 - Math.exp(-LERP_SPEED * delta);
    camera.position.lerp(desiredPosition.current, t);
    controls.target.lerp(desiredTarget.current, t);
    controls.update();
  });

  return null;
}

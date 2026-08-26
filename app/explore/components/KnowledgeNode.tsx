"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, Plane, Vector3, type Group, type Mesh } from "three";
import { NODE_ACCENTS, type AccentId, type KnowledgeGraphNode } from "../data";
import { isDragGesture } from "../dragGesture";
import { computeFloatOffset } from "../floatMotion";
import type { LivePositions } from "./KnowledgeGraph";
import Glow from "./Glow";

// The subset of drei's OrbitControls we actually touch — mirrors
// CameraRig.tsx's own narrow typing of the same generic `state.controls`.
interface OrbitControlsLike {
  enabled: boolean;
}

// Module-level so mutating `controls` (an imperative instance, not React
// state) doesn't trip react-hooks/immutability.
function setControlsEnabled(controls: OrbitControlsLike | null, enabled: boolean): void {
  if (controls) controls.enabled = enabled;
}

interface KnowledgeNodeProps {
  node: KnowledgeGraphNode;
  position: [number, number, number];
  // 0 = top-level, 1+ = nested — drives the icosahedron/octahedron shape
  // and size pairing below.
  depth: number;
  accent: AccentId;
  isSelected: boolean;
  // Parent/child of the selection, or named in its relatedLabels — stays
  // visible and a touch more prominent than unrelated nodes.
  isRelated: boolean;
  isDimmed: boolean;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
  // Fires once on release after a real drag, never per pointer-move.
  onDragEnd: (id: string, position: [number, number, number]) => void;
  // Shared live position per node, written every frame here and read by
  // Connections so edges track drags/floating without React state.
  livePositions: LivePositions;
}

// Scale multiplier on top of the depth's geometry radius, so hover/selection
// read the same way regardless of depth.
const BASE_SCALE = 1;
const HOVER_SCALE = 1.15;
const SELECTED_SCALE = 1.3;
const SCALE_LERP = 0.15;

// Fast enough that dragging still feels immediate, slow enough to smooth
// out raw pointermove jitter.
const DRAG_LERP = 0.45;
// How quickly idle floating fades back in after a drag.
const FLOAT_BLEND_LERP = 0.06;

// Top-level topics get the rounder icosahedron; nested topics the sharper
// octahedron. Kept small — a star-point, not a UI sphere.
const CORE_RADIUS = 0.34;
const SECONDARY_RADIUS = 0.24;

// `position` is the node's logical/manual layout position; the group is
// then driven imperatively each frame on top of it (idle float, or the
// drag target) so only scale/rotation touch the inner mesh.
export default function KnowledgeNode({
  node,
  position,
  depth,
  accent,
  isSelected,
  isRelated,
  isDimmed,
  onSelect,
  onDragEnd,
  livePositions,
}: KnowledgeNodeProps) {
  const meshRef = useRef<Mesh>(null);
  // Driven imperatively per frame (float/drag), so neither ever triggers a
  // React re-render.
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const currentScale = useRef(BASE_SCALE);

  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsLike | null;

  // Gesture-scoped refs — nothing here needs a re-render until the drag ends.
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragPlane = useRef(new Plane());
  const dragPoint = useRef(new Vector3());
  // The pointer's current raycast target; useFrame eases the group toward
  // it each frame. Click-vs-drag detection uses raw pointer distance
  // instead, so it's unaffected by this easing.
  const dragTarget = useRef(new Vector3());
  const controlsWereEnabled = useRef(true);
  // Fades floating out during a drag and back in afterward instead of
  // snapping.
  const floatBlend = useRef(0);
  // Set the instant a drag commits, cleared once the `position` prop
  // catches up — bridges the gap so a frame doesn't recompute from the
  // still-stale prop and snap the node back.
  const awaitingPositionSync = useRef(false);

  useEffect(() => {
    awaitingPositionSync.current = false;
  }, [position]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    // Otherwise the browser starts a text-selection gesture on the same
    // mousedown-and-drag.
    event.nativeEvent.preventDefault();
    pointerDownAt.current = { x: event.clientX, y: event.clientY };
    isDragging.current = false;

    // A plane through the node facing the camera — a 2D pointer coordinate
    // alone has no unique 3D point to drag along.
    const worldPosition = new Vector3();
    groupRef.current?.getWorldPosition(worldPosition);
    const normal = new Vector3();
    camera.getWorldDirection(normal);
    dragPlane.current.setFromNormalAndCoplanarPoint(normal, worldPosition);

    // Disabled from pointerdown, not once a drag is confirmed — otherwise
    // OrbitControls (listening on the same canvas) starts orbiting first.
    if (controls) controlsWereEnabled.current = controls.enabled;
    setControlsEnabled(controls, false);
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    const start = pointerDownAt.current;
    if (!start) return;

    if (!isDragging.current) {
      if (!isDragGesture(start, { x: event.clientX, y: event.clientY })) return;
      isDragging.current = true;
    }

    event.stopPropagation();
    const group = groupRef.current;
    if (!group || !event.ray.intersectPlane(dragPlane.current, dragPoint.current)) return;

    // Convert back into the parent group's local space (graphLayout.ts's
    // coordinate space) before storing. useFrame does the actual moving.
    const local = group.parent ? group.parent.worldToLocal(dragPoint.current.clone()) : dragPoint.current;
    dragTarget.current.set(local.x, local.y, local.z);
  }

  // Shared cleanup for a normal release or an aborted gesture (pointercancel)
  // — always restores OrbitControls. Returns whether a gesture was in progress.
  function resetGesture(): boolean {
    const hadPointerDown = pointerDownAt.current !== null;
    pointerDownAt.current = null;
    isDragging.current = false;
    setControlsEnabled(controls, controlsWereEnabled.current);
    return hadPointerDown;
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    const wasDragging = isDragging.current;
    if (!resetGesture()) return;

    event.stopPropagation();
    if (wasDragging) {
      const group = groupRef.current;
      if (group) {
        // Snap exactly to the raycast target rather than wherever the
        // per-frame easing had gotten to, so the drop matches what's on screen.
        group.position.copy(dragTarget.current);
        floatBlend.current = 0;
        awaitingPositionSync.current = true;
        onDragEnd(node.id, [group.position.x, group.position.y, group.position.z]);
      }
    } else {
      onSelect(node.id);
    }
  }

  // A cancelled gesture is neither a click nor a completed drag.
  function handlePointerCancel() {
    resetGesture();
  }

  useFrame((state) => {
    const mesh = meshRef.current;
    const group = groupRef.current;
    if (!mesh || !group) return;

    const targetScale = isSelected ? SELECTED_SCALE : hovered ? HOVER_SCALE : BASE_SCALE;
    currentScale.current = MathUtils.lerp(currentScale.current, targetScale, SCALE_LERP);
    mesh.scale.setScalar(currentScale.current);
    mesh.rotation.y += 0.001;

    if (isDragging.current) {
      group.position.lerp(dragTarget.current, DRAG_LERP);
      floatBlend.current = 0;
    } else if (awaitingPositionSync.current) {
      // Hold the dropped position until `position` catches up (see the ref above).
    } else {
      floatBlend.current = MathUtils.lerp(floatBlend.current, 1, FLOAT_BLEND_LERP);
      const [fx, fy, fz] = computeFloatOffset(node.id, state.clock.elapsedTime, false);
      group.position.set(
        position[0] + fx * floatBlend.current,
        position[1] + fy * floatBlend.current,
        position[2] + fz * floatBlend.current,
      );
    }

    // Defensive: seed the entry if KnowledgeGraph's own effect hasn't run yet.
    let live = livePositions.current.get(node.id);
    if (!live) {
      live = new Vector3();
      livePositions.current.set(node.id, live);
    }
    live.set(group.position.x, group.position.y, group.position.z);
  });

  function handlePointerOver(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }

  function handlePointerOut(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "auto";
  }

  const isCore = depth === 0;
  const opacity = isSelected ? 1 : isDimmed ? (isRelated ? 0.75 : 0.32) : 1;
  const emissiveIntensity = isSelected
    ? 0.75
    : hovered
      ? 0.55
      : isRelated && isDimmed
        ? 0.4
        : 0.3;

  // Selection converges every node toward the same bright highlight color,
  // regardless of its own accent.
  const accentColors = NODE_ACCENTS[accent];
  const color = isSelected ? "#c9a0e8" : accentColors.color;
  const emissiveColor = isSelected ? "#f9a8d4" : accentColors.emissive;

  const glowOpacity = isSelected
    ? 0.48
    : isDimmed
      ? isRelated
        ? 0.24
        : 0.06
      : isCore
        ? 0.22
        : 0.16;
  const radius = isCore ? CORE_RADIUS : SECONDARY_RADIUS;

  return (
    <group ref={groupRef} position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {isCore ? (
          <icosahedronGeometry args={[CORE_RADIUS, 0]} />
        ) : (
          <octahedronGeometry args={[SECONDARY_RADIUS, 0]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          roughness={0.5}
          metalness={0.1}
          transparent
          opacity={opacity}
        />
        {/* Nested inside the mesh so it inherits the same scale transform. */}
        <Glow
          shape={isCore ? "icosahedron" : "octahedron"}
          radius={radius}
          color={emissiveColor}
          opacity={glowOpacity}
          haloScale={2.3}
          haloScaleOuter={3}
          opacityOuter={glowOpacity * 0.25}
        />
      </mesh>
      {/* An HTML overlay, not 3D text, so it tracks the group's position
          including idle float. Hidden from the tab order — the Topics list
          already exposes this same set as accessible controls. */}
      <Html center position={[0, -(radius + 0.24), 0]} zIndexRange={[10, 0]} occlude={false}>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={(event) => onSelect(node.id, event.currentTarget)}
          className="cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap backdrop-blur-sm transition-opacity"
          style={{
            opacity,
            color: isSelected ? "#f1f0ff" : "#c9c6e2",
            borderColor: isSelected ? "rgba(139,133,230,0.65)" : "rgba(255,255,255,0.14)",
            background: "rgba(8,7,12,0.6)",
          }}
        >
          {node.label}
        </button>
      </Html>
    </group>
  );
}

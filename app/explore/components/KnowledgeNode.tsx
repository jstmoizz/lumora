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

// The subset of drei's OrbitControls this component actually touches —
// mirrors CameraRig.tsx's own narrow `OrbitControlsLike` typing of the same
// generically-typed `state.controls`, for the same reason.
interface OrbitControlsLike {
  enabled: boolean;
}

// A plain module-level function, not a closure — mirrors OptionWheel.tsx's
// own `runFrame`: this sidesteps `react-hooks/immutability` flagging a
// mutation of `controls` (a live, imperative OrbitControls instance handed
// back by `useThree`, not React-managed render state) inside a handler
// that's passed to JSX.
function setControlsEnabled(controls: OrbitControlsLike | null, enabled: boolean): void {
  if (controls) controls.enabled = enabled;
}

interface KnowledgeNodeProps {
  node: KnowledgeGraphNode;
  position: [number, number, number];
  // 0 = top-level (studied directly), 1+ = a child of another studied
  // topic — drives the icosahedron+larger vs octahedron+smaller shape/size
  // pairing below, derived from the graph's own shape.
  depth: number;
  accent: AccentId;
  isSelected: boolean;
  // Directly related to the current selection (parent/child, or named in
  // each other's relatedLabels) — stays visible and a touch more prominent,
  // distinct from nodes with no relation to the current selection.
  isRelated: boolean;
  isDimmed: boolean;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
  // Fired once, on release, after a real drag (not a plain click) — never
  // per pointer-move, so this never causes a full-graph re-layout or a
  // React state update on every frame (see this file's own drag handlers).
  onDragEnd: (id: string, position: [number, number, number]) => void;
  // The shared live-position store (owned by KnowledgeGraph, one Vector3 per
  // node id) — this component writes its own actual rendered position into
  // its own entry every frame (dragged, floating, or resting), read exclusively
  // inside useFrame below, never during render (see KnowledgeGraph.tsx's own
  // comment on why). Connections.tsx reads the exact same entries every
  // frame so edges track a moving node continuously, without either
  // component needing a React state update to stay in sync.
  livePositions: LivePositions;
}

// Interactive scale is a multiplier on top of the depth's geometry radius
// (see CORE_RADIUS/SECONDARY_RADIUS below), so hover/selection read the same
// way regardless of depth.
const BASE_SCALE = 1;
const HOVER_SCALE = 1.15;
const SELECTED_SCALE = 1.3;
const SCALE_LERP = 0.15;

// High enough that the node still reads as tracking the pointer directly
// (no perceptible lag), low enough to smooth out raw per-sample jitter from
// the pointermove event stream — the same "ease toward a target every
// frame" idea CameraRig.tsx uses for its own fly-to, just much faster here
// since a drag needs to feel immediate, not a deliberate camera move.
const DRAG_LERP = 0.45;
// How quickly idle floating fades back in once it's safe to resume after a
// drag (see floatBlend's own comment) — slow enough to read as a gentle
// resumption, not a snap back to full amplitude.
const FLOAT_BLEND_LERP = 0.06;

// Top-level topics get the rounder icosahedron (closer to CentralNode's
// form); nested topics keep the sharper octahedron. Kept deliberately
// small — a star-point, not a UI sphere — with Glow doing the work of
// making each read as a light source rather than a solid shape.
const CORE_RADIUS = 0.34;
const SECONDARY_RADIUS = 0.24;

// One topic node. `position` (from graphLayout.ts) is the node's logical/
// manual position; the outer <group> itself is driven imperatively every
// frame on top of that — idle floating at rest, the pointer's raycast
// target while dragging (see useFrame below) — with only scale/rotation
// applied to the inner mesh, so the two layers never fight each other.
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
  // Position comes from the `position` prop as a baseline; this ref's own
  // transform is what's actually driven imperatively frame-by-frame on top
  // of it (idle float, or the pointer's raycast target while dragging — see
  // useFrame below), so neither dragging nor floating ever triggers a React
  // re-render (or a full-graph re-layout) on their own.
  const groupRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const currentScale = useRef(BASE_SCALE);

  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as OrbitControlsLike | null;

  // Gesture-scoped refs, not state: none of this needs to trigger a
  // re-render while it's happening, only the one `onDragEnd` call at the end.
  const pointerDownAt = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragPlane = useRef(new Plane());
  const dragPoint = useRef(new Vector3());
  // Where the pointer's own raycast currently says the node should be —
  // `useFrame` eases the group toward this every frame (see DRAG_LERP)
  // rather than snapping straight to it on every pointermove, which is what
  // makes the drag read as fluid rather than mechanical. Click-vs-drag
  // detection itself is untouched by this: it still runs on raw pointer
  // pixel distance (isDragGesture), never on this eased value.
  const dragTarget = useRef(new Vector3());
  const controlsWereEnabled = useRef(true);
  // Eases the idle float effect in/out — 0 while dragging (fully
  // suppressed) and while waiting for a just-finished drag's committed
  // position to round-trip back down as this node's own `position` prop
  // (see the effect below), lerping to 1 once floating is safe to resume, so
  // it fades back in rather than popping straight to full amplitude.
  const floatBlend = useRef(0);
  // Set the instant a drag commits; cleared once `position` (this node's own
  // prop) actually reflects that committed value. Bridges the gap between
  // "the drag imperatively moved the group already" and "React's state
  // update + re-render has caught up" — without it, a `useFrame` tick that
  // lands in that gap would compute `position (still the stale pre-drag
  // value) + floatOffset` and snap the node back before the real position
  // arrives a frame or two later.
  const awaitingPositionSync = useRef(false);

  useEffect(() => {
    awaitingPositionSync.current = false;
  }, [position]);

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    // Otherwise the browser treats this same mousedown-and-drag as the start
    // of a text-selection gesture, highlighting whatever page content the
    // pointer crosses while the node is being dragged. Scoped to exactly
    // this gesture (only fires when the pointer actually comes down on a
    // node's own mesh) — the rest of the page keeps normal text selection.
    event.nativeEvent.preventDefault();
    pointerDownAt.current = { x: event.clientX, y: event.clientY };
    isDragging.current = false;

    // A plane through the node's current position, facing the camera —
    // dragging moves the node across this plane, since a single 2D pointer
    // coordinate has no unique 3D answer on its own.
    const worldPosition = new Vector3();
    groupRef.current?.getWorldPosition(worldPosition);
    const normal = new Vector3();
    camera.getWorldDirection(normal);
    dragPlane.current.setFromNormalAndCoplanarPoint(normal, worldPosition);

    // Disabled for the whole gesture, from pointerdown, not just once a drag
    // is confirmed — OrbitControls listens on the same canvas element, and
    // waiting for the drag threshold to be crossed would let it start
    // orbiting first. Restored on release either way (see handlePointerUp).
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

    // `position` is in the KnowledgeGraph <group>'s local space (the same
    // space graphLayout.ts's own coordinates are in) — converting the
    // plane-intersection's world point back into that space keeps the value
    // this drag eventually commits consistent with it, rather than drifting
    // if that parent group is ever itself transformed. Only updates the
    // *target* — `useFrame` is what actually moves the group, every frame,
    // toward it.
    const local = group.parent ? group.parent.worldToLocal(dragPoint.current.clone()) : dragPoint.current;
    dragTarget.current.set(local.x, local.y, local.z);
  }

  // Shared cleanup for both a normal release and an aborted gesture
  // (pointercancel — e.g. the OS interrupts the touch) — always restores
  // OrbitControls, since leaving it disabled after the pointer is gone would
  // strand the camera. Returns whether there was actually a gesture in
  // progress to react to.
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
        // Snap exactly to the final raycast target on release, rather than
        // leaving it wherever the drag's own per-frame easing had eased to
        // — so the node ends up precisely where the pointer was let go
        // (not a hair short), and so the value committed below is exactly
        // what's already on screen (no post-release settling pop).
        group.position.copy(dragTarget.current);
        floatBlend.current = 0;
        awaitingPositionSync.current = true;
        onDragEnd(node.id, [group.position.x, group.position.y, group.position.z]);
      }
    } else {
      onSelect(node.id);
    }
  }

  // A cancelled gesture (pointercancel) is neither a click nor a completed
  // drag — just abandon it and restore normal camera control, with no
  // onSelect/onDragEnd call either way.
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
      // Eased toward the pointer's raycast target (see DRAG_LERP), not
      // snapped straight to it — this is what makes the drag itself feel
      // fluid. Floating stays fully suppressed the entire time.
      group.position.lerp(dragTarget.current, DRAG_LERP);
      floatBlend.current = 0;
    } else if (awaitingPositionSync.current) {
      // A drag just committed but this node's own `position` prop hasn't
      // round-tripped back down yet (see the ref's own comment) — hold
      // exactly where the drag left it rather than recomputing from the
      // still-stale prop, which would snap the node back for a frame.
    } else {
      floatBlend.current = MathUtils.lerp(floatBlend.current, 1, FLOAT_BLEND_LERP);
      // Disabled unconditionally: KnowledgeNode only ever renders when
      // reduced motion is off in the first place (Scene only mounts then —
      // see ExploreClient.tsx's `showScene`), so there's no live
      // reduced-motion state to thread through here. computeFloatOffset
      // still accepts and honors the flag on its own terms (see its own
      // tests) so that contract holds independently of this call site.
      const [fx, fy, fz] = computeFloatOffset(node.id, state.clock.elapsedTime, false);
      group.position.set(
        position[0] + fx * floatBlend.current,
        position[1] + fy * floatBlend.current,
        position[2] + fz * floatBlend.current,
      );
    }

    // Lazily creates its own entry if KnowledgeGraph's seeding effect
    // somehow hasn't run yet (defensive — in practice it always has, since
    // layout effects settle before any useFrame tick) rather than skipping
    // the write and leaving Connections briefly reading a stale/missing
    // position.
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

  // Per-node color identity (see NODE_ACCENTS, Lumora's own indigo/violet/
  // pink gradient); selection converges every node toward the brightest,
  // hottest point on that same gradient, so "selected" reads as "now has
  // Lumora's attention" regardless of the node's own hue.
  const accentColors = NODE_ACCENTS[accent];
  const color = isSelected ? "#c9a0e8" : accentColors.color;
  const emissiveColor = isSelected ? "#f9a8d4" : accentColors.emissive;

  // Glow hierarchy: strong when selected, moderate for its related
  // neighborhood, quietly present normally, and nearly gone for unrelated
  // nodes once something else is selected. Top-level topics sit a touch
  // stronger than nested ones even at rest, echoing their slightly larger
  // geometry.
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
        {/* Nested inside the animated mesh (not a sibling) so it inherits
            the same scale transform automatically, instead of drifting
            apart from the node it's glowing around. */}
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
      {/* A plain HTML overlay, not 3D text — shows the node's name directly
          on the graph. Sits on the outer group, so it tracks the node's
          actual position (idle float included) rather than floating loose
          relative to it.

          `tabIndex={-1}` + `aria-hidden`: the Topics list (OptionWheel/chip
          row) already renders this same set as real, accessible controls,
          so this would otherwise be a redundant tab stop. Still clickable
          and a valid `.focus()` target — `-1` only removes it from the
          natural Tab sequence. */}
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

"use client";

import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { MathUtils, type Mesh } from "three";
import { NODE_ACCENTS, type AccentId, type KnowledgeGraphNode } from "../data";
import Glow from "./Glow";

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
}

// Interactive scale is a multiplier on top of the depth's geometry radius
// (see CORE_RADIUS/SECONDARY_RADIUS below), so hover/selection read the same
// way regardless of depth.
const BASE_SCALE = 1;
const HOVER_SCALE = 1.15;
const SELECTED_SCALE = 1.3;
const SCALE_LERP = 0.15;

// Top-level topics get the rounder icosahedron (closer to CentralNode's
// form); nested topics keep the sharper octahedron. Kept deliberately
// small — a star-point, not a UI sphere — with Glow doing the work of
// making each read as a light source rather than a solid shape.
const CORE_RADIUS = 0.34;
const SECONDARY_RADIUS = 0.24;

// One topic node. Position comes from the parent <group> (computed by
// graphLayout.ts); only local offsets (bob, scale, rotation) are driven
// imperatively here, so the two never fight each other on re-render.
export default function KnowledgeNode({
  node,
  position,
  depth,
  accent,
  isSelected,
  isRelated,
  isDimmed,
  onSelect,
}: KnowledgeNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const currentScale = useRef(BASE_SCALE);
  // Randomized once per node (lazy initializer, so the impure call only
  // ever runs on mount) so nodes don't bob in lockstep.
  const [bobOffset] = useState(() => Math.random() * Math.PI * 2);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const targetScale = isSelected ? SELECTED_SCALE : hovered ? HOVER_SCALE : BASE_SCALE;
    currentScale.current = MathUtils.lerp(currentScale.current, targetScale, SCALE_LERP);
    mesh.scale.setScalar(currentScale.current);

    mesh.position.y = Math.sin(state.clock.elapsedTime * 0.4 + bobOffset) * 0.05;
    mesh.rotation.y += 0.001;
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

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect(node.id);
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
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
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
            the same bob/scale transform automatically, instead of drifting
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
          on the graph. Sits on the outer group, not the bobbing mesh, so
          the label stays still while the node breathes.

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

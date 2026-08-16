"use client";

import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { MathUtils, type Mesh } from "three";
import { NODE_ACCENTS, type KnowledgeNode as KnowledgeNodeData } from "../data";
import Glow from "./Glow";

interface KnowledgeNodeProps {
  node: KnowledgeNodeData;
  isSelected: boolean;
  // Directly related to the current selection (shares a KNOWLEDGE_EDGES
  // entry) — stays visible and a touch more prominent, distinct from nodes
  // with no relation to the current selection.
  isRelated: boolean;
  isDimmed: boolean;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

// Interactive scale is a multiplier on top of the tier's geometry radius
// (see CORE_RADIUS/SECONDARY_RADIUS below), so hover/selection read the same
// way regardless of tier.
const BASE_SCALE = 1;
const HOVER_SCALE = 1.15;
const SELECTED_SCALE = 1.3;
const SCALE_LERP = 0.15;

// Two-shape vocabulary: core topics get the rounder icosahedron (closer in
// spirit to CentralNode's smoother form), secondary topics keep the
// sharper-faceted octahedron. Radii give core nodes a modest, not dramatic,
// size edge.
const CORE_RADIUS = 0.62;
const SECONDARY_RADIUS = 0.46;

// One topic node. Position comes from the parent <group> (static, from
// data.ts); only local offsets (bob, scale, rotation) are driven imperatively
// here, so the two never fight each other on re-render.
export default function KnowledgeNode({
  node,
  isSelected,
  isRelated,
  isDimmed,
  onSelect,
}: KnowledgeNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const currentScale = useRef(BASE_SCALE);
  // Randomized once per node (lazy initializer, so the impure call only
  // ever runs on mount) so the ~7 nodes don't bob in lockstep.
  const [bobOffset] = useState(() => Math.random() * Math.PI * 2);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const targetScale = isSelected
      ? SELECTED_SCALE
      : hovered
        ? HOVER_SCALE
        : BASE_SCALE;
    currentScale.current = MathUtils.lerp(
      currentScale.current,
      targetScale,
      SCALE_LERP,
    );
    mesh.scale.setScalar(currentScale.current);

    mesh.position.y =
      Math.sin(state.clock.elapsedTime * 0.4 + bobOffset) * 0.05;
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

  const opacity = isSelected ? 1 : isDimmed ? (isRelated ? 0.75 : 0.32) : 1;
  const emissiveIntensity = isSelected
    ? 0.5
    : hovered
      ? 0.35
      : isRelated && isDimmed
        ? 0.22
        : 0.15;

  // Restrained per-node color identity (see NODE_ACCENTS); selection still
  // converges every node toward the same shared Lumora violet, so "selected"
  // reads as "now has Lumora's attention" regardless of the node's own hue.
  const accent = NODE_ACCENTS[node.accent];
  const color = isSelected ? "#8b85e6" : accent.color;
  const emissiveColor = isSelected ? "#a89ef2" : accent.emissive;

  // Glow hierarchy: strong when selected, moderate for its related
  // neighborhood, quietly present normally, and nearly gone for unrelated
  // nodes once something else is selected. Core topics sit a touch stronger
  // than secondary even at rest, echoing their slightly larger geometry.
  const glowOpacity = isSelected
    ? 0.22
    : isDimmed
      ? isRelated
        ? 0.1
        : 0.03
      : node.tier === "core"
        ? 0.08
        : 0.05;
  const radius = node.tier === "core" ? CORE_RADIUS : SECONDARY_RADIUS;

  return (
    <group position={node.position}>
      <mesh
        ref={meshRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        {node.tier === "core" ? (
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
          shape={node.tier === "core" ? "icosahedron" : "octahedron"}
          radius={radius}
          color={emissiveColor}
          opacity={glowOpacity}
        />
      </mesh>
    </group>
  );
}

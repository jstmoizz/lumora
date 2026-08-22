"use client";

import { useRef, useState } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { MathUtils, type Mesh } from "three";
import type { ExpandedConcept } from "../data";
import type { ExpansionState } from "../progress";
import Glow from "./Glow";

interface ExpandedConceptNodeProps {
  concept: ExpandedConcept;
  position: [number, number, number];
  // "hidden" is filtered out by the caller (KnowledgeGraph) before this
  // even mounts, but the type stays inclusive so callers can't forget to
  // handle it.
  expansionState: ExpansionState;
  isSelected: boolean;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

// Smaller than even KnowledgeNode's SECONDARY_RADIUS (0.24) — expanded
// concepts are deliberately the quietest, smallest thing in the scene, one
// step further from Lumora in the visual hierarchy than core topics.
const RADIUS = 0.15;
const BASE_SCALE = 1;
const HOVER_SCALE = 1.2;
const SELECTED_SCALE = 1.35;
const SCALE_LERP = 0.15;

// The visible ramp behind "become more visible as familiarity increases":
// "hinted" is a barely-there glimpse (and deliberately non-interactive, see
// `interactive` below); "revealed" is the concept's normal restrained
// presence, still well below a core topic's. "hidden" concepts are never
// rendered at all (KnowledgeGraph returns null for them), so there's no
// entry for that state here.
const STATE_OPACITY: Record<"hinted" | "revealed", number> = {
  hinted: 0.22,
  revealed: 0.8,
};
const STATE_GLOW: Record<"hinted" | "revealed", number> = {
  hinted: 0.03,
  revealed: 0.07,
};
const STATE_EMISSIVE: Record<"hinted" | "revealed", number> = {
  hinted: 0.08,
  revealed: 0.14,
};

export default function ExpandedConceptNode({
  concept,
  position,
  expansionState,
  isSelected,
  onSelect,
}: ExpandedConceptNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const currentScale = useRef(BASE_SCALE);
  // Randomized once per concept (lazy initializer) so the handful of
  // concepts under one topic don't bob in lockstep with each other or with
  // their parent — same approach as KnowledgeNode's own bobOffset.
  const [bobOffset] = useState(() => Math.random() * Math.PI * 2);

  // Only a fully "revealed" concept is a real interactive target — a
  // "hinted" one is a deliberate glimpse, not yet a control, so it must not
  // steal hover/click from anything behind it.
  const interactive = expansionState === "revealed";

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
      Math.sin(state.clock.elapsedTime * 0.5 + bobOffset) * 0.04;
    mesh.rotation.y += 0.0015;
  });

  if (expansionState === "hidden") return null;

  function handlePointerOver(event: ThreeEvent<PointerEvent>) {
    if (!interactive) return;
    event.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  }

  function handlePointerOut(event: ThreeEvent<PointerEvent>) {
    if (!interactive) return;
    event.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "auto";
  }

  function handleClick(event: ThreeEvent<MouseEvent>) {
    if (!interactive) return;
    event.stopPropagation();
    onSelect(concept.id);
  }

  const opacity = STATE_OPACITY[expansionState];
  const glowOpacity =
    STATE_GLOW[expansionState] + (isSelected ? 0.12 : hovered ? 0.06 : 0);
  const emissiveIntensity = isSelected ? 0.4 : hovered ? 0.28 : STATE_EMISSIVE[expansionState];

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        // A "hinted" concept is visible but must never intercept pointer
        // events — it isn't a control yet.
        raycast={interactive ? undefined : () => null}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <octahedronGeometry args={[RADIUS, 0]} />
        <meshStandardMaterial
          color="#4a4870"
          emissive="#8b85e6"
          emissiveIntensity={emissiveIntensity}
          roughness={0.55}
          metalness={0.05}
          transparent
          opacity={opacity}
        />
        <Glow
          shape="octahedron"
          radius={RADIUS}
          color="#8b85e6"
          opacity={glowOpacity}
          haloScale={2.4}
        />
      </mesh>
    </group>
  );
}

"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, MeshStandardMaterial } from "three";
import Glow from "./Glow";

const RADIUS = 0.85;
const BASE_EMISSIVE = 0.28;
const DIMMED_EMISSIVE = 0.18;
// A barely-perceptible intensity drift, not a scale pulse — "breathing"
// without anything visibly growing/shrinking.
const BREATH_AMPLITUDE = 0.03;
const BREATH_SPEED = 0.3;

interface CentralNodeProps {
  dimmed: boolean;
}

// The central Lumora element: a slightly larger low-poly form with a
// restrained emissive tint, only the barest rotation, and the strongest glow
// in the scene — it should read as present and steady, the calm center
// everything else relates to, not as the thing drawing the eye through
// motion.
export default function CentralNode({ dimmed }: CentralNodeProps) {
  const meshRef = useRef<Mesh>(null);
  const materialRef = useRef<MeshStandardMaterial>(null);

  useFrame((state) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    mesh.rotation.y = state.clock.elapsedTime * 0.05;
    mesh.rotation.x = Math.sin(state.clock.elapsedTime * 0.15) * 0.04;

    const base = dimmed ? DIMMED_EMISSIVE : BASE_EMISSIVE;
    const breath = Math.sin(state.clock.elapsedTime * BREATH_SPEED) * BREATH_AMPLITUDE;
    material.emissiveIntensity = base + breath;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[RADIUS, 1]} />
      <meshStandardMaterial
        ref={materialRef}
        color="#4c4a75"
        emissive="#6a63c9"
        emissiveIntensity={dimmed ? DIMMED_EMISSIVE : BASE_EMISSIVE}
        roughness={0.45}
        metalness={0.15}
        transparent
        opacity={dimmed ? 0.75 : 1}
      />
      <Glow
        shape="icosahedron"
        radius={RADIUS}
        color="#8b85e6"
        opacity={dimmed ? 0.11 : 0.17}
      />
    </mesh>
  );
}

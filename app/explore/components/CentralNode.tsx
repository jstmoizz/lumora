"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Mesh, MeshStandardMaterial } from "three";
import Glow from "./Glow";

const RADIUS = 0.85;
const BASE_EMISSIVE = 0.42;
const DIMMED_EMISSIVE = 0.26;
// A barely-perceptible intensity drift, not a scale pulse — "breathing"
// without anything visibly growing/shrinking.
const BREATH_AMPLITUDE = 0.03;
const BREATH_SPEED = 0.3;

interface CentralNodeProps {
  dimmed: boolean;
}

// Lumora Core: a low-poly form with the strongest glow in the scene and
// only the barest rotation — steady, not attention-grabbing.
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
        color="#6d2f8f"
        emissive="#e0a6f0"
        emissiveIntensity={dimmed ? DIMMED_EMISSIVE : BASE_EMISSIVE}
        roughness={0.45}
        metalness={0.15}
        transparent
        opacity={dimmed ? 0.75 : 1}
      />
      <Glow
        shape="icosahedron"
        radius={RADIUS}
        color="#f0b8e8"
        opacity={dimmed ? 0.2 : 0.32}
        haloScale={1.35}
        haloScaleOuter={1.75}
        opacityOuter={dimmed ? 0.05 : 0.09}
      />
      <Html center position={[0, -(RADIUS + 0.28), 0]} zIndexRange={[10, 0]} occlude={false}>
        <span
          className="rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap backdrop-blur-sm"
          style={{
            opacity: dimmed ? 0.6 : 1,
            color: "#f1f0ff",
            borderColor: "rgba(139,133,230,0.5)",
            background: "rgba(8,7,12,0.6)",
          }}
        >
          Lumora Core
        </span>
      </Html>
    </mesh>
  );
}

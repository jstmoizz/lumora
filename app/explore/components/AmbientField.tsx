"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { TetrahedronGeometry, TorusGeometry, type Mesh } from "three";

interface Seed {
  position: [number, number, number];
  shape: "shard" | "ring";
  scale: number;
  phase: number;
  driftAmplitude: number;
  driftSpeed: number;
  spinSpeed: number;
  opacity: number;
}

// Placed at radius 5-9.5, well outside the knowledge graph's own ~2.5-3.5
// radius, so these read as distant background texture and never get
// mistaken for a topic node or drawn into a knowledge relationship.
function randomSeed(): Seed {
  const radius = 5 + Math.random() * 4.5;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  return {
    position: [
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi) * 0.55,
      radius * Math.sin(phi) * Math.sin(theta),
    ],
    shape: Math.random() < 0.5 ? "shard" : "ring",
    scale: 0.05 + Math.random() * 0.08,
    phase: Math.random() * Math.PI * 2,
    driftAmplitude: 0.06 + Math.random() * 0.1,
    driftSpeed: 0.04 + Math.random() * 0.05,
    spinSpeed: 0.02 + Math.random() * 0.04,
    opacity: 0.1 + Math.random() * 0.14,
  };
}

interface AmbientElementProps {
  seed: Seed;
  shardGeometry: TetrahedronGeometry;
  ringGeometry: TorusGeometry;
}

// Each element drifts on its own random phase/speed (see randomSeed) so the
// field never reads as synchronized — slow enough that the scene should
// feel alive before the motion itself is consciously noticed.
function AmbientElement({ seed, shardGeometry, ringGeometry }: AmbientElementProps) {
  const meshRef = useRef<Mesh>(null);
  const baseY = seed.position[1];

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    mesh.position.y = baseY + Math.sin(t * seed.driftSpeed + seed.phase) * seed.driftAmplitude;
    mesh.rotation.x += seed.spinSpeed * 0.01;
    mesh.rotation.y += seed.spinSpeed * 0.015;
  });

  return (
    <mesh
      ref={meshRef}
      position={seed.position}
      scale={seed.scale}
      raycast={() => null}
    >
      <primitive
        object={seed.shape === "shard" ? shardGeometry : ringGeometry}
        attach="geometry"
      />
      <meshBasicMaterial
        color="#6b4a72"
        transparent
        opacity={seed.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}

interface AmbientFieldProps {
  count: number;
}

// Purely decorative environmental elements — not knowledge nodes: no
// labels, not clickable, no edges, never part of the graph. They exist only
// so the wide dark space doesn't read as empty. Two geometries are created
// once and shared across every instance (see the dispose effect) rather
// than allocating a unique one per element.
export default function AmbientField({ count }: AmbientFieldProps) {
  const [seeds] = useState(() => Array.from({ length: count }, randomSeed));
  const shardGeometry = useMemo(() => new TetrahedronGeometry(1, 0), []);
  const ringGeometry = useMemo(() => new TorusGeometry(1, 0.28, 6, 12), []);

  useEffect(() => {
    return () => {
      shardGeometry.dispose();
      ringGeometry.dispose();
    };
  }, [shardGeometry, ringGeometry]);

  return (
    <group>
      {seeds.map((seed, index) => (
        <AmbientElement
          key={index}
          seed={seed}
          shardGeometry={shardGeometry}
          ringGeometry={ringGeometry}
        />
      ))}
    </group>
  );
}

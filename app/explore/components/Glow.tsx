"use client";

import { AdditiveBlending } from "three";

interface GlowProps {
  shape: "icosahedron" | "octahedron";
  radius: number;
  color: string;
  opacity: number;
}

// A restrained "fake glow": a slightly larger, low-opacity, additive-blended
// copy of a node's own geometry sitting just outside it — enough to read as
// a soft light bleed against the dark background without a postprocessing
// bloom pass. `raycast={() => null}` makes it fully transparent to pointer
// events, so it never steals hover/click from the node it's wrapping (or
// from anything behind it).
export default function Glow({ shape, radius, color, opacity }: GlowProps) {
  return (
    <mesh raycast={() => null} scale={1.3}>
      {shape === "icosahedron" ? (
        <icosahedronGeometry args={[radius, 0]} />
      ) : (
        <octahedronGeometry args={[radius, 0]} />
      )}
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}

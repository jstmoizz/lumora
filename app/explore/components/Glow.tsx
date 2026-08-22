"use client";

import { AdditiveBlending } from "three";

interface GlowProps {
  shape: "icosahedron" | "octahedron";
  radius: number;
  color: string;
  opacity: number;
  // How far the glow halo extends past the node's own geometry, as a
  // multiplier on `radius`. Defaults to a subtle bleed (CentralNode); the
  // small star-point KnowledgeNodes pass a larger value so a soft halo — not
  // postprocessing bloom — is what makes them read as light sources rather
  // than tiny solid shapes.
  haloScale?: number;
}

// A restrained "fake glow": a larger, low-opacity, additive-blended copy of
// a node's own geometry sitting just outside it — enough to read as a soft
// light bleed against the dark background without a postprocessing bloom
// pass. `raycast={() => null}` makes it fully transparent to pointer events,
// so it never steals hover/click from the node it's wrapping (or from
// anything behind it).
export default function Glow({ shape, radius, color, opacity, haloScale = 1.3 }: GlowProps) {
  return (
    <mesh raycast={() => null} scale={haloScale}>
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

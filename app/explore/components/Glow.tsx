"use client";

import { AdditiveBlending } from "three";

interface GlowProps {
  shape: "icosahedron" | "octahedron";
  radius: number;
  color: string;
  opacity: number;
  // Multiplier on `radius` for how far the halo extends past the geometry.
  haloScale?: number;
  // Optional second, larger/softer halo layered behind the first, for a
  // closer approximation of real bloom falloff. Omit for a single layer.
  haloScaleOuter?: number;
  opacityOuter?: number;
}

// A larger, low-opacity, additive-blended copy of the node's geometry,
// faking a glow without a postprocessing pass. `raycast={() => null}`
// keeps it fully transparent to pointer events.
export default function Glow({
  shape,
  radius,
  color,
  opacity,
  haloScale = 1.3,
  haloScaleOuter,
  opacityOuter,
}: GlowProps) {
  // Detail 1: smoother facets read as a soft halo at this scale; detail 0
  // looks hard-edged once blown up.
  const geometryArgs: [number, number] = [radius, 1];
  return (
    <>
      <mesh raycast={() => null} scale={haloScale}>
        {shape === "icosahedron" ? (
          <icosahedronGeometry args={geometryArgs} />
        ) : (
          <octahedronGeometry args={geometryArgs} />
        )}
        <meshBasicMaterial
          color={color}
          transparent
          opacity={opacity}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
      {haloScaleOuter != null && opacityOuter != null && (
        <mesh raycast={() => null} scale={haloScaleOuter}>
          {shape === "icosahedron" ? (
            <icosahedronGeometry args={geometryArgs} />
          ) : (
            <octahedronGeometry args={geometryArgs} />
          )}
          <meshBasicMaterial
            color={color}
            transparent
            opacity={opacityOuter}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      )}
    </>
  );
}

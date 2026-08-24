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
  // An optional second, larger/softer halo layered behind the first —
  // a tight bright inner halo plus a big faint outer haze reads closer to
  // real bloom's soft falloff than one flat halo, with no postprocessing
  // pass. Omit for the original single-layer look.
  haloScaleOuter?: number;
  opacityOuter?: number;
}

// A restrained "fake glow": a larger, low-opacity, additive-blended copy of
// a node's own geometry sitting just outside it — enough to read as a soft
// light bleed against the dark background without a postprocessing bloom
// pass. `raycast={() => null}` makes it fully transparent to pointer events,
// so it never steals hover/click from the node it's wrapping (or from
// anything behind it).
export default function Glow({
  shape,
  radius,
  color,
  opacity,
  haloScale = 1.3,
  haloScaleOuter,
  opacityOuter,
}: GlowProps) {
  // Detail 1 (not 0): a smoother, higher-facet-count copy of the shape reads
  // as a soft-edged halo at the larger scales this component is used at now;
  // detail 0 is fine for a node's own small solid mesh but a hard-edged
  // hexagon/octagon silhouette once blown up several times its own size.
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

"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { LineSegments2 } from "three-stdlib";
import { Vector3 } from "three";
import { NODE_ACCENTS, type AccentId, type KnowledgeGraphNode } from "../data";
import { toVector3, type LayoutEntry } from "../graphLayout";
import type { LivePositions } from "./KnowledgeGraph";

interface ConnectionsProps {
  nodes: KnowledgeGraphNode[];
  layout: LayoutEntry[];
  accents: Record<string, AccentId>;
  selectedNodeId: string | null;
  // The same shared live-position store KnowledgeNode writes its own current
  // rendered position into every frame (drag target, idle float, or at
  // rest) — read here, also every frame, so an edge follows a moving node
  // continuously instead of only updating once a drag commits and `layout`
  // itself changes.
  livePositions: LivePositions;
}

const ORIGIN: [number, number, number] = [0, 0, 0];
// Core never drags or floats, so its side of a spoke edge is always exactly
// the origin — reused rather than allocated fresh every frame.
const ORIGIN_VECTOR = new Vector3(0, 0, 0);

// Bold, glowing spokes from Core to every top-level node, plus one line per
// parent->child edge in the graph's own tree — no invented connections, the
// same real edge set as before, just styled more dramatically (brighter,
// thicker, glow-halo'd) so the graph reads as dense and energized rather
// than a sparse diagram, while staying on Lumora's own brand gradient.
const HOT_COLOR = "#f9a8d4"; // --mark-end (pink-300), the brand gradient's hot end
const DIM_COLOR = "#3d2a52"; // deep, desaturated indigo/violet

type LineRefMap = React.RefObject<Map<string, LineSegments2>>;

// A plain module-level function, not a closure — mirrors KnowledgeNode.tsx's
// own `setControlsEnabled`: writing into a ref's Map from inside a callback
// ref (itself invoked by React at commit time, never during render) still
// gets flagged by react-hooks/immutability when the writing function is
// defined inside the component; moving it out sidesteps that, and avoids
// ever reading `.current` in the render body at all (react-hooks/refs).
function setLineRef(map: LineRefMap, key: string, instance: LineSegments2 | null): void {
  if (instance) map.current.set(key, instance);
  else map.current.delete(key);
}

export default function Connections({ nodes, layout, accents, selectedNodeId, livePositions }: ConnectionsProps) {
  const positions = new Map(layout.map((entry) => [entry.id, toVector3(entry)]));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  // Two parallel maps (not one map-of-pairs) so every write from a JSX ref
  // callback is a single, direct `setLineRef(mapRef, key, instance)` call —
  // no object needs to be read from a ref first (see setLineRef's own
  // comment on why that matters). Keyed by "fromId::toId"; entries for edges
  // no longer in the graph are simply never looked up again once their
  // <Line>s unmount and null out their own refs — inert, not a real leak at
  // this graph's scale.
  const glowRefs = useRef<Map<string, LineSegments2>>(new Map());
  const brightRefs = useRef<Map<string, LineSegments2>>(new Map());

  useFrame(() => {
    for (const [key, glow] of glowRefs.current) {
      const bright = brightRefs.current.get(key);
      const separator = key.indexOf("::");
      const fromId = key.slice(0, separator);
      const toId = key.slice(separator + 2);
      const from = fromId === "lumora-core" ? ORIGIN_VECTOR : livePositions.current.get(fromId);
      const to = livePositions.current.get(toId);
      if (!from || !to) continue;
      const flat = [from.x, from.y, from.z, to.x, to.y, to.z];
      glow.geometry.setPositions(flat);
      bright?.geometry.setPositions(flat);
    }
  });

  return (
    <group>
      {nodes
        .filter((node) => node.parentId === null)
        .map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const key = `lumora-core::${node.id}`;
          const involvesSelected = selectedNodeId === null || selectedNodeId === node.id;
          const restColor = NODE_ACCENTS[accents[node.id]].emissive;
          const color =
            selectedNodeId === null ? restColor : involvesSelected ? HOT_COLOR : DIM_COLOR;
          const opacity = selectedNodeId === null ? 0.4 : involvesSelected ? 0.6 : 0.1;
          return (
            <group key={`spoke-${node.id}`}>
              {/* A wider, fainter additive copy behind the bright line fakes
                  a soft glow along the edge, same technique as Glow.tsx's
                  node halos, without a postprocessing pass. */}
              <Line
                ref={(instance) => setLineRef(glowRefs, key, instance)}
                points={[ORIGIN, position]}
                color={color}
                transparent
                opacity={opacity * 0.4}
                lineWidth={4}
              />
              <Line
                ref={(instance) => setLineRef(brightRefs, key, instance)}
                points={[ORIGIN, position]}
                color={color}
                transparent
                opacity={opacity}
                lineWidth={1.5}
              />
            </group>
          );
        })}

      {nodes
        .filter((node): node is KnowledgeGraphNode & { parentId: string } => node.parentId !== null)
        .map((node) => {
          const from = positions.get(node.parentId);
          const to = positions.get(node.id);
          const parent = byId.get(node.parentId);
          if (!from || !to || !parent) return null;

          const key = `${parent.id}::${node.id}`;
          const involvesSelected =
            selectedNodeId !== null && (node.id === selectedNodeId || parent.id === selectedNodeId);
          const dimmedBySelection = selectedNodeId !== null && !involvesSelected;
          const restColor = NODE_ACCENTS[accents[node.id]].emissive;
          const color = involvesSelected ? HOT_COLOR : dimmedBySelection ? DIM_COLOR : restColor;
          const opacity = dimmedBySelection ? 0.08 : involvesSelected ? 0.55 : 0.28;

          return (
            <group key={`${parent.id}-${node.id}`}>
              <Line
                ref={(instance) => setLineRef(glowRefs, key, instance)}
                points={[from, to]}
                color={color}
                transparent
                opacity={opacity * 0.4}
                lineWidth={4}
              />
              <Line
                ref={(instance) => setLineRef(brightRefs, key, instance)}
                points={[from, to]}
                color={color}
                transparent
                opacity={opacity}
                lineWidth={1.5}
              />
            </group>
          );
        })}
    </group>
  );
}

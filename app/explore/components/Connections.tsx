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
  // Same live-position store KnowledgeNode writes every frame — read here
  // too, so an edge follows a moving node continuously.
  livePositions: LivePositions;
}

const ORIGIN: [number, number, number] = [0, 0, 0];
// Core never drags or floats, so its side of a spoke edge is always the origin.
const ORIGIN_VECTOR = new Vector3(0, 0, 0);

// Glowing spokes from Core to every top-level node, plus one line per
// parent->child edge — Lumora's brand gradient, styled to read as dense and
// energized rather than a plain diagram.
const HOT_COLOR = "#f9a8d4"; // brand gradient's hot end
const DIM_COLOR = "#3d2a52";

type LineRefMap = React.RefObject<Map<string, LineSegments2>>;

// Module-level so writing into the ref's Map doesn't trip
// react-hooks/immutability.
function setLineRef(map: LineRefMap, key: string, instance: LineSegments2 | null): void {
  if (instance) map.current.set(key, instance);
  else map.current.delete(key);
}

export default function Connections({ nodes, layout, accents, selectedNodeId, livePositions }: ConnectionsProps) {
  const positions = new Map(layout.map((entry) => [entry.id, toVector3(entry)]));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  // Keyed by "fromId::toId". Stale entries for removed edges are simply
  // never looked up again once their <Line>s unmount.
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
              {/* Wider, fainter copy behind the bright line fakes a glow, same technique as Glow.tsx. */}
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

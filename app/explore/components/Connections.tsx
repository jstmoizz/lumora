"use client";

import { Line } from "@react-three/drei";
import { NODE_ACCENTS, type AccentId, type KnowledgeGraphNode } from "../data";
import { toVector3, type LayoutEntry } from "../graphLayout";

interface ConnectionsProps {
  nodes: KnowledgeGraphNode[];
  layout: LayoutEntry[];
  accents: Record<string, AccentId>;
  selectedNodeId: string | null;
}

const ORIGIN: [number, number, number] = [0, 0, 0];

// Bold, glowing spokes from Core to every top-level node, plus one line per
// parent->child edge in the graph's own tree — no invented connections, the
// same real edge set as before, just styled more dramatically (brighter,
// thicker, glow-halo'd) so the graph reads as dense and energized rather
// than a sparse diagram, while staying on Lumora's own brand gradient.
const HOT_COLOR = "#f9a8d4"; // --mark-end (pink-300), the brand gradient's hot end
const DIM_COLOR = "#3d2a52"; // deep, desaturated indigo/violet

export default function Connections({ nodes, layout, accents, selectedNodeId }: ConnectionsProps) {
  const positions = new Map(layout.map((entry) => [entry.id, toVector3(entry)]));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <group>
      {nodes
        .filter((node) => node.parentId === null)
        .map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
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
                points={[ORIGIN, position]}
                color={color}
                transparent
                opacity={opacity * 0.4}
                lineWidth={4}
              />
              <Line points={[ORIGIN, position]} color={color} transparent opacity={opacity} lineWidth={1.5} />
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

          const involvesSelected =
            selectedNodeId !== null && (node.id === selectedNodeId || parent.id === selectedNodeId);
          const dimmedBySelection = selectedNodeId !== null && !involvesSelected;
          const restColor = NODE_ACCENTS[accents[node.id]].emissive;
          const color = involvesSelected ? HOT_COLOR : dimmedBySelection ? DIM_COLOR : restColor;
          const opacity = dimmedBySelection ? 0.08 : involvesSelected ? 0.55 : 0.28;

          return (
            <group key={`${parent.id}-${node.id}`}>
              <Line points={[from, to]} color={color} transparent opacity={opacity * 0.4} lineWidth={4} />
              <Line points={[from, to]} color={color} transparent opacity={opacity} lineWidth={1.5} />
            </group>
          );
        })}
    </group>
  );
}

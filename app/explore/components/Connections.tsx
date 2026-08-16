"use client";

import { Line } from "@react-three/drei";
import { KNOWLEDGE_EDGES, KNOWLEDGE_NODES, NODE_ACCENTS } from "../data";

interface ConnectionsProps {
  selectedNodeId: string | null;
}

const ORIGIN: [number, number, number] = [0, 0, 0];

// Thin, low-opacity spokes from the center to every node, plus a handful of
// genuine topic-to-topic edges. Deliberately sparse and subdued — this
// should read as a few meaningful relationships, not a network diagram.
export default function Connections({ selectedNodeId }: ConnectionsProps) {
  return (
    <group>
      {KNOWLEDGE_NODES.map((node) => {
        const involvesSelected =
          selectedNodeId === null || selectedNodeId === node.id;
        // Core topics' spokes read as slightly stronger relationships even
        // before anything is selected — a quiet hierarchy cue, not just a
        // selection-time one.
        const baseOpacity = node.tier === "core" ? 0.26 : 0.15;
        // A faint tint of the node's own accent when at rest; selection
        // still converges the spoke to the shared Lumora violet, same as
        // the node itself, so "selected" reads consistently everywhere.
        const restColor = NODE_ACCENTS[node.accent].emissive;
        const color =
          selectedNodeId === null
            ? restColor
            : involvesSelected
              ? "#8b85e6"
              : "#4a4760";
        return (
          <Line
            key={`spoke-${node.id}`}
            points={[ORIGIN, node.position]}
            color={color}
            transparent
            opacity={
              selectedNodeId === null ? baseOpacity : involvesSelected ? 0.4 : 0.08
            }
            lineWidth={1}
          />
        );
      })}

      {KNOWLEDGE_EDGES.map((edge) => {
        const from = KNOWLEDGE_NODES.find((node) => node.id === edge.from);
        const to = KNOWLEDGE_NODES.find((node) => node.id === edge.to);
        if (!from || !to) return null;

        const involvesSelected =
          selectedNodeId !== null &&
          (edge.from === selectedNodeId || edge.to === selectedNodeId);
        const dimmedBySelection = selectedNodeId !== null && !involvesSelected;

        return (
          <Line
            key={`${edge.from}-${edge.to}`}
            points={[from.position, to.position]}
            color={involvesSelected ? "#a89ef2" : "#5b5788"}
            transparent
            opacity={dimmedBySelection ? 0.06 : involvesSelected ? 0.35 : 0.16}
            lineWidth={1}
          />
        );
      })}
    </group>
  );
}

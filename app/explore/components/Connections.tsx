"use client";

import { Line } from "@react-three/drei";
import { KNOWLEDGE_EDGES, KNOWLEDGE_NODES, NODE_ACCENTS } from "../data";
import { familiarityFor, type Familiarity } from "../progress";
import type { TopicProgress } from "@/lib/supabase/topic-progress";

interface ConnectionsProps {
  selectedNodeId: string | null;
  progress: Record<string, TopicProgress>;
}

const ORIGIN: [number, number, number] = [0, 0, 0];

// A small, capped nudge to a studied topic's spoke — "connections can
// become subtly more visible" per the Phase 4.2 brief — applied only at
// rest (no selection active); selection's own opacity hierarchy already
// dominates once something is selected, and familiarity shouldn't fight it.
const FAMILIARITY_SPOKE_OPACITY_BUMP: Record<Familiarity, number> = {
  0: 0,
  1: 0.03,
  2: 0.06,
};

// Thin, low-opacity spokes from the center to every node, plus a handful of
// genuine topic-to-topic edges. Deliberately sparse and subdued — this
// should read as a few meaningful relationships, not a network diagram.
export default function Connections({ selectedNodeId, progress }: ConnectionsProps) {
  return (
    <group>
      {KNOWLEDGE_NODES.map((node) => {
        const involvesSelected =
          selectedNodeId === null || selectedNodeId === node.id;
        // Core topics' spokes read as slightly stronger relationships even
        // before anything is selected — a quiet hierarchy cue, not just a
        // selection-time one. Familiarity adds a further small nudge on top.
        const familiarity = familiarityFor(progress[node.id]?.studyCount);
        const baseOpacity =
          (node.tier === "core" ? 0.26 : 0.15) +
          FAMILIARITY_SPOKE_OPACITY_BUMP[familiarity];
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

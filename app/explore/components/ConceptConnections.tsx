"use client";

import { Line } from "@react-three/drei";
import { EXPANDED_CONCEPTS, KNOWLEDGE_NODES, conceptPosition } from "../data";
import { expansionStateFor } from "../progress";
import type { TopicProgress } from "@/lib/supabase/topic-progress";

interface ConceptConnectionsProps {
  progress: Record<string, TopicProgress>;
}

// Thinner and quieter than KnowledgeGraph's own topic-to-Lumora spokes
// (Connections.tsx) — a concept's line to its parent should read as the
// faintest relationship in the scene, one step below a topic-to-topic edge.
const STATE_OPACITY: Record<"hinted" | "revealed", number> = {
  hinted: 0.05,
  revealed: 0.18,
};

// Kept as its own component rather than folded into Connections.tsx: that
// file's spokes/edges are exclusively about the stable core-topic layer,
// and its existing tests/behavior shouldn't need to reason about the
// separate, per-user expansion layer at all.
export default function ConceptConnections({ progress }: ConceptConnectionsProps) {
  return (
    <group>
      {EXPANDED_CONCEPTS.map((concept) => {
        const parent = KNOWLEDGE_NODES.find((node) => node.id === concept.parentId);
        if (!parent) return null;

        const state = expansionStateFor(progress[concept.parentId]?.studyCount);
        if (state === "hidden") return null;

        return (
          <Line
            key={`concept-spoke-${concept.id}`}
            points={[parent.position, conceptPosition(concept)]}
            color="#6f6aa8"
            transparent
            opacity={STATE_OPACITY[state]}
            lineWidth={1}
          />
        );
      })}
    </group>
  );
}

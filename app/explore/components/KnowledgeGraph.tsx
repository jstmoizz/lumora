"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { Vector3 } from "three";
import CentralNode from "./CentralNode";
import Connections from "./Connections";
import KnowledgeNode from "./KnowledgeNode";
import { assignAccents, type KnowledgeGraphNode } from "../data";
import { toVector3, type LayoutEntry } from "../graphLayout";
import { normalizeTopicKey } from "@/lib/knowledge-graph/topics";

interface KnowledgeGraphProps {
  nodes: KnowledgeGraphNode[];
  layout: LayoutEntry[];
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
  onDragEnd: (id: string, position: [number, number, number]) => void;
}

// A ref, not a resolved Map/Vector3 — passed down as-is to KnowledgeNode and
// Connections, which each do their own `.current` reads/writes exclusively
// inside `useFrame` (never during render, which `react-hooks/refs` disallows
// — see this file's own effect below for why the *seeding* also has to live
// in an effect rather than directly in the render body).
export type LivePositions = RefObject<Map<string, Vector3>>;

// A node's own parent/children (direct graph neighbors), plus anything it
// named as a related subtopic that happens to already be a studied node.
function relatedIdsOf(nodeId: string, nodes: KnowledgeGraphNode[]): Set<string> {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return new Set();

  const relatedKeys = new Set(node.relatedLabels.map(normalizeTopicKey));
  const related = new Set<string>();
  for (const candidate of nodes) {
    if (candidate.id === nodeId) continue;
    const isParent = candidate.id === node.parentId;
    const isChild = candidate.parentId === node.id;
    const isNamedRelated = relatedKeys.has(candidate.topicKey);
    if (isParent || isChild || isNamedRelated) related.add(candidate.id);
  }
  return related;
}

export default function KnowledgeGraph({
  nodes,
  layout,
  selectedNodeId,
  onSelect,
  onDragEnd,
}: KnowledgeGraphProps) {
  const accents = assignAccents(nodes);
  const positions = new Map(layout.map((entry) => [entry.id, entry]));
  const relatedIds = selectedNodeId ? relatedIdsOf(selectedNodeId, nodes) : new Set<string>();

  // One shared, live Vector3 per node: each KnowledgeNode writes its own
  // actual rendered position (drag target, idle float, or at rest) into its
  // entry every frame, and Connections reads the same entries every frame to
  // keep edges attached to a moving node continuously — with no React state
  // update (and therefore no re-render) driving any of it.
  const livePositionsRef: LivePositions = useRef(new Map<string, Vector3>());

  // Keeps the map in sync with the current layout — in a layout effect, not
  // the render body itself (react-hooks/refs disallows reading/writing a
  // ref's `.current` during render), but still synchronous and complete
  // before the browser paints or the next R3F frame ticks, so
  // KnowledgeNode's/Connections' own useFrame loops always see a fully
  // seeded map the first time they run.
  useLayoutEffect(() => {
    const map = livePositionsRef.current;
    const liveIds = new Set(layout.map((entry) => entry.id));
    for (const id of map.keys()) {
      if (!liveIds.has(id)) map.delete(id);
    }
    for (const entry of layout) {
      const existing = map.get(entry.id);
      if (existing) existing.set(...entry.position);
      else map.set(entry.id, new Vector3(...entry.position));
    }
  }, [layout]);

  return (
    <group>
      <Connections
        nodes={nodes}
        layout={layout}
        accents={accents}
        selectedNodeId={selectedNodeId}
        livePositions={livePositionsRef}
      />
      <CentralNode dimmed={selectedNodeId !== null} />
      {nodes.map((node) => {
        const entry = positions.get(node.id);
        if (!entry) return null;
        return (
          <KnowledgeNode
            key={node.id}
            node={node}
            position={toVector3(entry)}
            depth={entry.depth}
            accent={accents[node.id]}
            isSelected={node.id === selectedNodeId}
            isRelated={relatedIds.has(node.id)}
            isDimmed={
              selectedNodeId !== null && node.id !== selectedNodeId && !relatedIds.has(node.id)
            }
            onSelect={onSelect}
            onDragEnd={onDragEnd}
            livePositions={livePositionsRef}
          />
        );
      })}
    </group>
  );
}

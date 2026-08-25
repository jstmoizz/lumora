"use client";

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

  return (
    <group>
      <Connections nodes={nodes} layout={layout} accents={accents} selectedNodeId={selectedNodeId} />
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
          />
        );
      })}
    </group>
  );
}

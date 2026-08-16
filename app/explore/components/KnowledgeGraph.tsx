"use client";

import CentralNode from "./CentralNode";
import Connections from "./Connections";
import KnowledgeNode from "./KnowledgeNode";
import { KNOWLEDGE_EDGES, KNOWLEDGE_NODES } from "../data";

interface KnowledgeGraphProps {
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

function relatedIdsOf(nodeId: string): Set<string> {
  const related = new Set<string>();
  for (const edge of KNOWLEDGE_EDGES) {
    if (edge.from === nodeId) related.add(edge.to);
    if (edge.to === nodeId) related.add(edge.from);
  }
  return related;
}

export default function KnowledgeGraph({
  selectedNodeId,
  onSelect,
}: KnowledgeGraphProps) {
  const relatedIds = selectedNodeId
    ? relatedIdsOf(selectedNodeId)
    : new Set<string>();

  return (
    <group>
      <Connections selectedNodeId={selectedNodeId} />
      <CentralNode dimmed={selectedNodeId !== null} />
      {KNOWLEDGE_NODES.map((node) => (
        <KnowledgeNode
          key={node.id}
          node={node}
          isSelected={node.id === selectedNodeId}
          isRelated={relatedIds.has(node.id)}
          isDimmed={selectedNodeId !== null && node.id !== selectedNodeId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

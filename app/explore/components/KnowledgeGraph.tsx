"use client";

import CentralNode from "./CentralNode";
import ConceptConnections from "./ConceptConnections";
import Connections from "./Connections";
import ExpandedConceptNode from "./ExpandedConceptNode";
import KnowledgeNode from "./KnowledgeNode";
import {
  EXPANDED_CONCEPTS,
  KNOWLEDGE_EDGES,
  KNOWLEDGE_NODES,
  conceptPosition,
} from "../data";
import { expansionStateFor } from "../progress";
import type { TopicProgress } from "@/lib/supabase/topic-progress";

interface KnowledgeGraphProps {
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
  progress: Record<string, TopicProgress>;
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
  progress,
}: KnowledgeGraphProps) {
  // The core topic that should read as "in focus" for the existing
  // core-dimming scheme — either the literally selected core topic, or the
  // parent of a selected expanded concept, so opening a concept highlights
  // its topic instead of dimming it into oblivion. When nothing (or a core
  // topic) is selected this is exactly `selectedNodeId`, so every existing
  // core-topic interaction is unaffected.
  const selectedConcept = selectedNodeId
    ? (EXPANDED_CONCEPTS.find((concept) => concept.id === selectedNodeId) ??
      null)
    : null;
  const focusedCoreId = selectedConcept
    ? selectedConcept.parentId
    : selectedNodeId;

  const relatedIds = focusedCoreId ? relatedIdsOf(focusedCoreId) : new Set<string>();

  return (
    <group>
      <Connections selectedNodeId={focusedCoreId} progress={progress} />
      <ConceptConnections progress={progress} />
      <CentralNode dimmed={selectedNodeId !== null} />
      {KNOWLEDGE_NODES.map((node) => (
        <KnowledgeNode
          key={node.id}
          node={node}
          isSelected={node.id === selectedNodeId}
          isRelated={relatedIds.has(node.id)}
          isDimmed={focusedCoreId !== null && node.id !== focusedCoreId && !relatedIds.has(node.id)}
          onSelect={onSelect}
          studyCount={progress[node.id]?.studyCount}
        />
      ))}
      {EXPANDED_CONCEPTS.map((concept) => (
        <ExpandedConceptNode
          key={concept.id}
          concept={concept}
          position={conceptPosition(concept)}
          expansionState={expansionStateFor(progress[concept.parentId]?.studyCount)}
          isSelected={concept.id === selectedNodeId}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

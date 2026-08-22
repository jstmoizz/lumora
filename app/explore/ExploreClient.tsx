"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import ScenePlaceholder from "./ScenePlaceholder";
import StaticFallback from "./StaticFallback";
import TopicControls from "./TopicControls";
import TopicPanel from "./TopicPanel";
import { EXPANDED_CONCEPTS, KNOWLEDGE_NODES } from "./data";
import { expansionStateFor } from "./progress";
import { useReducedMotion } from "./useReducedMotion";
import { useWebglSupported } from "./webgl";
import { recordTopicStudied } from "@/lib/supabase/topic-progress-actions";
import type { TopicProgress } from "@/lib/supabase/topic-progress";

// Keeps three/@react-three/* entirely out of every bundle except the one
// that actually renders this scene, and out of the server-rendered HTML.
const Scene = dynamic(() => import("./components/Scene"), {
  ssr: false,
  loading: () => <ScenePlaceholder />,
});

interface ExploreClientProps {
  progress: Record<string, TopicProgress>;
}

export default function ExploreClient({ progress }: ExploreClientProps) {
  // Both hooks default to their SSR-safe "false" snapshot and self-correct
  // against the real client value before paint (see useReducedMotion /
  // useWebglSupported) — no manual mount-detection effect needed.
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebglSupported();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Remembers whichever HTML control triggered a selection (a 3D-node click
  // has none) so "Back to overview" can return focus to it.
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // Mirrors the last core topic id study progress was recorded for, so
  // handleSelect can tell "a genuinely new core topic was chosen" apart
  // from "the already-recorded topic is still in context" — only the
  // former should record study progress. A ref rather than reading
  // `selectedNodeId` directly keeps handleSelect's identity stable and
  // avoids any dependency on React's render timing.
  const recordedNodeIdRef = useRef<string | null>(null);

  const handleSelect = useCallback(
    (id: string, trigger?: HTMLElement | null) => {
      lastTriggerRef.current = trigger ?? null;
      setSelectedNodeId(id);

      // Only ever records a *core* topic (Phase 4.2 behavior, unchanged) —
      // selecting an expanded concept (Phase 4.3) is interaction-only and
      // never touches topic_progress; see the Phase 4.3 report for why.
      // Only fires from a real click/keyboard-activation event (never a
      // re-render or effect), and only once per genuine transition into a
      // topic — re-clicking the already-recorded topic, or browsing one of
      // its concepts and coming back to it, is a no-op here, so this can
      // never turn into a render-loop or rapid-double-count. Fire-and-
      // forget: Explore's own UI never waits on this, and a failed write is
      // swallowed quietly rather than shown to the user (see
      // recordTopicStudied's own error handling).
      const isCoreTopic = KNOWLEDGE_NODES.some((node) => node.id === id);
      if (isCoreTopic && id !== recordedNodeIdRef.current) {
        recordedNodeIdRef.current = id;
        recordTopicStudied(id).catch(() => {});
      }
    },
    [],
  );

  const handleBack = useCallback(() => {
    setSelectedNodeId(null);
    recordedNodeIdRef.current = null;
    lastTriggerRef.current?.focus();
    lastTriggerRef.current = null;
  }, []);

  // The core topic currently in context for TopicPanel — either the one
  // literally selected, or the parent of a selected expanded concept, so
  // the panel always has a topic to anchor to.
  const selectedConcept = selectedNodeId
    ? (EXPANDED_CONCEPTS.find((concept) => concept.id === selectedNodeId) ??
      null)
    : null;
  const contextCoreId = selectedConcept
    ? selectedConcept.parentId
    : selectedNodeId;
  const contextCoreNode = contextCoreId
    ? (KNOWLEDGE_NODES.find((node) => node.id === contextCoreId) ?? null)
    : null;
  const topicExpansionState = expansionStateFor(
    contextCoreNode ? progress[contextCoreNode.id]?.studyCount : undefined,
  );
  const relatedConcepts = contextCoreNode
    ? EXPANDED_CONCEPTS.filter(
        (concept) => concept.parentId === contextCoreNode.id,
      )
    : [];

  const showScene = !reducedMotion && webglSupported;

  return (
    <div className="flex flex-1 flex-col">
      <div
        aria-label="Interactive 3D knowledge space. Use the topic list below for keyboard access."
        className="relative h-[65vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-zinc-800 bg-[#08070c] sm:h-[70vh]"
      >
        {showScene ? (
          <Scene
            selectedNodeId={selectedNodeId}
            onSelect={handleSelect}
            progress={progress}
          />
        ) : (
          <StaticFallback
            selectedNodeId={selectedNodeId}
            onSelect={handleSelect}
          />
        )}

        {contextCoreNode && (
          <TopicPanel
            node={contextCoreNode}
            concept={selectedConcept}
            expansionState={topicExpansionState}
            relatedConcepts={relatedConcepts}
            onBack={handleBack}
            onSelect={handleSelect}
          />
        )}
      </div>

      <TopicControls selectedNodeId={selectedNodeId} onSelect={handleSelect} />
    </div>
  );
}

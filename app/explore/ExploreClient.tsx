"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import ScenePlaceholder from "./ScenePlaceholder";
import StaticFallback from "./StaticFallback";
import TopicControls from "./TopicControls";
import TopicPanel from "./TopicPanel";
import { KNOWLEDGE_NODES } from "./data";
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

  // Mirrors selectedNodeId so handleSelect can tell "a genuinely new topic
  // was chosen" apart from "the already-selected topic was clicked again" —
  // only the former should record study progress. A ref rather than reading
  // `selectedNodeId` directly keeps handleSelect's identity stable and
  // avoids any dependency on React's render timing.
  const recordedNodeIdRef = useRef<string | null>(null);

  const handleSelect = useCallback(
    (id: string, trigger?: HTMLElement | null) => {
      lastTriggerRef.current = trigger ?? null;
      setSelectedNodeId(id);

      // Only fires from a real click/keyboard-activation event (never from
      // a re-render or effect), and only once per genuine transition into a
      // topic — re-clicking the already-selected topic is a no-op here, so
      // this can never turn into a render-loop or rapid-double-count of
      // study progress. Fire-and-forget: Explore's own UI never waits on
      // this, and a failed write is swallowed quietly rather than shown to
      // the user (see recordTopicStudied's own error handling).
      if (id !== recordedNodeIdRef.current) {
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

  const selectedNode = selectedNodeId
    ? (KNOWLEDGE_NODES.find((node) => node.id === selectedNodeId) ?? null)
    : null;

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

        {selectedNode && <TopicPanel node={selectedNode} onBack={handleBack} />}
      </div>

      <TopicControls selectedNodeId={selectedNodeId} onSelect={handleSelect} />
    </div>
  );
}

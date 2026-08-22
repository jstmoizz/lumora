"use client";

import { useEffect, useRef } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  KNOWLEDGE_EDGES,
  KNOWLEDGE_NODES,
  type ExpandedConcept,
  type KnowledgeNode,
} from "./data";
import type { ExpansionState } from "./progress";

interface TopicPanelProps {
  // The core topic in context — either the one directly selected, or the
  // parent of the selected concept. TopicPanel is only ever rendered when
  // this is non-null (see ExploreClient).
  node: KnowledgeNode;
  // Set when a concept, rather than the core topic itself, is what's
  // currently being shown.
  concept: ExpandedConcept | null;
  // `node`'s own expansion state (Phase 4.3) — only relevant, and only
  // rendered, when `concept` is null; a concept's own panel doesn't need to
  // re-show its siblings' reveal state.
  expansionState: ExpansionState;
  // `node`'s own expanded concepts, regardless of state — this component
  // decides what (if anything) to show about them based on `expansionState`.
  relatedConcepts: ExpandedConcept[];
  onBack: () => void;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

function relatedTopicsFor(nodeId: string): KnowledgeNode[] {
  const relatedIds = KNOWLEDGE_EDGES.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId,
  ).map((edge) => (edge.from === nodeId ? edge.to : edge.from));

  return KNOWLEDGE_NODES.filter((candidate) => relatedIds.includes(candidate.id));
}

// HTML, not inside the Canvas. A compact contextual panel, not a modal —
// desktop gets a floating side card, mobile gets a bottom sheet-style strip.
//
// Also the accessible entry point into expanded concepts (Phase 4.3):
// reduced-motion and keyboard users discover and select a topic's revealed
// concepts here, as real buttons, rather than needing 3D hover/click — this
// panel already renders identically regardless of whether the 3D Scene or
// StaticFallback is showing, so no separate reduced-motion path was needed.
export default function TopicPanel({
  node,
  concept,
  expansionState,
  relatedConcepts,
  onBack,
  onSelect,
}: TopicPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const displayId = concept ? concept.id : node.id;
  const title = concept ? concept.label : node.label;
  const summary = concept ? concept.summary : node.summary;

  // Moves focus into the panel every time what's displayed changes —
  // including switching from a topic to one of its concepts, or between
  // topics.
  useEffect(() => {
    headingRef.current?.focus();
  }, [displayId]);

  const relatedTopics = relatedTopicsFor(node.id);

  return (
    <div
      role="region"
      aria-label={`${title} details`}
      className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-zinc-800 bg-[#0c0b12]/95 p-4 backdrop-blur-sm sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-4 sm:w-72"
    >
      {/*
        Fixed light colors, not the `text-foreground`/`text-zinc-*` theme
        tokens used elsewhere in the app: this panel's background is always
        dark (it sits on the canvas's fixed dark clear color), regardless of
        whether the rest of Lumora is in light or dark mode, so its text
        must stay fixed-light too rather than flipping to near-black in
        light mode.
      */}
      {/*
        This heading takes programmatic focus on every selection change (see
        the effect above), so it needs its own visible focus style — the
        default outline is suppressed because it doesn't read well against
        this panel's fixed-dark background, not because focus should be
        invisible here.
      */}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="rounded-sm text-sm font-semibold text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-400/80"
      >
        {title}
      </h2>
      {concept && (
        <p className="mt-1 text-xs text-zinc-500">Part of {node.label}</p>
      )}
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{summary}</p>

      {!concept && relatedTopics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {relatedTopics.map((related) => (
            <span
              key={related.id}
              className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500"
            >
              {related.label}
            </span>
          ))}
        </div>
      )}

      {!concept && expansionState === "hinted" && relatedConcepts.length > 0 && (
        <p className="mt-3 text-xs text-zinc-500">
          {relatedConcepts.length} related concept
          {relatedConcepts.length === 1 ? "" : "s"} — keep studying {node.label}{" "}
          to reveal {relatedConcepts.length === 1 ? "it" : "them"}.
        </p>
      )}

      {!concept && expansionState === "revealed" && relatedConcepts.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-zinc-400">Related concepts</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {relatedConcepts.map((related) => (
              <button
                key={related.id}
                type="button"
                onClick={(event) => onSelect(related.id, event.currentTarget)}
                className="rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2 py-0.5 text-xs text-zinc-300 transition-colors hover:border-indigo-400/70 hover:text-zinc-100"
              >
                {related.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mt-4 gap-1.5 px-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
        Back to overview
      </Button>
    </div>
  );
}

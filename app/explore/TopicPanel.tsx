"use client";

import { useEffect, useRef } from "react";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KNOWLEDGE_EDGES, KNOWLEDGE_NODES, type KnowledgeNode } from "./data";

interface TopicPanelProps {
  node: KnowledgeNode;
  onBack: () => void;
}

function relatedTopicsFor(nodeId: string): KnowledgeNode[] {
  const relatedIds = KNOWLEDGE_EDGES.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId,
  ).map((edge) => (edge.from === nodeId ? edge.to : edge.from));

  return KNOWLEDGE_NODES.filter((candidate) => relatedIds.includes(candidate.id));
}

// HTML, not inside the Canvas. A compact contextual panel, not a modal —
// desktop gets a floating side card, mobile gets a bottom sheet-style strip.
export default function TopicPanel({ node, onBack }: TopicPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Moves focus into the panel every time the selected topic changes
  // (including switching directly from one topic to another).
  useEffect(() => {
    headingRef.current?.focus();
  }, [node.id]);

  const relatedTopics = relatedTopicsFor(node.id);

  return (
    <div
      role="region"
      aria-label={`${node.label} details`}
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
        {node.label}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{node.summary}</p>

      {relatedTopics.length > 0 && (
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

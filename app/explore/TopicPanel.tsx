"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeftIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KnowledgeGraphNode } from "./data";

export interface RelatedItem {
  label: string;
  // Set when this related label already matches an existing node — clicking
  // it selects that node. `null` means it's still just a suggestion.
  nodeId: string | null;
}

interface TopicPanelProps {
  // The real, studied topic in context. Mutually exclusive with
  // `previewLabel` — ExploreClient guarantees at most one is set.
  node: KnowledgeGraphNode | null;
  // An unlocked-but-not-yet-studied topic being previewed.
  previewLabel: string | null;
  relatedItems: RelatedItem[];
  onBack: () => void;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
  onPreview: (label: string) => void;
  onDelete: (node: KnowledgeGraphNode) => void;
}

// HTML, not inside the Canvas — a floating card on desktop, a bottom sheet
// on mobile. Also the accessible entry point into related suggestions for
// reduced-motion and keyboard users.
export default function TopicPanel({
  node,
  previewLabel,
  relatedItems,
  onBack,
  onSelect,
  onPreview,
  onDelete,
}: TopicPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const displayId = node?.id ?? previewLabel;
  const title = node?.label ?? previewLabel;

  // Moves focus into the panel every time what's displayed changes.
  useEffect(() => {
    headingRef.current?.focus();
  }, [displayId]);

  if (!title) return null;

  const studyHref = `/generate?topic=${encodeURIComponent(title)}`;

  return (
    <div
      role="region"
      aria-label={`${title} details`}
      className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-zinc-800 bg-[#0c0b12]/95 p-4 backdrop-blur-sm sm:inset-x-auto sm:top-4 sm:right-4 sm:bottom-4 sm:w-72 sm:overflow-y-auto"
    >
      {/* Fixed light colors: this panel sits on the canvas's fixed-dark
          background regardless of site theme. Custom focus ring since the
          default outline doesn't read well here. */}
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="rounded-sm text-sm font-semibold text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-400/80"
      >
        {title}
      </h2>

      {node ? (
        <>
          {node.summary && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{node.summary}</p>
          )}
          <p className="mt-2 text-xs text-zinc-500">
            {node.activityCount} study session{node.activityCount === 1 ? "" : "s"}
            {node.quizCount > 0 && ` · ${node.quizCount} quiz${node.quizCount === 1 ? "" : "zes"}`}
            {node.flashcardCount > 0 &&
              ` · ${node.flashcardCount} flashcard set${node.flashcardCount === 1 ? "" : "s"}`}
          </p>

          {relatedItems.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-medium text-zinc-400">Related</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {relatedItems.map((related) => (
                  <button
                    key={related.label}
                    type="button"
                    onClick={(event) =>
                      related.nodeId
                        ? onSelect(related.nodeId, event.currentTarget)
                        : onPreview(related.label)
                    }
                    className={
                      related.nodeId
                        ? "rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2 py-0.5 text-xs text-zinc-300 transition-colors hover:border-indigo-400/70 hover:text-zinc-100"
                        : "rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:border-zinc-500 hover:text-zinc-300"
                    }
                  >
                    {related.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Button type="button" size="sm" className="gap-1.5" asChild>
              <Link href={studyHref}>
                <SparklesIcon aria-hidden="true" className="size-3.5" />
                Study Topic
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDelete(node)}
              className="gap-1.5 px-2 text-xs text-zinc-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2Icon aria-hidden="true" className="size-3.5" />
              Delete Topic
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Not studied yet — an unlocked suggestion based on what you already know.
          </p>
          <Button type="button" size="sm" className="mt-4 gap-1.5" asChild>
            <Link href={studyHref}>
              <SparklesIcon aria-hidden="true" className="size-3.5" />
              Study this topic
            </Link>
          </Button>
        </>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mt-2 gap-1.5 px-2 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
        Back to overview
      </Button>
    </div>
  );
}

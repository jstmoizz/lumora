"use client";

import { KNOWLEDGE_NODES } from "./data";

interface TopicControlsProps {
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

// The real accessibility surface for topic selection. 3D nodes and the
// StaticFallback map both call the same onSelect — this list is always
// present (regardless of which of those is showing) so keyboard and
// screen-reader users always have a reachable, focusable way to select a
// topic, independent of canvas/pointer support.
export default function TopicControls({
  selectedNodeId,
  onSelect,
}: TopicControlsProps) {
  return (
    <nav aria-label="Knowledge topics" className="mt-4">
      <ul className="flex flex-wrap justify-center gap-2">
        {KNOWLEDGE_NODES.map((node) => {
          const isSelected = node.id === selectedNodeId;
          return (
            <li key={node.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={(event) => onSelect(node.id, event.currentTarget)}
                className={
                  isSelected
                    ? "rounded-lg border border-indigo-400/60 bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-foreground"
                    : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                }
              >
                {node.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

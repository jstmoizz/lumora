"use client";

import { CENTRAL_NODE, KNOWLEDGE_EDGES, KNOWLEDGE_NODES } from "./data";

// Hand-placed 2D positions echoing the 3D composition's asymmetry (not a
// neat ring) — independent of the 3D `position` values, since a good 3D
// layout and a good flat layout aren't the same layout.
const LAYOUT: Record<string, { top: string; left: string }> = {
  ai: { top: "20%", left: "70%" },
  algorithms: { top: "24%", left: "20%" },
  "data-structures": { top: "52%", left: "9%" },
  databases: { top: "80%", left: "32%" },
  networks: { top: "72%", left: "78%" },
  "software-engineering": { top: "44%", left: "90%" },
  mathematics: { top: "8%", left: "46%" },
};

interface StaticFallbackProps {
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

// A real, usable representation of the knowledge space when the 3D scene
// isn't shown (reduced motion or no WebGL) — not an error/unsupported
// message. Selecting a topic here drives the exact same state as the 3D
// scene and the TopicControls list below it.
export default function StaticFallback({
  selectedNodeId,
  onSelect,
}: StaticFallbackProps) {
  return (
    <div className="relative h-full w-full">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        {KNOWLEDGE_NODES.map((node) => {
          const pos = LAYOUT[node.id];
          return (
            <line
              key={`spoke-${node.id}`}
              x1="50%"
              y1="50%"
              x2={pos.left}
              y2={pos.top}
              stroke="currentColor"
              strokeOpacity={selectedNodeId === null || selectedNodeId === node.id ? 0.22 : 0.08}
              className="text-indigo-300"
            />
          );
        })}
        {KNOWLEDGE_EDGES.map((edge) => {
          const from = LAYOUT[edge.from];
          const to = LAYOUT[edge.to];
          const involvesSelected =
            selectedNodeId !== null &&
            (edge.from === selectedNodeId || edge.to === selectedNodeId);
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.left}
              y1={from.top}
              x2={to.left}
              y2={to.top}
              stroke="currentColor"
              strokeOpacity={
                selectedNodeId === null ? 0.14 : involvesSelected ? 0.3 : 0.05
              }
              className="text-violet-300"
            />
          );
        })}
      </svg>

      {/*
        Fixed light text, not `text-foreground`: this map's background is
        always dark regardless of site theme, so its labels must stay
        fixed-light rather than flipping to near-black in light mode.
      */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-zinc-100"
      >
        {CENTRAL_NODE.label}
      </div>

      {/*
        Pointer-operable only: `TopicControls` below renders this exact same
        set of topics as real, labeled, keyboard-focusable buttons (the
        app's designated accessibility surface, per its own comment), so
        these overlay buttons would otherwise be a second, redundant set of
        tab stops with the same accessible names. `tabIndex={-1}` +
        `aria-hidden` keep them clickable for mouse/touch while removing
        that duplication for keyboard and screen-reader users.
      */}
      {KNOWLEDGE_NODES.map((node) => {
        const pos = LAYOUT[node.id];
        const isSelected = node.id === selectedNodeId;
        return (
          <button
            key={node.id}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={(event) => onSelect(node.id, event.currentTarget)}
            style={{ top: pos.top, left: pos.left }}
            className={
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
              (isSelected
                ? "border-indigo-400/70 bg-indigo-500/15 text-zinc-100"
                : "border-zinc-700 bg-[#0c0b12] text-zinc-400 hover:border-zinc-500 hover:text-zinc-100")
            }
          >
            {node.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { CENTRAL_NODE, type KnowledgeGraphNode } from "./data";
import { computeGraphLayout, toPercentPosition } from "./graphLayout";

interface StaticFallbackProps {
  nodes: KnowledgeGraphNode[];
  selectedNodeId: string | null;
  onSelect: (id: string, trigger?: HTMLElement | null) => void;
}

// A real, usable representation of the knowledge graph when the 3D scene
// isn't shown (reduced motion or no WebGL) — not an error/unsupported
// message. Selecting a topic here drives the exact same state as the 3D
// scene and the Topics list beside/below it. Positions come from the same
// computeGraphLayout() the 3D Scene uses (a 2D projection of it), not a
// hand-placed map — necessary once node ids/counts are per-user and
// arbitrary rather than a fixed set of 7.
export default function StaticFallback({ nodes, selectedNodeId, onSelect }: StaticFallbackProps) {
  const layout = computeGraphLayout(nodes);
  const maxRadius = layout.reduce((max, entry) => Math.max(max, entry.radius), 1);
  const positions = new Map(layout.map((entry) => [entry.id, toPercentPosition(entry, maxRadius)]));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="relative h-full w-full">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        {nodes
          .filter((node) => node.parentId === null)
          .map((node) => {
            const pos = positions.get(node.id);
            if (!pos) return null;
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
        {nodes
          .filter((node) => node.parentId !== null)
          .map((node) => {
            const from = positions.get(node.parentId!);
            const to = positions.get(node.id);
            const parent = byId.get(node.parentId!);
            if (!from || !to || !parent) return null;
            const involvesSelected =
              selectedNodeId !== null && (node.id === selectedNodeId || parent.id === selectedNodeId);
            return (
              <line
                key={`${parent.id}-${node.id}`}
                x1={from.left}
                y1={from.top}
                x2={to.left}
                y2={to.top}
                stroke="currentColor"
                strokeOpacity={selectedNodeId === null ? 0.14 : involvesSelected ? 0.35 : 0.05}
                className={involvesSelected ? "text-fuchsia-300" : "text-violet-300"}
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
        Pointer-operable only: the Topics list (OptionWheel on desktop, a
        chip row on mobile) renders this exact same set of topics as real,
        accessible controls, so these overlay buttons would otherwise be a
        second, redundant set of tab stops with the same accessible names.
        `tabIndex={-1}` + `aria-hidden` keep them clickable for mouse/touch
        while removing that duplication for keyboard and screen-reader users.
      */}
      {nodes.map((node) => {
        const pos = positions.get(node.id);
        if (!pos) return null;
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
                ? "border-fuchsia-400/70 bg-fuchsia-500/15 text-zinc-100"
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

// Five stops walking across Lumora's own brand gradient — indigo -> violet
// -> pink, the same three-stop identity as the header mark (LumoraMark.css'
// --mark-start/--mark-mid/--mark-end) and the Home hero shader
// (lumora.frag.ts, "Lumora's own palette"). Brighter/more saturated than a
// muted UI palette on purpose: these are meant to read as glowing light
// sources against near-black, not flat UI chips.
export type AccentId = "indigo" | "violet" | "orchid" | "magenta" | "rose";

export const NODE_ACCENTS: Record<AccentId, { color: string; emissive: string }> = {
  indigo: { color: "#4338ca", emissive: "#a5b4fc" }, // mark-start family
  violet: { color: "#5b21b6", emissive: "#c4b5fd" }, // mark-mid family
  orchid: { color: "#7e22a8", emissive: "#d8a8f0" }, // indigo/violet -> pink midpoint
  magenta: { color: "#9d174d", emissive: "#f472b6" }, // mark-end family, deeper
  rose: { color: "#a3123f", emissive: "#f9a8d4" }, // mark-end family, brightest
};

const ACCENT_CYCLE: AccentId[] = ["indigo", "violet", "orchid", "magenta", "rose"];

// The central Lumora element. Deliberately not a KnowledgeGraphNode: it has
// no `position` (it sits at the origin, rendered by CentralNode), is never a
// row in `knowledge_nodes` (virtual/implicit for every user — see
// supabase/schema.sql), and can never be selected as a `parentId` target by
// name since it isn't in the node list at all — every top-level node simply
// has `parentId === null`, which *means* "attached to Core."
export const CENTRAL_NODE = {
  id: "lumora-core",
  label: "Lumora Core",
  summary: "The root of your knowledge graph. Everything you study branches out from here.",
} as const;

/**
 * One topic the user has actually studied — mirrors a `knowledge_nodes` row
 * (see `lib/supabase/knowledge-graph.ts`). Deliberately holds no rendering
 * data (position, color, tier) — `graphLayout.ts` derives those from this shape
 * instead of storing them, same discipline `schema.sql`'s own comment on
 * this table calls for.
 */
export interface KnowledgeGraphNode {
  id: string;
  topicKey: string;
  label: string;
  summary: string | null;
  parentId: string | null;
  relatedLabels: string[];
  activityCount: number;
  quizCount: number;
  flashcardCount: number;
  createdAt: string;
  lastStudiedAt: string;
}

/**
 * Assigns each node a stable accent: top-level nodes (`parentId === null`)
 * cycle through the palette in creation order, so the same topic always
 * gets the same color across reloads; every descendant inherits its
 * top-level ancestor's accent, so a whole branch reads as one color family
 * (a "cluster"), rather than every node getting an independent color.
 */
export function assignAccents(nodes: KnowledgeGraphNode[]): Record<string, AccentId> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const accents: Record<string, AccentId> = {};

  const topLevel = nodes
    .filter((node) => node.parentId === null)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  topLevel.forEach((node, index) => {
    accents[node.id] = ACCENT_CYCLE[index % ACCENT_CYCLE.length];
  });

  function ancestorAccent(node: KnowledgeGraphNode): AccentId {
    if (accents[node.id]) return accents[node.id];
    if (node.parentId === null) return ACCENT_CYCLE[0];
    const parent = byId.get(node.parentId);
    return parent ? ancestorAccent(parent) : ACCENT_CYCLE[0];
  }

  for (const node of nodes) {
    if (!accents[node.id]) {
      accents[node.id] = ancestorAccent(node);
    }
  }

  return accents;
}

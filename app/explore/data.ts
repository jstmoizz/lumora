// Five stops across Lumora's brand gradient (indigo -> violet -> pink),
// brighter than a flat UI palette since these read as glowing light sources.
export type AccentId = "indigo" | "violet" | "orchid" | "magenta" | "rose";

export const NODE_ACCENTS: Record<AccentId, { color: string; emissive: string }> = {
  indigo: { color: "#4338ca", emissive: "#a5b4fc" }, // mark-start family
  violet: { color: "#5b21b6", emissive: "#c4b5fd" }, // mark-mid family
  orchid: { color: "#7e22a8", emissive: "#d8a8f0" }, // indigo/violet -> pink midpoint
  magenta: { color: "#9d174d", emissive: "#f472b6" }, // mark-end family, deeper
  rose: { color: "#a3123f", emissive: "#f9a8d4" }, // mark-end family, brightest
};

const ACCENT_CYCLE: AccentId[] = ["indigo", "violet", "orchid", "magenta", "rose"];

// Lumora Core. Deliberately not a KnowledgeGraphNode — it's virtual, never
// a row in `knowledge_nodes`; a top-level node's `parentId === null` is what
// means "attached to Core."
export const CENTRAL_NODE = {
  id: "lumora-core",
  label: "Lumora Core",
  summary: "The root of your knowledge graph. Everything you study branches out from here.",
} as const;

/**
 * One topic the user has studied — mirrors a `knowledge_nodes` row. Holds
 * no rendering data (position, color); graphLayout.ts derives that instead.
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
 * Assigns each node a stable accent: top-level nodes cycle through the
 * palette in creation order; every descendant inherits its top-level
 * ancestor's accent, so a whole branch reads as one color family.
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

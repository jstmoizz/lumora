// A small, restrained palette in Lumora's own indigo/violet family (plus two
// cooler accents for variety) — not a per-node rainbow. Referenced by id so
// KNOWLEDGE_NODES stays readable and every node's colors stay in sync with
// this single source.
export type AccentId = "indigo" | "violet" | "blueIndigo" | "mutedBlue" | "mutedTeal";

export const NODE_ACCENTS: Record<AccentId, { color: string; emissive: string }> = {
  indigo: { color: "#5c57a3", emissive: "#7d76d9" },
  violet: { color: "#6b4f9e", emissive: "#9b7fe0" },
  blueIndigo: { color: "#4d5a9e", emissive: "#7b87e0" },
  mutedBlue: { color: "#3f5a78", emissive: "#6f92b8" },
  mutedTeal: { color: "#3c6b6b", emissive: "#5fa3a0" },
};

export interface KnowledgeNode {
  id: string;
  label: string;
  summary: string;
  // Hand-authored, not force-directed or random — a deliberately asymmetric
  // arrangement (varied radius/height/depth) so the composition reads as an
  // intentional space rather than a mechanical ring of evenly spaced nodes.
  position: [number, number, number];
  // Drives subtle visual hierarchy (geometry size, default connection
  // opacity) — felt rather than labeled. "core" = foundational topics the
  // others build on; kept to a minority so the effect stays a nudge, not a
  // hierarchy chart.
  tier: "core" | "secondary";
  // Keys into NODE_ACCENTS — restrained per-node color identity, not a
  // functional distinction.
  accent: AccentId;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
}

// The central Lumora element. Deliberately not a KnowledgeNode: it has no
// `position` (it sits at the origin, rendered by CentralNode) and must never
// be a valid `from`/`to` on a KnowledgeEdge — every topic already connects to
// it implicitly (see Connections' spokes), so an explicit edge would be a
// duplicate representation of the same relationship.
export const CENTRAL_NODE = {
  id: "lumora",
  label: "Lumora",
  summary:
    "The core of the knowledge space. Every topic here connects back to how Lumora helps you learn.",
} as const;

// Positions are deliberately spread across a wide z-range (not a flat disc)
// so orbiting reveals real depth, not just rotation. The three "core" nodes
// are the ones already framed as foundational in their own summaries below
// (AI names itself as the field behind Lumora, Algorithms names itself a
// foundation for the rest, Mathematics names itself the layer underneath
// Algorithms/AI/data) — tier follows the content instead of being an
// arbitrary visual choice.
export const KNOWLEDGE_NODES: KnowledgeNode[] = [
  {
    id: "ai",
    label: "Artificial Intelligence",
    summary:
      "Systems that learn patterns from data and use them to reason, predict, or generate — the field behind Lumora itself.",
    position: [2.7, 0.7, 1.6],
    tier: "core",
    accent: "indigo",
  },
  {
    id: "algorithms",
    label: "Algorithms",
    summary:
      "Step-by-step procedures for solving problems efficiently — a foundation nearly every other topic here builds on.",
    position: [-2.6, 1.3, 1.1],
    tier: "core",
    accent: "violet",
  },
  {
    id: "data-structures",
    label: "Data Structures",
    summary:
      "Ways of organizing information so it can be stored, searched, and updated efficiently.",
    position: [-1.9, -1.1, 0.8],
    tier: "secondary",
    accent: "mutedBlue",
  },
  {
    id: "databases",
    label: "Databases",
    summary:
      "Systems for storing and querying structured information reliably, at scale.",
    position: [1.7, -1.6, 2.3],
    tier: "secondary",
    accent: "mutedTeal",
  },
  {
    id: "networks",
    label: "Networks",
    summary:
      "How computers exchange information — the protocols and infrastructure that connect everything else.",
    position: [3.1, -0.5, -1.7],
    tier: "secondary",
    accent: "blueIndigo",
  },
  {
    id: "software-engineering",
    label: "Software Engineering",
    summary:
      "Practices for designing, building, and maintaining software that stays reliable as it grows.",
    position: [-3.0, -0.3, -2.6],
    tier: "secondary",
    accent: "mutedBlue",
  },
  {
    id: "mathematics",
    label: "Mathematics",
    summary:
      "The formal language underneath algorithms, AI, and data — logic, structure, and proof.",
    position: [0.2, 2.0, -3.4],
    tier: "core",
    accent: "blueIndigo",
  },
];

// Genuine topic relationships, in addition to the implicit spoke every node
// has to the central element. Kept deliberately few (see Connections) so the
// scene reads as a handful of meaningful relationships, not a dense graph.
export const KNOWLEDGE_EDGES: KnowledgeEdge[] = [
  { from: "algorithms", to: "data-structures" },
  { from: "ai", to: "mathematics" },
  { from: "databases", to: "software-engineering" },
];

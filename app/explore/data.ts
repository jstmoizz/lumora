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

// ============================================================================
// Expanded concepts (Phase 4.3) — a second, smaller layer nested under a
// core topic rather than a peer of it. Kept structurally distinct from
// KnowledgeNode (own type, own id namespace, no `tier`/`accent`) so the
// application can always tell "core topic" and "expanded concept" apart by
// type rather than by convention or a presentation-only flag. Visibility is
// derived at render time from the viewer's own topic_progress (see
// `expansionStateFor` in `./progress.ts`) — this array itself holds no
// per-user state.
// ============================================================================

export interface ExpandedConcept {
  id: string;
  // The core topic this concept belongs to — always a KNOWLEDGE_NODES id.
  parentId: string;
  label: string;
  summary: string;
  // Deterministic, hand-authored offset from the parent's own `position`
  // (not an absolute world position) — see `conceptPosition` below. Kept
  // small and asymmetric per pair, the same authoring approach as
  // KNOWLEDGE_NODES' own positions, so concepts read as clustered around
  // their parent rather than placed at random.
  offset: [number, number, number];
  // A short, human-readable description of how this concept relates to its
  // parent — shown in TopicPanel, not used for any graph traversal.
  relationship: string;
}

// Deliberately small and curated: two concepts per core topic, not an
// open-ended or generated set. This is the seed of the "expanded" layer,
// not a final exhaustive one.
export const EXPANDED_CONCEPTS: ExpandedConcept[] = [
  {
    id: "sorting",
    parentId: "algorithms",
    label: "Sorting",
    summary:
      "Algorithms that arrange data into a defined order — one of the first problems most algorithmic thinking is built on.",
    offset: [0.75, 0.35, 0.45],
    relationship: "A foundational technique within Algorithms.",
  },
  {
    id: "graph-algorithms",
    parentId: "algorithms",
    label: "Graph Algorithms",
    summary:
      "Techniques for traversing and analyzing networks of connected nodes — from shortest paths to reachability.",
    offset: [-0.55, -0.5, 0.65],
    relationship: "A more advanced branch of Algorithms.",
  },
  {
    id: "trees",
    parentId: "data-structures",
    label: "Trees",
    summary:
      "Hierarchical structures where each element connects to a small set of children — the shape behind file systems, parsers, and more.",
    offset: [0.6, 0.55, -0.4],
    relationship: "A core structure within Data Structures.",
  },
  {
    id: "hash-tables",
    parentId: "data-structures",
    label: "Hash Tables",
    summary:
      "Structures that map keys to values for near-constant-time lookup, using a function that spreads keys across storage.",
    offset: [-0.7, -0.3, 0.5],
    relationship: "Another core structure within Data Structures.",
  },
  {
    id: "sql",
    parentId: "databases",
    label: "SQL",
    summary:
      "The standard language for querying and manipulating structured, relational data.",
    offset: [0.65, 0.4, 0.5],
    relationship: "The primary interface to Databases.",
  },
  {
    id: "indexing",
    parentId: "databases",
    label: "Indexing",
    summary:
      "Auxiliary structures that let a database find rows quickly instead of scanning every one.",
    offset: [-0.5, -0.55, -0.45],
    relationship: "A performance technique within Databases.",
  },
  {
    id: "machine-learning",
    parentId: "ai",
    label: "Machine Learning",
    summary:
      "Systems that improve at a task by learning patterns from data rather than following explicit rules.",
    offset: [0.7, -0.4, 0.5],
    relationship: "The dominant modern approach within AI.",
  },
  {
    id: "neural-networks",
    parentId: "ai",
    label: "Neural Networks",
    summary:
      "Layered, trainable models loosely inspired by biological neurons — the basis of most current machine learning.",
    offset: [-0.6, 0.5, -0.55],
    relationship: "A specific family of models within AI.",
  },
  {
    id: "tcp-ip",
    parentId: "networks",
    label: "TCP/IP",
    summary:
      "The core protocol suite that lets independent networks address, route, and reliably deliver data to each other.",
    offset: [0.6, 0.5, 0.4],
    relationship: "The foundational protocol suite within Networks.",
  },
  {
    id: "routing",
    parentId: "networks",
    label: "Routing",
    summary:
      "How data finds a path across many interconnected networks to reach its destination.",
    offset: [-0.7, -0.35, -0.5],
    relationship: "A core mechanism within Networks.",
  },
  {
    id: "testing",
    parentId: "software-engineering",
    label: "Testing",
    summary:
      "Practices for verifying that software behaves as intended, before and after it changes.",
    offset: [0.65, 0.45, 0.4],
    relationship: "A core discipline within Software Engineering.",
  },
  {
    id: "design-patterns",
    parentId: "software-engineering",
    label: "Design Patterns",
    summary:
      "Reusable, named solutions to recurring problems in software design.",
    offset: [-0.55, -0.5, -0.55],
    relationship: "A shared vocabulary within Software Engineering.",
  },
  {
    id: "probability",
    parentId: "mathematics",
    label: "Probability",
    summary:
      "The mathematics of uncertainty — the language most of machine learning and statistics is written in.",
    offset: [0.7, -0.4, 0.4],
    relationship: "A core branch of Mathematics.",
  },
  {
    id: "linear-algebra",
    parentId: "mathematics",
    label: "Linear Algebra",
    summary:
      "The study of vectors, matrices, and linear transformations — the computational backbone behind graphics and machine learning alike.",
    offset: [-0.6, 0.45, -0.5],
    relationship: "Another core branch of Mathematics.",
  },
];

/**
 * A concept's absolute 3D position: its parent's own (hand-authored,
 * unchanged) position plus the concept's own small offset. Computed rather
 * than stored, so a concept always stays spatially attached to its parent —
 * there's exactly one source of truth for where a topic sits.
 */
export function conceptPosition(
  concept: ExpandedConcept,
): [number, number, number] {
  const parent = KNOWLEDGE_NODES.find((node) => node.id === concept.parentId);
  if (!parent) return concept.offset;
  return [
    parent.position[0] + concept.offset[0],
    parent.position[1] + concept.offset[1],
    parent.position[2] + concept.offset[2],
  ];
}

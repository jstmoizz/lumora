import { hashToUnit } from "./deterministicHash";
import type { KnowledgeGraphNode } from "./data";

export interface LayoutEntry {
  id: string;
  // 0 = top-level (attached directly to Core), 1+ = nested under another
  // studied topic — still used by KnowledgeNode for its icosahedron/larger
  // vs octahedron/smaller geometry choice.
  depth: number;
  position: [number, number, number];
}

// Golden angle (~137.5°): the standard way to place points one at a time,
// each depending only on its own index, that still end up evenly spread —
// no need to know the eventual total count up front. That "never look
// ahead" property is exactly what keeps this whole layout stable as new
// nodes are added (see computeGraphLayout's own comment below).
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// How far a top-level node sits from Core, and how much farther each
// subsequent generation reaches beyond its own parent — additive, so a
// depth-2 node's actual distance from Core is CORE_CLEARANCE +
// GENERATION_STEP, not a separately-tuned constant per depth.
const CORE_CLEARANCE = 2.4;
const GENERATION_STEP = 1.35;

// Flattens the vertical spread a little so the graph reads as one coherent
// "space" rather than nodes scattered in a full sphere around Core — real
// 3D depth without turning into a chaotic ball.
const Y_SQUASH = 0.65;

// Minimum center-to-center distance any two nodes must keep. KnowledgeNode's
// own geometry (CORE_RADIUS 0.34 / SECONDARY_RADIUS 0.24) plus Glow's
// biggest halo (haloScaleOuter 3 on a 0.34 radius ≈ 1.0) comfortably fits
// inside this, so two nodes at exactly this distance still read as visually
// distinct light sources rather than a single overlapping blob.
const MIN_SEPARATION = 0.85;
// Deterministic nudge growth per failed placement attempt — no extra
// randomness, just walks the same already-chosen direction further out.
const COLLISION_STEP = 0.35;
const MAX_COLLISION_ATTEMPTS = 6;

/** Van der Corput low-discrepancy sequence. Unlike an even division
 * (i / total), every prefix of this sequence is already well-spread across
 * [0,1) on its own — index 3's value never has to change just because a
 * 4th point showed up later. That's the other half (alongside the golden
 * angle above) of what makes per-sibling placement stable under append. */
function vanDerCorput(index: number, base = 2): number {
  let n = index;
  let denominator = 1;
  let result = 0;
  while (n > 0) {
    denominator *= base;
    result += (n % base) / denominator;
    n = Math.floor(n / base);
  }
  return result;
}

/** A deterministic unit direction for the i-th point in some group (e.g. the
 * i-th child of a given parent), using only `index` — never the group's
 * eventual total size. `seed` offsets the azimuth so unrelated groups (two
 * different parents' children) don't all fan out in an identical pattern. */
function sphereDirection(index: number, seed: number): [number, number, number] {
  const azimuth = (index + seed) * GOLDEN_ANGLE;
  const polar = Math.acos(1 - 2 * vanDerCorput(index + 1));
  const sinPolar = Math.sin(polar);
  return [sinPolar * Math.cos(azimuth), Math.cos(polar), sinPolar * Math.sin(azimuth)];
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function tooClose(
  candidate: [number, number, number],
  placed: ReadonlyMap<string, [number, number, number]>,
): boolean {
  for (const existing of placed.values()) {
    if (distance(candidate, existing) < MIN_SEPARATION) return true;
  }
  return false;
}

/**
 * Deterministic, true-3D, relationship-aware, append-stable graph layout.
 *
 * No force simulation and no full-graph relaxation — each node's position is
 * computed once, from its parent's already-fixed position plus a direction
 * derived purely from its index among siblings (golden angle + Van der
 * Corput, both "no lookahead" sequences — see their own comments). Nodes are
 * placed in a single top-down pass (Core outward), so a child is always
 * positioned after its parent's final position is already known, and a
 * newly-appended node — whichever parent it lands under — is always the
 * *last* sibling considered at its level, so it can never change where an
 * earlier sibling (or any other already-placed node) ended up. That's what
 * keeps the whole graph visually stable as it grows, without needing to
 * remember anything across calls.
 *
 * This stability guarantee covers *addition* only (the actual complaint
 * this rewrite fixes) — a node's direction is derived from its rank among
 * still-existing siblings, so deleting an earlier sibling can shift a later
 * one. Not a regression: the previous implementation had no stability
 * under any change, and a delete already triggers a fresh `nodes` array
 * (and therefore an already-expected fresh layout) via `router.refresh()`.
 */
export function computeGraphLayout(nodes: KnowledgeGraphNode[]): LayoutEntry[] {
  const byParent = new Map<string | null, KnowledgeGraphNode[]>();
  for (const node of nodes) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const entries = new Map<string, LayoutEntry>();
  // Every already-placed position, Core included, so a new node avoids
  // overlapping *any* nearby cluster — not just its own siblings.
  const placed = new Map<string, [number, number, number]>([["lumora-core", [0, 0, 0]]]);

  function place(parentId: string | null, depth: number, parentPosition: [number, number, number]) {
    const siblings = byParent.get(parentId) ?? [];
    if (siblings.length === 0) return;

    const seed = parentId ? hashToUnit(parentId) * 1000 : 0;
    const baseDistance = depth === 0 ? CORE_CLEARANCE : GENERATION_STEP;

    siblings.forEach((node, index) => {
      const direction = sphereDirection(index, seed);

      function candidateAt(dist: number): [number, number, number] {
        return [
          parentPosition[0] + direction[0] * dist,
          parentPosition[1] + direction[1] * dist * Y_SQUASH,
          parentPosition[2] + direction[2] * dist,
        ];
      }

      let candidate = candidateAt(baseDistance);
      // Generate the next candidate, check it, repeat — capped, then fall
      // back to whatever the last attempt produced (pushed further out
      // along the same direction each time, so it's still deterministic and
      // still relationship-aware, just not guaranteed collision-free in a
      // pathologically dense graph).
      for (let attempt = 1; attempt <= MAX_COLLISION_ATTEMPTS && tooClose(candidate, placed); attempt++) {
        candidate = candidateAt(baseDistance + attempt * COLLISION_STEP);
      }

      entries.set(node.id, { id: node.id, depth, position: candidate });
      placed.set(node.id, candidate);
      place(node.id, depth + 1, candidate);
    });
  }

  place(null, 0, [0, 0, 0]);
  return Array.from(entries.values());
}

/** The farthest any node sits from Core (full 3D distance) — used to size
 * the camera's overview framing to the graph's actual extent (see
 * Scene.tsx) rather than a fixed distance that overlaps a wide/deep graph or
 * leaves a small one adrift. */
export function maxLayoutRadius(layout: LayoutEntry[]): number {
  return layout.reduce(
    (max, entry) => Math.max(max, Math.hypot(...entry.position)),
    CORE_CLEARANCE,
  );
}

/** A layout entry's position is already the real 3D position — this stays a
 * function (rather than every call site reading `.position` directly) so
 * existing call sites didn't need to change when the layout moved from
 * angle/radius to raw cartesian coordinates. */
export function toVector3(entry: LayoutEntry): [number, number, number] {
  return entry.position;
}

/** 2D percentage position for StaticFallback: a top-down (X/Z) projection,
 * scaled to stay within a roughly centered viewbox regardless of how far the
 * graph's 3D layout actually reaches. Y is intentionally ignored here — the
 * static map is a flat plan view, not an attempt to render true 3D. */
export function toPercentPosition(entry: LayoutEntry, maxRadius: number): { top: string; left: string } {
  const [x, , z] = entry.position;
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const scale = maxRadius > 0 ? (radius / maxRadius) * 38 : 0;
  const top = 50 - Math.sin(angle) * scale;
  const left = 50 + Math.cos(angle) * scale;
  // Fixed precision, not the raw float: `Math.sin`/`Math.cos` can differ in
  // their last bit between Node (SSR) and the browser (CSR) for the same
  // input, which otherwise trips React's hydration-mismatch warning over a
  // difference smaller than a pixel.
  return { top: `${top.toFixed(4)}%`, left: `${left.toFixed(4)}%` };
}

/**
 * Layers manually-dragged positions on top of a freshly computed layout.
 * Pure and cheap enough to call on every render: `overrides` only ever holds
 * nodes the user has actually dragged (typically zero or a handful), so this
 * is not a full re-layout — every other node's position still comes straight
 * from `computeGraphLayout`, untouched. Keeping this separate from
 * `computeGraphLayout` itself is what lets a manual position survive a graph
 * update (a new node elsewhere) without the automatic placement system ever
 * needing to know a node was moved.
 */
export function applyManualOverrides(
  layout: LayoutEntry[],
  overrides: Readonly<Record<string, [number, number, number]>>,
): LayoutEntry[] {
  if (Object.keys(overrides).length === 0) return layout;
  return layout.map((entry) => {
    const override = overrides[entry.id];
    return override ? { ...entry, position: override } : entry;
  });
}

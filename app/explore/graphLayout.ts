import { hashToUnit } from "./deterministicHash";
import type { KnowledgeGraphNode } from "./data";

export interface LayoutEntry {
  id: string;
  // 0 = top-level (attached directly to Core), 1+ = nested under another
  // studied topic.
  depth: number;
  position: [number, number, number];
}

// Golden angle (~137.5°): places points one at a time, each depending only
// on its own index, while still ending up evenly spread.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// How far a top-level node sits from Core, and how much farther each
// generation reaches beyond its parent.
const CORE_CLEARANCE = 2.4;
const GENERATION_STEP = 1.35;

// Flattens the vertical spread so the graph reads as one coherent space
// rather than a full sphere around Core.
const Y_SQUASH = 0.65;

// Minimum center-to-center distance between any two nodes — comfortably
// larger than a node's glow halo, so nodes at this distance still read as
// distinct light sources rather than overlapping.
const MIN_SEPARATION = 0.85;
// Deterministic nudge per failed placement attempt — no randomness, just
// walks the same direction further out.
const COLLISION_STEP = 0.35;
const MAX_COLLISION_ATTEMPTS = 6;

/** Van der Corput low-discrepancy sequence — every prefix is already
 * well-spread across [0,1), so an earlier index never has to change when a
 * later point is appended. */
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

/** A deterministic unit direction for the i-th point in a group, using only
 * `index` (never the group's eventual size). `seed` offsets the azimuth so
 * different parents' children don't fan out identically. */
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
 * Each node's position is derived from its parent's already-fixed position
 * plus a direction based on its index among siblings (golden angle + Van
 * der Corput), placed top-down from Core outward. A newly-appended node is
 * always the last sibling considered at its level, so it can never shift an
 * already-placed node — that's what keeps the graph stable as it grows.
 *
 * Stability covers addition only: deleting an earlier sibling can shift a
 * later one, but a delete already produces a fresh `nodes` array (and
 * therefore an expected fresh layout) anyway.
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
  // overlapping any nearby cluster, not just its own siblings.
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
      // Push further out along the same direction each attempt — still
      // deterministic, just not guaranteed collision-free in a dense graph.
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

/** The farthest any node sits from Core — used to size the camera's
 * overview framing to the graph's actual extent. */
export function maxLayoutRadius(layout: LayoutEntry[]): number {
  return layout.reduce(
    (max, entry) => Math.max(max, Math.hypot(...entry.position)),
    CORE_CLEARANCE,
  );
}

/** A layout entry's position is already the real 3D position — kept as a
 * function so call sites don't need to change if that ever stops being true. */
export function toVector3(entry: LayoutEntry): [number, number, number] {
  return entry.position;
}

/** 2D percentage position for StaticFallback: a top-down (X/Z) projection. */
export function toPercentPosition(entry: LayoutEntry, maxRadius: number): { top: string; left: string } {
  const [x, , z] = entry.position;
  const radius = Math.hypot(x, z);
  const angle = Math.atan2(z, x);
  const scale = maxRadius > 0 ? (radius / maxRadius) * 38 : 0;
  const top = 50 - Math.sin(angle) * scale;
  const left = 50 + Math.cos(angle) * scale;
  // Fixed precision: Math.sin/cos can differ in their last bit between
  // Node (SSR) and the browser (CSR), which otherwise trips a hydration
  // mismatch over a sub-pixel difference.
  return { top: `${top.toFixed(4)}%`, left: `${left.toFixed(4)}%` };
}

/**
 * Layers manually-dragged positions on top of a freshly computed layout.
 * `overrides` typically holds zero or a handful of nodes, so this is cheap
 * enough to call on every render — every other node's position still comes
 * straight from `computeGraphLayout`.
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

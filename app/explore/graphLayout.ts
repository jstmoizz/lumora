import type { KnowledgeGraphNode } from "./data";

export interface LayoutEntry {
  id: string;
  angle: number;
  radius: number;
  depth: number;
}

// Radius grows with depth so deeper topics sit farther from Core — the
// first ring (top-level, studied-directly topics) is the closest, each
// subsequent ring of children a bit farther out again.
const BASE_RADIUS = 2.4;
const RADIUS_STEP = 1.3;

/**
 * Deterministic radial layout: no force-directed simulation or extra
 * dependency, so this scales to any node count for free. Depth is distance
 * from Core (`parentId === null` → 0); nodes sharing a parent at a given
 * depth are spread evenly around a full circle, each ring offset from its
 * parent's own angle so children cluster near their parent's side of the
 * graph rather than starting back at angle 0 every time.
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

  function place(parentId: string | null, depth: number, parentAngle: number) {
    const siblings = byParent.get(parentId) ?? [];
    if (siblings.length === 0) return;

    // Children spread across a wide arc centered on their parent's angle
    // (not a full circle) so a branch reads as fanning out from its parent
    // rather than surrounding the whole graph.
    const arc = depth === 0 ? Math.PI * 2 : Math.PI * 1.1;
    // Offset a quarter-turn off 0, not starting exactly there: the default
    // camera looks straight down the z=0 axis (Scene.tsx's OVERVIEW_DIRECTION
    // has x=0), so a top-level ring starting at angle 0 puts pairs of
    // siblings (2, 4, ...) exactly toward and directly away from the camera
    // — the "away" one lands squarely behind Lumora Core and reads as
    // missing until the user manually orbits. This offset keeps every
    // top-level node off that axis instead.
    const start = depth === 0 ? Math.PI / 4 : parentAngle - arc / 2;
    const step = siblings.length === 1 ? 0 : arc / siblings.length;

    siblings.forEach((node, index) => {
      const angle = start + step * index + step / 2;
      const radius = BASE_RADIUS + RADIUS_STEP * depth;
      entries.set(node.id, { id: node.id, angle, radius, depth });
      place(node.id, depth + 1, angle);
    });
  }

  place(null, 0, 0);
  return Array.from(entries.values());
}

/** The farthest any node sits from Core — used to size the camera's overview
 * framing to the graph's actual extent (see Scene.tsx) rather than a fixed
 * distance that overlaps a wide/deep graph or leaves a small one adrift. */
export function maxLayoutRadius(layout: LayoutEntry[]): number {
  return layout.reduce((max, entry) => Math.max(max, entry.radius), BASE_RADIUS);
}

/** 3D position for the Scene: angle/radius on the XZ plane, small height
 * variation by depth so deeper rings aren't perfectly flat against Core. */
export function toVector3(entry: LayoutEntry): [number, number, number] {
  const x = Math.cos(entry.angle) * entry.radius;
  const z = Math.sin(entry.angle) * entry.radius;
  const y = entry.depth === 0 ? 0 : ((entry.depth % 2 === 0 ? 1 : -1) * 0.4);
  return [x, y, z];
}

/** 2D percentage position for StaticFallback, scaled to stay within a
 * roughly centered viewbox regardless of how many rings deep the graph goes. */
export function toPercentPosition(entry: LayoutEntry, maxRadius: number): { top: string; left: string } {
  const scale = maxRadius > 0 ? (entry.radius / maxRadius) * 38 : 0;
  const top = 50 - Math.sin(entry.angle) * scale;
  const left = 50 + Math.cos(entry.angle) * scale;
  // Fixed precision, not the raw float: `Math.sin`/`Math.cos` can differ in
  // their last bit between Node (SSR) and the browser (CSR) for the same
  // input, which otherwise trips React's hydration-mismatch warning over a
  // difference smaller than a pixel.
  return { top: `${top.toFixed(4)}%`, left: `${left.toFixed(4)}%` };
}

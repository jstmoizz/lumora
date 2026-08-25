import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  applyManualOverrides,
  computeGraphLayout,
  maxLayoutRadius,
  toPercentPosition,
  toVector3,
  type LayoutEntry,
} from "../graphLayout";
import type { KnowledgeGraphNode } from "../data";

function node(overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "n1",
    topicKey: "topic",
    label: "Topic",
    summary: null,
    parentId: null,
    relatedLabels: [],
    activityCount: 1,
    quizCount: 1,
    flashcardCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    lastStudiedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function byId(layout: LayoutEntry[]): Map<string, LayoutEntry> {
  return new Map(layout.map((entry) => [entry.id, entry]));
}

// A wide, several-generations-deep graph — enough nodes at enough depths to
// make determinism/3D/collision assertions meaningful, not just true by
// coincidence on a 2-node graph.
function bigGraph(): KnowledgeGraphNode[] {
  const nodes: KnowledgeGraphNode[] = [];
  const topics = ["Mathematics", "Computer Science", "Physics", "Biology", "History"];
  topics.forEach((label, i) => {
    nodes.push(
      node({ id: `top-${i}`, topicKey: label.toLowerCase(), label, createdAt: `2026-01-01T00:0${i}:00Z` }),
    );
    for (let c = 0; c < 4; c++) {
      nodes.push(
        node({
          id: `top-${i}-child-${c}`,
          topicKey: `${label.toLowerCase()}-child-${c}`,
          label: `${label} Child ${c}`,
          parentId: `top-${i}`,
          createdAt: `2026-01-02T00:0${i}:0${c}Z`,
        }),
      );
    }
  });
  return nodes;
}

describe("computeGraphLayout", () => {
  test("returns an empty layout for an empty graph", () => {
    expect(computeGraphLayout([])).toEqual([]);
  });

  test("places one entry per node", () => {
    const nodes = [node({ id: "a" }), node({ id: "b", parentId: "a" })];
    expect(computeGraphLayout(nodes)).toHaveLength(2);
  });

  test("top-level nodes sit at depth 0, children at depth 1", () => {
    const nodes = [node({ id: "a" }), node({ id: "b", parentId: "a" })];
    const layout = byId(computeGraphLayout(nodes));
    expect(layout.get("a")?.depth).toBe(0);
    expect(layout.get("b")?.depth).toBe(1);
  });

  test("ignores a node whose parentId points at nothing in the list (never orphans it into an infinite loop)", () => {
    const nodes = [node({ id: "a", parentId: "does-not-exist" })];
    expect(computeGraphLayout(nodes)).toHaveLength(0);
  });

  test("does not use Math.random for layout", () => {
    const source = readFileSync(path.join(process.cwd(), "app/explore/graphLayout.ts"), "utf-8");
    expect(source).not.toMatch(/Math\.random/);
  });

  describe("determinism", () => {
    test("the same graph produces byte-identical positions across repeated calls", () => {
      const nodes = bigGraph();
      expect(computeGraphLayout(nodes)).toEqual(computeGraphLayout(nodes));
    });

    test("rebuilding the node array (new object references, same data) still produces identical positions", () => {
      const a = computeGraphLayout(bigGraph());
      const b = computeGraphLayout(bigGraph().map((n) => ({ ...n })));
      expect(a).toEqual(b);
    });
  });

  describe("true 3D placement", () => {
    test("nodes are not confined to a single plane — y varies, not just x/z", () => {
      const layout = computeGraphLayout(bigGraph());
      const yValues = layout.map((entry) => entry.position[1]);
      // Not all zero, and not all identical — genuine vertical spread.
      expect(yValues.some((y) => Math.abs(y) > 0.05)).toBe(true);
      expect(new Set(yValues.map((y) => y.toFixed(3))).size).toBeGreaterThan(3);
    });

    test("every position is a finite 3-tuple", () => {
      const layout = computeGraphLayout(bigGraph());
      for (const entry of layout) {
        for (const coordinate of entry.position) {
          expect(Number.isFinite(coordinate)).toBe(true);
        }
      }
    });

    test("siblings under the same parent get distinct positions", () => {
      const nodes = [node({ id: "a" }), node({ id: "b" }), node({ id: "c" })];
      const layout = computeGraphLayout(nodes);
      const unique = new Set(layout.map((entry) => entry.position.join(",")));
      expect(unique.size).toBe(3);
    });
  });

  describe("collision avoidance", () => {
    // Minimum separation used internally by graphLayout.ts — re-derived here
    // (not imported) so this test is checking the algorithm's actual
    // observable guarantee, not just agreeing with its own constant.
    const MIN_SEPARATION = 0.85;

    test("no two nodes in a dense multi-branch graph sit closer than the minimum separation", () => {
      const layout = computeGraphLayout(bigGraph());
      for (let i = 0; i < layout.length; i++) {
        for (let j = i + 1; j < layout.length; j++) {
          expect(distance(layout[i].position, layout[j].position)).toBeGreaterThanOrEqual(
            MIN_SEPARATION - 0.001,
          );
        }
      }
    });

    test("a new node never spawns inside Lumora Core's own clearance", () => {
      const layout = computeGraphLayout(bigGraph());
      for (const entry of layout) {
        expect(distance(entry.position, [0, 0, 0])).toBeGreaterThanOrEqual(MIN_SEPARATION);
      }
    });

    test("many siblings under one parent (denser than the graph's own spacing budget) still all clear the minimum separation", () => {
      const nodes = [
        node({ id: "parent" }),
        ...Array.from({ length: 12 }, (_, i) =>
          node({ id: `child-${i}`, parentId: "parent", createdAt: `2026-01-02T00:${String(i).padStart(2, "0")}:00Z` }),
        ),
      ];
      const layout = computeGraphLayout(nodes);
      for (let i = 0; i < layout.length; i++) {
        for (let j = i + 1; j < layout.length; j++) {
          expect(distance(layout[i].position, layout[j].position)).toBeGreaterThanOrEqual(
            MIN_SEPARATION - 0.001,
          );
        }
      }
    });
  });

  describe("relationship awareness", () => {
    test("a child sits closer to its own parent than to an unrelated top-level branch", () => {
      const nodes = bigGraph();
      const layout = byId(computeGraphLayout(nodes));
      const child = layout.get("top-0-child-0")!;
      const ownParent = layout.get("top-0")!;
      const unrelatedBranch = layout.get("top-4")!;
      expect(distance(child.position, ownParent.position)).toBeLessThan(
        distance(child.position, unrelatedBranch.position),
      );
    });

    test("multiple children of one parent fan out into distinct directions rather than stacking", () => {
      const nodes = bigGraph();
      const layout = byId(computeGraphLayout(nodes));
      const parent = layout.get("top-0")!;
      const children = [0, 1, 2, 3].map((c) => layout.get(`top-0-child-${c}`)!);
      // Every pair of children under the same parent is meaningfully
      // separated from each other, not just individually far from Core.
      for (let i = 0; i < children.length; i++) {
        for (let j = i + 1; j < children.length; j++) {
          expect(distance(children[i].position, children[j].position)).toBeGreaterThan(0.1);
        }
      }
      // And each child is still nearer its parent than a sibling's full
      // distance away would suggest a random scatter.
      for (const child of children) {
        expect(distance(child.position, parent.position)).toBeLessThan(3);
      }
    });

    test("deeper nodes sit farther from Core than their ancestors", () => {
      const nodes = bigGraph();
      const layout = byId(computeGraphLayout(nodes));
      const parent = layout.get("top-0")!;
      const child = layout.get("top-0-child-0")!;
      expect(distance(child.position, [0, 0, 0])).toBeGreaterThan(distance(parent.position, [0, 0, 0]));
    });
  });

  describe("stability under append — the central requirement", () => {
    test("adding a new top-level node does not move any existing node", () => {
      const before = bigGraph();
      const beforeLayout = byId(computeGraphLayout(before));

      const after = [
        ...before,
        node({ id: "new-top", topicKey: "new topic", label: "New Topic", createdAt: "2026-02-01T00:00:00Z" }),
      ];
      const afterLayout = byId(computeGraphLayout(after));

      for (const [id, entry] of beforeLayout) {
        expect(afterLayout.get(id)?.position).toEqual(entry.position);
      }
    });

    test("adding a new sibling under an existing parent does not move that parent's earlier children", () => {
      const before = bigGraph();
      const beforeLayout = byId(computeGraphLayout(before));

      const after = [
        ...before,
        node({
          id: "top-0-child-new",
          topicKey: "mathematics-child-new",
          label: "Mathematics Child New",
          parentId: "top-0",
          createdAt: "2026-02-01T00:00:00Z",
        }),
      ];
      const afterLayout = byId(computeGraphLayout(after));

      for (let c = 0; c < 4; c++) {
        const id = `top-0-child-${c}`;
        expect(afterLayout.get(id)?.position).toEqual(beforeLayout.get(id)?.position);
      }
      // Core and every other branch are untouched too.
      for (const [id, entry] of beforeLayout) {
        expect(afterLayout.get(id)?.position).toEqual(entry.position);
      }
    });

    // Deletion is deliberately out of scope here: the spec's stability
    // requirement (Step 5) is specifically about *adding* a node not
    // reshuffling the graph. A sibling's position is derived from its rank
    // among still-existing siblings (by createdAt) — cheap, and exactly
    // what gives append-only stability its guarantee — but it does mean a
    // later sibling can shift if an *earlier* one is deleted. In practice
    // this is a non-regression: the previous angle/radius algorithm
    // reshuffled on every graph change (add or delete) with no stability at
    // all, and `deleteKnowledgeNode` already triggers a full
    // `router.refresh()` (a fresh nodes array, and therefore a fresh
    // layout) regardless of this algorithm's own guarantees.
  });
});

describe("maxLayoutRadius", () => {
  test("grows to fit a manually-overridden node placed far outside the computed layout", () => {
    const layout = computeGraphLayout([node({ id: "a" })]);
    const withoutOverride = maxLayoutRadius(layout);
    const withOverride = maxLayoutRadius(applyManualOverrides(layout, { a: [50, 0, 0] }));
    expect(withOverride).toBeGreaterThan(withoutOverride);
  });
});

describe("applyManualOverrides", () => {
  test("returns the same layout unchanged when there are no overrides", () => {
    const layout = computeGraphLayout([node({ id: "a" })]);
    expect(applyManualOverrides(layout, {})).toEqual(layout);
  });

  test("replaces only the overridden node's position, leaving every other entry untouched", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" })];
    const layout = computeGraphLayout(nodes);
    const original = byId(layout).get("b")!.position;

    const overridden = applyManualOverrides(layout, { a: [9, 9, 9] });

    expect(byId(overridden).get("a")?.position).toEqual([9, 9, 9]);
    expect(byId(overridden).get("b")?.position).toEqual(original);
  });

  test("a manually moved node retains its position after an unrelated graph update (new node added elsewhere)", () => {
    const before = bigGraph();
    const manualPosition: [number, number, number] = [7, 3, -2];
    const overrides = { "top-0-child-0": manualPosition };

    const beforeMerged = applyManualOverrides(computeGraphLayout(before), overrides);
    expect(byId(beforeMerged).get("top-0-child-0")?.position).toEqual(manualPosition);

    const after = [...before, node({ id: "brand-new", createdAt: "2026-03-01T00:00:00Z" })];
    const afterMerged = applyManualOverrides(computeGraphLayout(after), overrides);

    expect(byId(afterMerged).get("top-0-child-0")?.position).toEqual(manualPosition);
  });
});

describe("toVector3 / toPercentPosition", () => {
  test("toVector3 returns the entry's own position", () => {
    const [entry] = computeGraphLayout([node()]);
    expect(toVector3(entry)).toBe(entry.position);
  });

  test("toPercentPosition stays within a reasonable viewbox range", () => {
    const [entry] = computeGraphLayout([node()]);
    const { top, left } = toPercentPosition(entry, maxLayoutRadius([entry]));
    expect(parseFloat(top)).toBeGreaterThan(0);
    expect(parseFloat(top)).toBeLessThan(100);
    expect(parseFloat(left)).toBeGreaterThan(0);
    expect(parseFloat(left)).toBeLessThan(100);
  });

  test("toPercentPosition returns 50/50 (centered) for a zero-radius entry", () => {
    const entry: LayoutEntry = { id: "x", depth: 0, position: [0, 0, 0] };
    const { top, left } = toPercentPosition(entry, 0);
    expect(top).toBe("50.0000%");
    expect(left).toBe("50.0000%");
  });
});

import { describe, expect, test } from "vitest";
import { computeGraphLayout, toPercentPosition, toVector3 } from "../graphLayout";
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

describe("computeGraphLayout", () => {
  test("returns an empty layout for an empty graph", () => {
    expect(computeGraphLayout([])).toEqual([]);
  });

  test("places one entry per node", () => {
    const nodes = [node({ id: "a" }), node({ id: "b", parentId: "a" })];
    const layout = computeGraphLayout(nodes);
    expect(layout).toHaveLength(2);
  });

  test("top-level nodes sit at depth 0, children at depth 1", () => {
    const nodes = [node({ id: "a" }), node({ id: "b", parentId: "a" })];
    const layout = computeGraphLayout(nodes);
    const byId = new Map(layout.map((entry) => [entry.id, entry]));
    expect(byId.get("a")?.depth).toBe(0);
    expect(byId.get("b")?.depth).toBe(1);
  });

  test("deeper nodes sit at a larger radius than their ancestors", () => {
    const nodes = [
      node({ id: "a" }),
      node({ id: "b", parentId: "a" }),
      node({ id: "c", parentId: "b" }),
    ];
    const layout = computeGraphLayout(nodes);
    const byId = new Map(layout.map((entry) => [entry.id, entry]));
    expect(byId.get("b")!.radius).toBeGreaterThan(byId.get("a")!.radius);
    expect(byId.get("c")!.radius).toBeGreaterThan(byId.get("b")!.radius);
  });

  test("siblings under the same parent get distinct angles", () => {
    const nodes = [node({ id: "a" }), node({ id: "b" }), node({ id: "c" })];
    const layout = computeGraphLayout(nodes);
    const angles = layout.map((entry) => entry.angle);
    expect(new Set(angles).size).toBe(3);
  });

  test("is deterministic and stable across repeated calls", () => {
    const nodes = [node({ id: "a" }), node({ id: "b", parentId: "a" })];
    expect(computeGraphLayout(nodes)).toEqual(computeGraphLayout(nodes));
  });

  test("ignores a node whose parentId points at nothing in the list (never orphans it into an infinite loop)", () => {
    const nodes = [node({ id: "a", parentId: "does-not-exist" })];
    const layout = computeGraphLayout(nodes);
    expect(layout).toHaveLength(0);
  });
});

describe("toVector3 / toPercentPosition", () => {
  test("toVector3 returns a finite 3-tuple", () => {
    const [layout] = computeGraphLayout([node()]);
    const [x, y, z] = toVector3(layout);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });

  test("toPercentPosition stays within a reasonable viewbox range", () => {
    const [layout] = computeGraphLayout([node()]);
    const { top, left } = toPercentPosition(layout, layout.radius);
    expect(parseFloat(top)).toBeGreaterThan(0);
    expect(parseFloat(top)).toBeLessThan(100);
    expect(parseFloat(left)).toBeGreaterThan(0);
    expect(parseFloat(left)).toBeLessThan(100);
  });
});

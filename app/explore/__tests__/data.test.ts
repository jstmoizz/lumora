import { describe, expect, test } from "vitest";
import { CENTRAL_NODE, NODE_ACCENTS, assignAccents, type KnowledgeGraphNode } from "../data";

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

describe("CENTRAL_NODE", () => {
  test("has a stable id distinct from any real node id space", () => {
    expect(CENTRAL_NODE.id).toBe("lumora-core");
    expect(CENTRAL_NODE.label).toBe("Lumora Core");
  });
});

describe("NODE_ACCENTS", () => {
  test("defines a restrained, non-empty palette", () => {
    const ids = Object.keys(NODE_ACCENTS);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(6);
    for (const accent of Object.values(NODE_ACCENTS)) {
      expect(accent.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(accent.emissive).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("assignAccents", () => {
  test("returns an empty map for an empty graph", () => {
    expect(assignAccents([])).toEqual({});
  });

  test("assigns every node an accent", () => {
    const nodes = [
      node({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      node({ id: "b", createdAt: "2026-01-02T00:00:00Z" }),
    ];
    const accents = assignAccents(nodes);
    expect(Object.keys(NODE_ACCENTS)).toContain(accents.a);
    expect(Object.keys(NODE_ACCENTS)).toContain(accents.b);
  });

  test("top-level nodes cycle through the palette in creation order", () => {
    const nodes = [
      node({ id: "a", parentId: null, createdAt: "2026-01-01T00:00:00Z" }),
      node({ id: "b", parentId: null, createdAt: "2026-01-02T00:00:00Z" }),
    ];
    const accents = assignAccents(nodes);
    expect(accents.a).not.toBe(accents.b);
  });

  test("a child inherits its top-level ancestor's accent, even several levels deep", () => {
    const nodes = [
      node({ id: "root", parentId: null, createdAt: "2026-01-01T00:00:00Z" }),
      node({ id: "child", parentId: "root", createdAt: "2026-01-02T00:00:00Z" }),
      node({ id: "grandchild", parentId: "child", createdAt: "2026-01-03T00:00:00Z" }),
    ];
    const accents = assignAccents(nodes);
    expect(accents.child).toBe(accents.root);
    expect(accents.grandchild).toBe(accents.root);
  });

  test("is deterministic across repeated calls", () => {
    const nodes = [
      node({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      node({ id: "b", parentId: "a", createdAt: "2026-01-02T00:00:00Z" }),
    ];
    expect(assignAccents(nodes)).toEqual(assignAccents(nodes));
  });
});

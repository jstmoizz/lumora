import { describe, expect, test } from "vitest";
import {
  CENTRAL_NODE,
  EXPANDED_CONCEPTS,
  KNOWLEDGE_EDGES,
  KNOWLEDGE_NODES,
  conceptPosition,
} from "../data";

describe("knowledge space data", () => {
  test("every node has a unique id", () => {
    const ids = KNOWLEDGE_NODES.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every edge references two existing, distinct knowledge nodes", () => {
    const ids = new Set(KNOWLEDGE_NODES.map((node) => node.id));
    for (const edge of KNOWLEDGE_EDGES) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
    }
  });

  test("no edge references the central node", () => {
    for (const edge of KNOWLEDGE_EDGES) {
      expect(edge.from).not.toBe(CENTRAL_NODE.id);
      expect(edge.to).not.toBe(CENTRAL_NODE.id);
    }
  });

  test("the central node id does not collide with any knowledge node id", () => {
    const ids = KNOWLEDGE_NODES.map((node) => node.id);
    expect(ids).not.toContain(CENTRAL_NODE.id);
  });

  test("tier is a minority-core hierarchy, not a 50/50 split or all-one-tier", () => {
    const coreCount = KNOWLEDGE_NODES.filter((node) => node.tier === "core").length;
    expect(coreCount).toBeGreaterThan(0);
    expect(coreCount).toBeLessThan(KNOWLEDGE_NODES.length / 2);
  });
});

describe("expanded concepts (Phase 4.3)", () => {
  test("every concept has a unique id", () => {
    const ids = EXPANDED_CONCEPTS.map((concept) => concept.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no concept id collides with a core topic id or the central node id", () => {
    const coreIds = new Set(KNOWLEDGE_NODES.map((node) => node.id));
    for (const concept of EXPANDED_CONCEPTS) {
      expect(coreIds.has(concept.id)).toBe(false);
      expect(concept.id).not.toBe(CENTRAL_NODE.id);
    }
  });

  test("every concept's parentId references an existing core topic", () => {
    const coreIds = new Set(KNOWLEDGE_NODES.map((node) => node.id));
    for (const concept of EXPANDED_CONCEPTS) {
      expect(coreIds.has(concept.parentId)).toBe(true);
    }
  });

  test("the dataset is deliberately small and curated, not exhaustive or generated", () => {
    // A loose guardrail against silently growing this into a large/generated
    // dataset in a later edit — not a precise product requirement.
    expect(EXPANDED_CONCEPTS.length).toBeGreaterThan(0);
    expect(EXPANDED_CONCEPTS.length).toBeLessThanOrEqual(20);
  });

  test("a concept's position is deterministic: its parent's position plus its own offset", () => {
    for (const concept of EXPANDED_CONCEPTS) {
      const parent = KNOWLEDGE_NODES.find((node) => node.id === concept.parentId)!;
      const [x, y, z] = conceptPosition(concept);
      expect(x).toBeCloseTo(parent.position[0] + concept.offset[0]);
      expect(y).toBeCloseTo(parent.position[1] + concept.offset[1]);
      expect(z).toBeCloseTo(parent.position[2] + concept.offset[2]);
    }
  });

  test("a concept's position is stable across repeated calls (no randomness)", () => {
    const concept = EXPANDED_CONCEPTS[0];
    expect(conceptPosition(concept)).toEqual(conceptPosition(concept));
  });

  test("siblings under the same parent sit at distinct positions", () => {
    const byParent = new Map<string, [number, number, number][]>();
    for (const concept of EXPANDED_CONCEPTS) {
      const positions = byParent.get(concept.parentId) ?? [];
      positions.push(conceptPosition(concept));
      byParent.set(concept.parentId, positions);
    }
    for (const positions of byParent.values()) {
      const unique = new Set(positions.map((position) => position.join(",")));
      expect(unique.size).toBe(positions.length);
    }
  });
});

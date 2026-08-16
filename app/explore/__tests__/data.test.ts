import { describe, expect, test } from "vitest";
import { CENTRAL_NODE, KNOWLEDGE_EDGES, KNOWLEDGE_NODES } from "../data";

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

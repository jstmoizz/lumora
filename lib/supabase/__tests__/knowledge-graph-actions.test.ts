import { beforeEach, describe, expect, test, vi } from "vitest";

const { getServerUserMock, fromMock, createClientMock } = vi.hoisted(() => {
  const getServerUserMock = vi.fn();
  const fromMock = vi.fn();
  const createClientMock = vi.fn(async () => ({ from: fromMock }));
  return { getServerUserMock, fromMock, createClientMock };
});

vi.mock("../server", () => ({
  getServerUser: getServerUserMock,
  createClient: createClientMock,
}));

import { deleteKnowledgeNode, resetKnowledgeGraph } from "../knowledge-graph-actions";

// A chainable, thenable query-builder stand-in: `.eq()` can be called any
// number of times (delete scopes by id+user_id; reset scopes by user_id
// alone) and the whole thing resolves to `result` however many `.eq()`
// calls happen before it's awaited.
function makeDeleteBuilder(result: { error: unknown }) {
  const eqCalls: unknown[][] = [];
  const builder: {
    eq: (...args: unknown[]) => typeof builder;
    then: (resolve: (value: { error: unknown }) => void) => void;
  } = {
    eq: (...args: unknown[]) => {
      eqCalls.push(args);
      return builder;
    },
    then: (resolve) => resolve(result),
  };
  return { builder, eqCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerUserMock.mockResolvedValue({ id: "user-1" });
});

describe("deleteKnowledgeNode", () => {
  test("rejects an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await deleteKnowledgeNode("node-1");

    expect(result).toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("scopes the delete to both the given id and the caller's own user_id", async () => {
    const { builder, eqCalls } = makeDeleteBuilder({ error: null });
    const deleteMock = vi.fn(() => builder);
    fromMock.mockReturnValue({ delete: deleteMock });

    const result = await deleteKnowledgeNode("node-1");

    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("knowledge_nodes");
    expect(eqCalls).toContainEqual(["id", "node-1"]);
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
  });

  test("returns ok: false (not a throw) when the delete fails", async () => {
    const { builder } = makeDeleteBuilder({ error: { message: "connection reset" } });
    fromMock.mockReturnValue({ delete: vi.fn(() => builder) });

    const result = await deleteKnowledgeNode("node-1");

    expect(result).toEqual({ ok: false });
  });
});

describe("resetKnowledgeGraph", () => {
  test("rejects an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await resetKnowledgeGraph();

    expect(result).toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("deletes every row scoped to the caller's own user_id", async () => {
    const { builder, eqCalls } = makeDeleteBuilder({ error: null });
    const deleteMock = vi.fn(() => builder);
    fromMock.mockReturnValue({ delete: deleteMock });

    const result = await resetKnowledgeGraph();

    expect(result).toEqual({ ok: true });
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
  });

  test("returns ok: false (not a throw) when the delete fails", async () => {
    const { builder } = makeDeleteBuilder({ error: { message: "connection reset" } });
    fromMock.mockReturnValue({ delete: vi.fn(() => builder) });

    const result = await resetKnowledgeGraph();

    expect(result).toEqual({ ok: false });
  });
});

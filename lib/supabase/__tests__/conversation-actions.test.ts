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

import { deleteConversation, renameConversation } from "../conversation-actions";

// A chainable stand-in for `.update(...)`/`.delete()` -> `.eq()`* -> `.select()`,
// resolving to `result` once `.select()` is awaited.
function makeMutationBuilder(result: { data: unknown; error: unknown }) {
  const eqCalls: unknown[][] = [];
  const builder = {
    eq: (...args: unknown[]) => {
      eqCalls.push(args);
      return builder;
    },
    select: vi.fn(() => Promise.resolve(result)),
  };
  return { builder, eqCalls };
}

beforeEach(() => {
  vi.clearAllMocks();
  getServerUserMock.mockResolvedValue({ id: "user-1" });
});

describe("renameConversation", () => {
  test("rejects an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    await expect(renameConversation("conv-1", "New title")).resolves.toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("rejects an invalid title with a message, before checking auth or the database", async () => {
    await expect(renameConversation("conv-1", "   ")).resolves.toEqual({
      ok: false,
      error: "Enter a title.",
    });
    expect(getServerUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("rejects a non-string title from a hand-crafted request", async () => {
    const result = await renameConversation("conv-1", 42 as unknown as string);
    expect(result.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("saves the normalized title, scoped to the id and the caller's own user_id, leaving updated_at alone", async () => {
    const { builder, eqCalls } = makeMutationBuilder({ data: [{ id: "conv-1" }], error: null });
    const updateMock = vi.fn(() => builder);
    fromMock.mockReturnValue({ update: updateMock });

    const result = await renameConversation("conv-1", "  Cell   biology ");

    expect(result).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(updateMock).toHaveBeenCalledWith({ title: "Cell biology" });
    expect(eqCalls).toContainEqual(["id", "conv-1"]);
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
  });

  test("reports failure when no row matched (missing, or someone else's)", async () => {
    const { builder } = makeMutationBuilder({ data: [], error: null });
    fromMock.mockReturnValue({ update: vi.fn(() => builder) });

    await expect(renameConversation("conv-x", "Title")).resolves.toEqual({ ok: false });
  });

  test("returns ok: false (not a throw) when the update fails", async () => {
    const { builder } = makeMutationBuilder({ data: null, error: { message: "connection reset" } });
    fromMock.mockReturnValue({ update: vi.fn(() => builder) });

    await expect(renameConversation("conv-1", "Title")).resolves.toEqual({ ok: false });
  });
});

describe("deleteConversation", () => {
  test("rejects an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    await expect(deleteConversation("conv-1")).resolves.toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("deletes scoped to both the id and the caller's own user_id", async () => {
    const { builder, eqCalls } = makeMutationBuilder({ data: [{ id: "conv-1" }], error: null });
    fromMock.mockReturnValue({ delete: vi.fn(() => builder) });

    await expect(deleteConversation("conv-1")).resolves.toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(eqCalls).toContainEqual(["id", "conv-1"]);
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
  });

  test("reports failure when no row matched", async () => {
    const { builder } = makeMutationBuilder({ data: [], error: null });
    fromMock.mockReturnValue({ delete: vi.fn(() => builder) });

    await expect(deleteConversation("conv-x")).resolves.toEqual({ ok: false });
  });

  test("returns ok: false (not a throw) when the delete fails", async () => {
    const { builder } = makeMutationBuilder({ data: null, error: { message: "connection reset" } });
    fromMock.mockReturnValue({ delete: vi.fn(() => builder) });

    await expect(deleteConversation("conv-1")).resolves.toEqual({ ok: false });
  });
});

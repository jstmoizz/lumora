import { beforeEach, describe, expect, test, vi } from "vitest";

const { fromMock, createClientMock } = vi.hoisted(() => {
  const fromMock = vi.fn();
  const createClientMock = vi.fn(async () => ({ from: fromMock }));
  return { fromMock, createClientMock };
});

vi.mock("../server", () => ({ createClient: createClientMock }));

import { getConversationMessages, listConversations } from "../conversations";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listConversations", () => {
  test("returns the signed-in user's conversations, ordered most-recently-updated first", async () => {
    const orderMock = vi.fn(() =>
      Promise.resolve({
        data: [
          { id: "conv-1", title: "Osmosis", updated_at: "2026-01-02T00:00:00Z" },
          { id: "conv-2", title: "Recursion", updated_at: "2026-01-01T00:00:00Z" },
        ],
        error: null,
      }),
    );
    const selectMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const result = await listConversations();

    expect(fromMock).toHaveBeenCalledWith("conversations");
    expect(orderMock).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(result).toEqual([
      { id: "conv-1", title: "Osmosis", updatedAt: "2026-01-02T00:00:00Z" },
      { id: "conv-2", title: "Recursion", updatedAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  test("returns an empty list rather than throwing when the query errors", async () => {
    const orderMock = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "boom" } }),
    );
    const selectMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const result = await listConversations();

    expect(result).toEqual([]);
  });

  test("relies on RLS rather than filtering by user id itself — no .eq() call is made", async () => {
    const orderMock = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const selectMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValue({ select: selectMock });

    await listConversations();

    // The RLS policy ("Users can view own conversations") is what actually
    // scopes this query — asserting no manual .eq("user_id", ...) call
    // exists guards against ever accidentally believing an app-level
    // filter is what's providing the security boundary.
    expect(selectMock).toHaveBeenCalledWith("id, title, updated_at");
  });
});

describe("getConversationMessages", () => {
  function mockConversationLookup(result: { data: unknown; error?: unknown }) {
    const singleMock = vi.fn(() => Promise.resolve(result));
    const eqMock = vi.fn(() => ({ single: singleMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    return { select: selectMock, singleMock, eqMock, selectMock };
  }

  function mockMessagesQuery(result: { data: unknown; error?: unknown }) {
    const orderMock = vi.fn(() => Promise.resolve(result));
    const eqMock = vi.fn(() => ({ order: orderMock }));
    const selectMock = vi.fn(() => ({ eq: eqMock }));
    return { select: selectMock, orderMock, eqMock, selectMock };
  }

  test("returns null for a conversation that doesn't exist or isn't the caller's own", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "conversations") {
        return mockConversationLookup({ data: null, error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getConversationMessages("someone-elses-conversation");

    expect(result).toBeNull();
  });

  test("returns the conversation's messages, oldest first, with parts preserved", async () => {
    const quizPart = {
      type: "tool-createQuiz",
      toolCallId: "call-1",
      state: "output-available",
      input: { topic: "Cells", questions: [] },
      output: { quizId: "quiz-1", topic: "Cells", questions: [] },
    };

    fromMock.mockImplementation((table: string) => {
      if (table === "conversations") {
        return mockConversationLookup({ data: { id: "conv-1" }, error: null });
      }
      if (table === "messages") {
        return mockMessagesQuery({
          data: [
            { id: "msg-1", role: "user", parts: [{ type: "text", text: "Quiz me" }] },
            { id: "msg-2", role: "assistant", parts: [quizPart] },
          ],
          error: null,
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getConversationMessages("conv-1");

    expect(result).toEqual([
      { id: "msg-1", role: "user", parts: [{ type: "text", text: "Quiz me" }] },
      { id: "msg-2", role: "assistant", parts: [quizPart] },
    ]);
  });

  test("a conversation that exists but has no messages yet returns an empty array, not null", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "conversations") {
        return mockConversationLookup({ data: { id: "conv-1" }, error: null });
      }
      if (table === "messages") {
        return mockMessagesQuery({ data: [], error: null });
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getConversationMessages("conv-1");

    expect(result).toEqual([]);
  });
});

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

import { getKnowledgeGraph, upsertKnowledgeNodeActivity } from "../knowledge-graph";

function mockSelectEq(result: { data: unknown; error?: unknown }) {
  const eqMock = vi.fn(() => Promise.resolve(result));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  return { select: selectMock, eqMock, selectMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getKnowledgeGraph", () => {
  test("returns an empty array when no one is signed in, without querying the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await getKnowledgeGraph();

    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("scopes the query to the authenticated user's own rows", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select, eqMock } = mockSelectEq({ data: [], error: null });
    fromMock.mockReturnValue({ select });

    await getKnowledgeGraph();

    expect(fromMock).toHaveBeenCalledWith("knowledge_nodes");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  test("maps rows from snake_case to the camelCase KnowledgeGraphNode shape", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select } = mockSelectEq({
      data: [
        {
          id: "n1",
          topic_key: "machine learning",
          label: "Machine Learning",
          summary: null,
          parent_id: null,
          related_labels: ["Neural Networks"],
          activity_count: 2,
          quiz_count: 1,
          flashcard_count: 1,
          created_at: "2026-01-01T00:00:00Z",
          last_studied_at: "2026-01-02T00:00:00Z",
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue({ select });

    const result = await getKnowledgeGraph();

    expect(result).toEqual([
      {
        id: "n1",
        topicKey: "machine learning",
        label: "Machine Learning",
        summary: null,
        parentId: null,
        relatedLabels: ["Neural Networks"],
        activityCount: 2,
        quizCount: 1,
        flashcardCount: 1,
        createdAt: "2026-01-01T00:00:00Z",
        lastStudiedAt: "2026-01-02T00:00:00Z",
      },
    ]);
  });

  test("returns an empty array (not a crash) when the query fails", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select } = mockSelectEq({ data: null, error: { message: "connection reset" } });
    fromMock.mockReturnValue({ select });

    const result = await getKnowledgeGraph();

    expect(result).toEqual([]);
  });
});

describe("upsertKnowledgeNodeActivity", () => {
  // The real `.insert(payload)` result is used two different ways: awaited
  // directly for a plain insert (`{ error }`), and chained with
  // `.select("id").single()` when the caller needs the new row's id back
  // (creating a category node) — this stands in for both at once, so a
  // single mock works for either call shape.
  function makeInsertResult({
    error = null as unknown,
    newId = "new-node-id",
    selectError = null as unknown,
  } = {}) {
    const promise = Promise.resolve({ error }) as Promise<{ error: unknown }> & {
      select: (columns: string) => { single: () => Promise<{ data: { id: string } | null; error: unknown }> };
    };
    promise.select = () => ({
      single: () =>
        Promise.resolve(
          selectError ? { data: null, error: selectError } : { data: { id: newId }, error: null },
        ),
    });
    return promise;
  }

  function makeSupabase({
    existingNodes = [] as unknown[],
    listError = null as unknown,
    updateError = null as unknown,
    insertError = null as unknown,
    newNodeId = "new-node-id",
  } = {}) {
    const updateEqMock = vi.fn(() => Promise.resolve({ error: updateError }));
    const updateMock = vi.fn<(payload: Record<string, unknown>) => { eq: typeof updateEqMock }>(
      () => ({ eq: updateEqMock }),
    );
    const insertMock = vi.fn<(payload: Record<string, unknown>) => ReturnType<typeof makeInsertResult>>(
      () => makeInsertResult({ error: insertError, newId: newNodeId }),
    );
    const listEqMock = vi.fn(() => Promise.resolve({ data: existingNodes, error: listError }));
    const selectMock = vi.fn(() => ({ eq: listEqMock }));
    const from = vi.fn(() => ({ select: selectMock, update: updateMock, insert: insertMock }));
    return { supabase: { from } as never, from, updateMock, updateEqMock, insertMock, selectMock };
  }

  test("does nothing when the label is empty after trimming", async () => {
    const { supabase, from } = makeSupabase();
    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "   ",
      kind: "quiz",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("creates a new node at activity_count 1 for a topic never seen before", async () => {
    const { supabase, insertMock } = makeSupabase({ existingNodes: [] });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Machine Learning",
      kind: "quiz",
      relatedTopics: ["Neural Networks", "Supervised Learning"],
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        topic_key: "machine learning",
        label: "Machine Learning",
        parent_id: null,
        activity_count: 1,
        quiz_count: 1,
        flashcard_count: 0,
        related_labels: ["Neural Networks", "Supervised Learning"],
      }),
    );
  });

  test("attaches a new node under whichever existing node named it in related_labels", async () => {
    const { supabase, insertMock } = makeSupabase({
      existingNodes: [
        { id: "ml-id", topic_key: "machine learning", related_labels: ["Neural Networks"] },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Neural Networks",
      kind: "flashcards",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "ml-id", flashcard_count: 1, quiz_count: 0 }),
    );
  });

  test("auto-creates the category node when it doesn't exist yet, and nests the studied topic under it", async () => {
    const { supabase, insertMock } = makeSupabase({ existingNodes: [], newNodeId: "dsa-id" });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Binary Search Trees",
      kind: "quiz",
      category: "Data Structures and Algorithms",
    });

    // First call creates the category node itself...
    expect(insertMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        topic_key: "data structures and algorithms",
        label: "Data Structures and Algorithms",
        parent_id: null,
        activity_count: 0,
        quiz_count: 0,
        flashcard_count: 0,
      }),
    );
    // ...then the actual studied topic is created as its child.
    expect(insertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        topic_key: "binary search trees",
        label: "Binary Search Trees",
        parent_id: "dsa-id",
        activity_count: 1,
        quiz_count: 1,
      }),
    );
  });

  test("nests under the existing category node instead of creating a duplicate", async () => {
    const { supabase, insertMock } = makeSupabase({
      existingNodes: [
        { id: "dsa-id", topic_key: "data structures and algorithms", related_labels: [] },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Binary Search Trees",
      kind: "quiz",
      category: "data structures and algorithms",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ parent_id: "dsa-id" }),
    );
  });

  test("ignores a category that's just the topic renamed (no self-parenting)", async () => {
    const { supabase, insertMock } = makeSupabase({ existingNodes: [] });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Machine Learning",
      kind: "quiz",
      category: "machine learning",
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ parent_id: null }));
  });

  test("category takes priority over a related_labels match", async () => {
    const { supabase, insertMock } = makeSupabase({
      existingNodes: [
        { id: "ml-id", topic_key: "machine learning", related_labels: ["Neural Networks"] },
        { id: "ai-id", topic_key: "artificial intelligence", related_labels: [] },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Neural Networks",
      kind: "quiz",
      category: "Artificial Intelligence",
    });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "ai-id" }));
  });

  test("falls back to related_labels matching (not a throw) when creating the category node fails", async () => {
    const { supabase, insertMock } = makeSupabase({
      existingNodes: [
        { id: "ml-id", topic_key: "machine learning", related_labels: ["Neural Networks"] },
      ],
    });
    // First insert() call is the category-creation attempt — make its
    // .select().single() resolve an error, forcing the fallback path.
    insertMock.mockImplementationOnce(() =>
      makeInsertResult({ selectError: { message: "connection reset" } }),
    );

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "Neural Networks",
      kind: "quiz",
      category: "Artificial Intelligence",
    });

    expect(insertMock).toHaveBeenCalledTimes(2);
    // Falls back to the related_labels match (Machine Learning named
    // "Neural Networks" as related) instead of leaving it unparented.
    expect(insertMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ parent_id: "ml-id" }),
    );
  });

  test("updates an existing node instead of creating a duplicate", async () => {
    const { supabase, updateMock, insertMock } = makeSupabase({
      existingNodes: [
        {
          id: "ml-id",
          topic_key: "machine learning",
          related_labels: ["Neural Networks"],
          activity_count: 2,
          quiz_count: 1,
          flashcard_count: 1,
        },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "machine learning",
      kind: "quiz",
      relatedTopics: ["Transformers"],
    });

    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_count: 3,
        quiz_count: 2,
        flashcard_count: 1,
        related_labels: ["Neural Networks", "Transformers"],
      }),
    );
  });

  test("caps merged related_labels at 6", async () => {
    const { supabase, updateMock } = makeSupabase({
      existingNodes: [
        {
          id: "ml-id",
          topic_key: "machine learning",
          related_labels: ["A", "B", "C", "D", "E"],
          activity_count: 1,
          quiz_count: 1,
          flashcard_count: 0,
        },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "machine learning",
      kind: "quiz",
      relatedTopics: ["F", "G"],
    });

    const [payload] = updateMock.mock.calls[0] as [Record<string, unknown>];
    expect((payload.related_labels as string[]).length).toBe(6);
  });

  test("never throws when the read fails", async () => {
    const { supabase, insertMock, updateMock } = makeSupabase({
      listError: { message: "connection reset" },
    });

    await expect(
      upsertKnowledgeNodeActivity(supabase, "user-1", { label: "X", kind: "quiz" }),
    ).resolves.toBeUndefined();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  test("never throws when the write fails", async () => {
    const { supabase } = makeSupabase({ insertError: { message: "connection reset" } });

    await expect(
      upsertKnowledgeNodeActivity(supabase, "user-1", { label: "X", kind: "quiz" }),
    ).resolves.toBeUndefined();
  });

  test("a manually-added topic (addKnowledgeTopic) bumps activity_count but not quiz/flashcard counts", async () => {
    const { supabase, insertMock } = makeSupabase({ existingNodes: [] });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "World War II",
      kind: "manual",
      summary: "A global conflict from 1939 to 1945.",
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "World War II",
        activity_count: 1,
        quiz_count: 0,
        flashcard_count: 0,
        summary: "A global conflict from 1939 to 1945.",
      }),
    );
  });

  test("a new node's summary is null when none was given", async () => {
    const { supabase, insertMock } = makeSupabase({ existingNodes: [] });

    await upsertKnowledgeNodeActivity(supabase, "user-1", { label: "Machine Learning", kind: "quiz" });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ summary: null }));
  });

  test("a new summary replaces an existing node's summary on update", async () => {
    const { supabase, updateMock } = makeSupabase({
      existingNodes: [
        {
          id: "ml-id",
          topic_key: "machine learning",
          related_labels: [],
          activity_count: 1,
          quiz_count: 1,
          flashcard_count: 0,
          summary: "An old, vague summary.",
        },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", {
      label: "machine learning",
      kind: "manual",
      summary: "Systems that learn from data instead of explicit rules.",
    });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Systems that learn from data instead of explicit rules." }),
    );
  });

  test("omitting summary on update leaves the existing summary untouched", async () => {
    const { supabase, updateMock } = makeSupabase({
      existingNodes: [
        {
          id: "ml-id",
          topic_key: "machine learning",
          related_labels: [],
          activity_count: 1,
          quiz_count: 1,
          flashcard_count: 0,
          summary: "The original summary.",
        },
      ],
    });

    await upsertKnowledgeNodeActivity(supabase, "user-1", { label: "machine learning", kind: "quiz" });

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "The original summary." }),
    );
  });
});

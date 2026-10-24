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

import { getQuizAttemptSummaries, saveQuizAttempt } from "../quiz-attempt-actions";

const VALID_ATTEMPT = {
  conversationId: "conv-1",
  quizId: "quiz-1",
  topic: "Photosynthesis",
  mode: "full",
  correctCount: 2,
  totalCount: 3,
  missedQuestionIds: ["quiz-1-3"],
};

beforeEach(() => {
  vi.clearAllMocks();
  getServerUserMock.mockResolvedValue({ id: "user-1" });
});

describe("saveQuizAttempt", () => {
  test("rejects a malformed attempt without checking auth or touching the database", async () => {
    await expect(saveQuizAttempt({ ...VALID_ATTEMPT, correctCount: 9 })).resolves.toEqual({
      ok: false,
    });
    expect(getServerUserMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    await expect(saveQuizAttempt(VALID_ATTEMPT)).resolves.toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("inserts the attempt under the authenticated user's own id", async () => {
    getServerUserMock.mockResolvedValue({ id: "the-real-signed-in-user" });
    const insertMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ insert: insertMock });

    await expect(
      saveQuizAttempt({ ...VALID_ATTEMPT, user_id: "someone-else" }),
    ).resolves.toEqual({ ok: true });

    expect(fromMock).toHaveBeenCalledWith("quiz_attempts");
    expect(insertMock).toHaveBeenCalledWith({
      user_id: "the-real-signed-in-user",
      conversation_id: "conv-1",
      quiz_id: "quiz-1",
      topic: "Photosynthesis",
      mode: "full",
      correct_count: 2,
      total_count: 3,
      missed_question_ids: ["quiz-1-3"],
    });
  });

  test("stores a null conversation_id when the chat has no id yet", async () => {
    const insertMock = vi.fn(() => Promise.resolve({ error: null }));
    fromMock.mockReturnValue({ insert: insertMock });

    await saveQuizAttempt({ ...VALID_ATTEMPT, conversationId: undefined });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: null }));
  });

  test("returns ok: false (not a throw) when the insert fails — e.g. the table doesn't exist yet", async () => {
    fromMock.mockReturnValue({
      insert: vi.fn(() =>
        Promise.resolve({ error: { message: 'relation "public.quiz_attempts" does not exist' } }),
      ),
    });

    await expect(saveQuizAttempt(VALID_ATTEMPT)).resolves.toEqual({ ok: false });
  });
});

describe("getQuizAttemptSummaries", () => {
  function selectBuilder(result: { data: unknown; error: unknown }) {
    const eqCalls: unknown[][] = [];
    const builder: {
      eq: (...args: unknown[]) => typeof builder;
      then: (resolve: (value: typeof result) => void) => void;
    } = {
      eq: (...args) => {
        eqCalls.push(args);
        return builder;
      },
      then: (resolve) => resolve(result),
    };
    return { builder, eqCalls };
  }

  test("returns {} for an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    await expect(getQuizAttemptSummaries("conv-1")).resolves.toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("summarizes the conversation's attempts, scoped to the caller", async () => {
    const { builder, eqCalls } = selectBuilder({
      data: [
        { quiz_id: "quiz-1", mode: "full", correct_count: 1, total_count: 3 },
        { quiz_id: "quiz-1", mode: "full", correct_count: 3, total_count: 3 },
      ],
      error: null,
    });
    fromMock.mockReturnValue({ select: vi.fn(() => builder) });

    await expect(getQuizAttemptSummaries("conv-1")).resolves.toEqual({
      "quiz-1": { attempts: 2, bestFull: { correct: 3, total: 3 } },
    });
    expect(eqCalls).toContainEqual(["conversation_id", "conv-1"]);
    expect(eqCalls).toContainEqual(["user_id", "user-1"]);
  });

  test("returns {} (not a throw) when the query fails", async () => {
    const { builder } = selectBuilder({ data: null, error: { message: "boom" } });
    fromMock.mockReturnValue({ select: vi.fn(() => builder) });

    await expect(getQuizAttemptSummaries("conv-1")).resolves.toEqual({});
  });
});

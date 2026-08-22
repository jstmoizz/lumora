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

import { getTopicProgress } from "../topic-progress";

function mockSelectEq(result: { data: unknown; error?: unknown }) {
  const eqMock = vi.fn(() => Promise.resolve(result));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  return { select: selectMock, eqMock, selectMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getTopicProgress", () => {
  test("returns an empty object when no one is signed in, without querying the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await getTopicProgress();

    expect(result).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("scopes the query to the authenticated user's own rows", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select, eqMock } = mockSelectEq({ data: [], error: null });
    fromMock.mockReturnValue({ select });

    await getTopicProgress();

    expect(fromMock).toHaveBeenCalledWith("topic_progress");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
  });

  test("returns an empty object when the user has no progress rows yet", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select } = mockSelectEq({ data: [], error: null });
    fromMock.mockReturnValue({ select });

    const result = await getTopicProgress();

    expect(result).toEqual({});
  });

  test("maps rows to a record keyed by topic_id", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select } = mockSelectEq({
      data: [
        { topic_id: "algorithms", study_count: 3, last_studied_at: "2026-01-02T00:00:00Z" },
        { topic_id: "ai", study_count: 1, last_studied_at: "2026-01-01T00:00:00Z" },
      ],
      error: null,
    });
    fromMock.mockReturnValue({ select });

    const result = await getTopicProgress();

    expect(result).toEqual({
      algorithms: {
        topicId: "algorithms",
        studyCount: 3,
        lastStudiedAt: "2026-01-02T00:00:00Z",
      },
      ai: {
        topicId: "ai",
        studyCount: 1,
        lastStudiedAt: "2026-01-01T00:00:00Z",
      },
    });
  });

  test("returns an empty object (not a crash) when the query fails", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select } = mockSelectEq({
      data: null,
      error: { message: "connection reset" },
    });
    fromMock.mockReturnValue({ select });

    const result = await getTopicProgress();

    expect(result).toEqual({});
  });
});

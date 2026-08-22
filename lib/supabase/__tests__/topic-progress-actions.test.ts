import { beforeEach, describe, expect, test, vi } from "vitest";

const {
  getServerUserMock,
  maybeSingleMock,
  upsertMock,
  fromMock,
  createClientMock,
} = vi.hoisted(() => {
  const getServerUserMock = vi.fn();
  const maybeSingleMock = vi.fn(() =>
    Promise.resolve<{ data: { study_count: number } | null; error: unknown }>({
      data: null,
      error: null,
    }),
  );
  const eqTopicMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const eqUserMock = vi.fn(() => ({ eq: eqTopicMock }));
  const selectMock = vi.fn(() => ({ eq: eqUserMock }));
  const upsertMock = vi.fn<
    (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>
  >(() => Promise.resolve({ error: null }));
  const fromMock = vi.fn(() => ({ select: selectMock, upsert: upsertMock }));
  const createClientMock = vi.fn(async () => ({ from: fromMock }));
  return {
    getServerUserMock,
    maybeSingleMock,
    upsertMock,
    fromMock,
    createClientMock,
    eqTopicMock,
    eqUserMock,
    selectMock,
  };
});

vi.mock("../server", () => ({
  getServerUser: getServerUserMock,
  createClient: createClientMock,
}));

import { recordTopicStudied } from "../topic-progress-actions";

beforeEach(() => {
  vi.clearAllMocks();
  getServerUserMock.mockResolvedValue({ id: "user-1" });
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
  upsertMock.mockResolvedValue({ error: null });
});

describe("recordTopicStudied", () => {
  test("rejects a topic id that isn't one of the existing static topics, without touching the database", async () => {
    const result = await recordTopicStudied("not-a-real-topic");

    expect(result).toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated request without touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await recordTopicStudied("algorithms");

    expect(result).toEqual({ ok: false });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("starts a never-studied topic at study_count 1", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await recordTopicStudied("algorithms");

    expect(result).toEqual({ ok: true });
    const [payload] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({
      user_id: "user-1",
      topic_id: "algorithms",
      study_count: 1,
    });
  });

  test("increments an existing study_count by exactly one", async () => {
    maybeSingleMock.mockResolvedValue({ data: { study_count: 4 }, error: null });

    await recordTopicStudied("algorithms");

    const [payload] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({ study_count: 5 });
  });

  test("stamps last_studied_at with a fresh timestamp on every call", async () => {
    await recordTopicStudied("algorithms");

    const [payload] = upsertMock.mock.calls[0] as [Record<string, unknown>];
    expect(typeof payload.last_studied_at).toBe("string");
    expect(Number.isNaN(Date.parse(payload.last_studied_at as string))).toBe(
      false,
    );
  });

  test("scopes the write to the authenticated user's own row, derived only from the session", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-42" });

    await recordTopicStudied("mathematics");

    const [payload, options] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({ user_id: "user-42" });
    expect(options).toEqual({ onConflict: "user_id,topic_id" });
  });

  test("returns ok: false (not a throw) when the read fails", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection reset" },
    });

    const result = await recordTopicStudied("algorithms");

    expect(result).toEqual({ ok: false });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  test("returns ok: false (not a throw) when the write fails", async () => {
    upsertMock.mockResolvedValue({ error: { message: "connection reset" } });

    const result = await recordTopicStudied("algorithms");

    expect(result).toEqual({ ok: false });
  });
});

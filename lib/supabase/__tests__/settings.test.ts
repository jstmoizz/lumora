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

import { getOrCreateUserSettings } from "../settings";

const EXISTING_ROW = {
  theme: "system" as const,
  response_style: "Detailed",
  explanation_depth: "In-depth",
  learning_focus: "Exam prep",
  updated_at: "2026-01-02T00:00:00Z",
};

const DEFAULT_ROW = {
  theme: "system" as const,
  response_style: "Clear and concise",
  explanation_depth: "Detailed",
  learning_focus: "General",
  updated_at: "2026-01-01T00:00:00Z",
};

function mockSelectMaybeSingle(result: { data: unknown; error?: unknown }) {
  const maybeSingleMock = vi.fn(() => Promise.resolve(result));
  const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  return { select: selectMock, selectMock, eqMock, maybeSingleMock };
}

function mockInsertSelectSingle(result: { data: unknown; error?: unknown }) {
  const singleMock = vi.fn(() => Promise.resolve(result));
  const selectMock = vi.fn(() => ({ single: singleMock }));
  const insertMock = vi.fn(() => ({ select: selectMock }));
  return { insert: insertMock, insertMock, selectMock, singleMock };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrCreateUserSettings", () => {
  test("returns null when no one is signed in, without querying the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await getOrCreateUserSettings();

    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("loads and maps an existing settings row for the signed-in user", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select, eqMock } = mockSelectMaybeSingle({
      data: EXISTING_ROW,
      error: null,
    });
    fromMock.mockReturnValue({ select });

    const result = await getOrCreateUserSettings();

    expect(fromMock).toHaveBeenCalledWith("user_settings");
    expect(eqMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(result).toEqual({
      theme: "system",
      responseStyle: "Detailed",
      explanationDepth: "In-depth",
      learningFocus: "Exam prep",
      updatedAt: "2026-01-02T00:00:00Z",
    });
  });

  test("creates a default row (only user_id supplied) when none exists yet, and returns it", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-2" });
    const { select } = mockSelectMaybeSingle({ data: null, error: null });
    const { insert, insertMock } = mockInsertSelectSingle({
      data: DEFAULT_ROW,
      error: null,
    });
    fromMock.mockReturnValue({ select, insert });

    const result = await getOrCreateUserSettings();

    // Only `user_id` is supplied on insert — every other column is left to
    // the database's own `default`, so this call proves the app never
    // duplicates those default values itself.
    expect(insertMock).toHaveBeenCalledWith({ user_id: "user-2" });
    expect(result).toEqual({
      theme: "system",
      responseStyle: "Clear and concise",
      explanationDepth: "Detailed",
      learningFocus: "General",
      updatedAt: "2026-01-01T00:00:00Z",
    });
  });

  test("returns null (not a fake default) when the initial select query itself fails", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1" });
    const { select } = mockSelectMaybeSingle({
      data: null,
      error: { message: "connection reset" },
    });
    fromMock.mockReturnValue({ select });

    const result = await getOrCreateUserSettings();

    expect(result).toBeNull();
  });

  test("returns null when creating the default row fails", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-2" });
    const { select } = mockSelectMaybeSingle({ data: null, error: null });
    const { insert } = mockInsertSelectSingle({
      data: null,
      error: { message: "insert failed" },
    });
    fromMock.mockReturnValue({ select, insert });

    const result = await getOrCreateUserSettings();

    expect(result).toBeNull();
  });
});

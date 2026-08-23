import { beforeEach, describe, expect, test, vi } from "vitest";

const { getServerUserMock, upsertMock, fromMock, createClientMock } =
  vi.hoisted(() => {
    const getServerUserMock = vi.fn();
    const upsertMock = vi.fn<
      (
        payload: Record<string, unknown>,
        options?: { onConflict: string },
      ) => Promise<{ error: { message: string } | null }>
    >(() => Promise.resolve({ error: null }));
    const fromMock = vi.fn(() => ({ upsert: upsertMock }));
    const createClientMock = vi.fn(async () => ({ from: fromMock }));
    return { getServerUserMock, upsertMock, fromMock, createClientMock };
  });

vi.mock("../server", () => ({
  getServerUser: getServerUserMock,
  createClient: createClientMock,
}));

import { updateUserSetting } from "../settings-actions";

beforeEach(() => {
  vi.clearAllMocks();
  upsertMock.mockResolvedValue({ error: null });
  getServerUserMock.mockResolvedValue({ id: "user-1" });
});

describe("updateUserSetting", () => {
  test("rejects an unauthenticated request without ever touching the database", async () => {
    getServerUserMock.mockResolvedValue(null);

    const result = await updateUserSetting("response_style", "Detailed");

    expect(result).toEqual({
      error: "You must be signed in to update your preferences.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("scopes the write to the authenticated user's own row, derived only from the session", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-42" });

    await updateUserSetting("learning_focus", "Exam prep");

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-42",
        learning_focus: "Exam prep",
      }),
      { onConflict: "user_id" },
    );
  });

  test("updates exactly the requested field and nothing else", async () => {
    await updateUserSetting("explanation_depth", "In-depth");

    const [payload] = upsertMock.mock.calls[0];
    expect(payload).toMatchObject({ explanation_depth: "In-depth" });
    expect(payload).not.toHaveProperty("response_style");
    expect(payload).not.toHaveProperty("learning_focus");
    expect(payload).not.toHaveProperty("theme");
  });

  test("returns no error on a successful update", async () => {
    const result = await updateUserSetting("response_style", "Conversational");
    expect(result).toEqual({ error: null });
  });

  test("surfaces a generic error, not the raw database message, when the write fails", async () => {
    upsertMock.mockResolvedValue({ error: { message: "connection reset" } });

    const result = await updateUserSetting("response_style", "Detailed");

    expect(result.error).toBe("Couldn't save that change. Please try again.");
    expect(result.error).not.toContain("connection reset");
  });

  test("rejects a field outside the whitelist without touching the database", async () => {
    // Bypasses TypeScript's own union type the same way a hand-crafted
    // request to the Server Action's endpoint would — the runtime
    // whitelist, not the compile-time type, is what actually has to stop
    // this, since a Server Action is still just a callable network
    // endpoint underneath.
    const result = await updateUserSetting(
      "user_id" as unknown as Parameters<typeof updateUserSetting>[0],
      "someone-elses-id",
    );

    expect(result).toEqual({ error: "That preference can't be changed." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("rejects an empty value without touching the database", async () => {
    const result = await updateUserSetting("response_style", "   ");

    expect(result).toEqual({ error: "That value isn't valid." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("rejects a value over the length limit without touching the database", async () => {
    const result = await updateUserSetting("response_style", "x".repeat(500));

    expect(result).toEqual({ error: "That value isn't valid." });
    expect(fromMock).not.toHaveBeenCalled();
  });

  describe("theme (Phase 4.4)", () => {
    test("accepts each of the three valid theme values", async () => {
      for (const value of ["system", "light", "dark"]) {
        const result = await updateUserSetting("theme", value);
        expect(result).toEqual({ error: null });
      }
    });

    test("updates exactly the theme column", async () => {
      await updateUserSetting("theme", "dark");

      const [payload] = upsertMock.mock.calls[0];
      expect(payload).toMatchObject({ theme: "dark" });
      expect(payload).not.toHaveProperty("response_style");
      expect(payload).not.toHaveProperty("explanation_depth");
      expect(payload).not.toHaveProperty("learning_focus");
    });

    test("rejects a value outside the fixed theme enum, unlike the free-text preference fields", async () => {
      const result = await updateUserSetting("theme", "solarized");

      expect(result).toEqual({ error: "That value isn't valid." });
      expect(fromMock).not.toHaveBeenCalled();
    });
  });
});

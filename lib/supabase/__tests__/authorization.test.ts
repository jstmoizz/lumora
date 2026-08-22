import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const singleMock = vi.fn();
const eqMock = vi.fn(() => ({ single: singleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const getServerUserMock = vi.fn();
const createClientMock = vi.fn(async () => ({ from: fromMock }));

vi.mock("../server", () => ({
  createClient: createClientMock,
  getServerUser: getServerUserMock,
}));

describe("getCurrentProfile / requireUser / requireAdmin", () => {
  beforeEach(() => {
    getServerUserMock.mockReset();
    singleMock.mockReset();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  test("getCurrentProfile returns null when no one is signed in, without ever querying the database", async () => {
    getServerUserMock.mockResolvedValue(null);
    const { getCurrentProfile } = await import("../authorization");

    const profile = await getCurrentProfile();

    expect(profile).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("getCurrentProfile queries by the session's own user id, not a client-supplied one", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1", email: "a@example.com" });
    singleMock.mockResolvedValue({
      data: { id: "user-1", email: "a@example.com", role: "user" },
    });
    const { getCurrentProfile } = await import("../authorization");

    const profile = await getCurrentProfile();

    expect(eqMock).toHaveBeenCalledWith("id", "user-1");
    expect(profile).toEqual({ id: "user-1", email: "a@example.com", role: "user" });
  });

  test("requireUser throws when no one is signed in", async () => {
    getServerUserMock.mockResolvedValue(null);
    const { requireUser } = await import("../authorization");

    await expect(requireUser()).rejects.toThrow(/Unauthorized/);
  });

  test("requireUser resolves the user when signed in", async () => {
    const user = { id: "user-1", email: "a@example.com" };
    getServerUserMock.mockResolvedValue(user);
    const { requireUser } = await import("../authorization");

    await expect(requireUser()).resolves.toBe(user);
  });

  test("requireAdmin throws for a signed-out visitor", async () => {
    getServerUserMock.mockResolvedValue(null);
    const { requireAdmin } = await import("../authorization");

    await expect(requireAdmin()).rejects.toThrow(/Forbidden/);
  });

  test("requireAdmin throws for a signed-in non-admin user", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1", email: "a@example.com" });
    singleMock.mockResolvedValue({
      data: { id: "user-1", email: "a@example.com", role: "user" },
    });
    const { requireAdmin } = await import("../authorization");

    await expect(requireAdmin()).rejects.toThrow(/Forbidden/);
  });

  test("requireAdmin resolves the profile for an admin user", async () => {
    getServerUserMock.mockResolvedValue({ id: "user-1", email: "admin@lumora.test" });
    singleMock.mockResolvedValue({
      data: { id: "user-1", email: "admin@lumora.test", role: "admin" },
    });
    const { requireAdmin } = await import("../authorization");

    await expect(requireAdmin()).resolves.toEqual({
      id: "user-1",
      email: "admin@lumora.test",
      role: "admin",
    });
  });
});

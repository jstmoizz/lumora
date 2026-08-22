import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const neqMock = vi.fn();
const eqMock = vi.fn(() => ({ neq: neqMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ update: updateMock }));
const createClientMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("createAdminClient", () => {
  const original = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.serviceRoleKey;
    vi.resetModules();
  });

  test("importing the module never throws, even without env vars set", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(import("../admin")).resolves.toBeDefined();
  });

  test("throws a clear, actionable error when the env vars are unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createAdminClient } = await import("../admin");
    expect(() => createAdminClient()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set/,
    );
  });

  test("constructs a client without throwing once both env vars are set", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    const { createAdminClient } = await import("../admin");
    expect(() => createAdminClient()).not.toThrow();
  });
});

describe("promoteIfConfiguredAdmin", () => {
  const original = {
    adminEmail: process.env.ADMIN_EMAIL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    neqMock.mockReset().mockResolvedValue({ error: null });
    eqMock.mockClear();
    updateMock.mockClear();
    fromMock.mockClear();
    createClientMock.mockClear();
  });

  afterEach(() => {
    process.env.ADMIN_EMAIL = original.adminEmail;
    process.env.NEXT_PUBLIC_SUPABASE_URL = original.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = original.serviceRoleKey;
    vi.resetModules();
  });

  test("no-ops without ever touching the database when ADMIN_EMAIL isn't configured", async () => {
    delete process.env.ADMIN_EMAIL;
    const { promoteIfConfiguredAdmin } = await import("../admin");

    await promoteIfConfiguredAdmin("user-1", "someone@example.com");

    expect(fromMock).not.toHaveBeenCalled();
  });

  test("no-ops when the email doesn't match ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "admin@lumora.test";
    const { promoteIfConfiguredAdmin } = await import("../admin");

    await promoteIfConfiguredAdmin("user-1", "someone-else@example.com");

    expect(fromMock).not.toHaveBeenCalled();
  });

  test("promotes to admin when the email matches, case-insensitively", async () => {
    process.env.ADMIN_EMAIL = "Admin@Lumora.test";
    const { promoteIfConfiguredAdmin } = await import("../admin");

    await promoteIfConfiguredAdmin("user-1", "admin@lumora.test");

    // `toHaveBeenCalledWith` is a deep-equality check, so this also proves
    // the update payload is *exactly* `{ role: "admin" }` — nothing else
    // leaks through, and the role is always this literal, never a value
    // derived from a parameter.
    expect(fromMock).toHaveBeenCalledWith("users");
    expect(updateMock).toHaveBeenCalledWith({ role: "admin" });
    expect(eqMock).toHaveBeenCalledWith("id", "user-1");
    expect(neqMock).toHaveBeenCalledWith("role", "admin");
  });
});

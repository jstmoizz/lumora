import { afterEach, describe, expect, test, vi } from "vitest";

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

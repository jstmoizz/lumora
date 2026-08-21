import { describe, expect, test } from "vitest";

describe("supabase browser client module", () => {
  test("importing the module never throws, even without env vars set", async () => {
    await expect(import("../client")).resolves.toBeDefined();
  });
});

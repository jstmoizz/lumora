import { beforeEach, describe, expect, test, vi } from "vitest";

const { requireUserMock, listConversationsMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  listConversationsMock: vi.fn(),
}));

vi.mock("@/lib/supabase/authorization", () => ({
  requireUser: requireUserMock,
}));
vi.mock("@/lib/supabase/conversations", () => ({
  listConversations: listConversationsMock,
}));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

describe("GET /api/conversations", () => {
  test("an unauthenticated request is rejected with 401 before touching the database", async () => {
    requireUserMock.mockRejectedValue(
      new Error("Unauthorized: no authenticated user."),
    );

    const response = await GET();

    expect(response.status).toBe(401);
    expect(listConversationsMock).not.toHaveBeenCalled();
  });

  test("returns the signed-in user's conversations", async () => {
    const conversations = [
      { id: "conv-1", title: "Explain osmosis", updatedAt: "2026-08-20T00:00:00Z" },
    ];
    listConversationsMock.mockResolvedValue(conversations);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ conversations });
  });
});

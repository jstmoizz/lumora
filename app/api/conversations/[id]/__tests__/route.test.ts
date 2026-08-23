import { beforeEach, describe, expect, test, vi } from "vitest";

const { requireUserMock, getConversationMessagesMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  getConversationMessagesMock: vi.fn(),
}));

vi.mock("@/lib/supabase/authorization", () => ({
  requireUser: requireUserMock,
}));
vi.mock("@/lib/supabase/conversations", () => ({
  getConversationMessages: getConversationMessagesMock,
}));

import { GET } from "../route";

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

describe("GET /api/conversations/[id]", () => {
  test("an unauthenticated request is rejected with 401 before touching the database", async () => {
    requireUserMock.mockRejectedValue(
      new Error("Unauthorized: no authenticated user."),
    );

    const response = await GET(new Request("http://localhost"), makeParams("conv-1"));

    expect(response.status).toBe(401);
    expect(getConversationMessagesMock).not.toHaveBeenCalled();
  });

  test("returns the conversation's messages", async () => {
    const messages = [{ id: "msg-1", role: "user", parts: [{ type: "text", text: "hi" }] }];
    getConversationMessagesMock.mockResolvedValue(messages);

    const response = await GET(new Request("http://localhost"), makeParams("conv-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ messages });
    expect(getConversationMessagesMock).toHaveBeenCalledWith("conv-1");
  });

  test("a nonexistent or someone-else's conversation id returns 404, indistinguishably", async () => {
    getConversationMessagesMock.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      makeParams("someone-elses-conversation"),
    );

    expect(response.status).toBe(404);
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  assistantMessageWithParts,
  userMessage,
} from "@/app/generate/__tests__/fixtures";
import type { LumoraUIMessage } from "@/lib/ai/tools";

const { requireUserMock, fromMock, createClientMock, streamTextMock } =
  vi.hoisted(() => {
    const requireUserMock = vi.fn();
    const fromMock = vi.fn();
    const createClientMock = vi.fn(async () => ({ from: fromMock }));
    const streamTextMock = vi.fn();
    return { requireUserMock, fromMock, createClientMock, streamTextMock };
  });

vi.mock("@/lib/supabase/authorization", () => ({
  requireUser: requireUserMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/ai/config", () => ({
  chatModel: "mock-model",
  GENERATION_CONFIG: {},
  SYSTEM_PROMPT: "test system prompt",
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

import { POST } from "../route";

interface QueryResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

interface SupabaseMockConfig {
  conversationLookup?: QueryResult;
  conversationInsert?: QueryResult;
  conversationUpdateError?: { message: string };
  messageInsertError?: { message: string };
}

// Mimics just enough of Supabase's fluent query builder for `conversations`
// and `messages` — the two tables app/api/chat/route.ts touches — without
// depending on a real database. `insert`/`update` mark which operation is
// in flight so `.single()`/the final `.eq()` resolve with the right
// test-configured result; `select` never changes that, since the route's
// own insert-then-select-id pattern (`.insert(...).select("id").single()`)
// is one logical operation, not a separate lookup.
function setupSupabaseMock(config: SupabaseMockConfig = {}) {
  const conversationsSelectSpy = vi.fn();
  const conversationsInsertSpy = vi.fn();
  const conversationsUpdateSpy = vi.fn();
  const messagesInsertSpy = vi.fn();

  fromMock.mockImplementation((table: string) => {
    if (table === "conversations") {
      let op: "insert" | "update" | null = null;
      const chain = {
        select: vi.fn((...args: unknown[]) => {
          conversationsSelectSpy(...args);
          return chain;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          op = "insert";
          conversationsInsertSpy(payload);
          return chain;
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          op = "update";
          conversationsUpdateSpy(payload);
          return chain;
        }),
        eq: vi.fn(() => {
          if (op === "update") {
            return Promise.resolve({
              error: config.conversationUpdateError ?? null,
            });
          }
          return chain;
        }),
        single: vi.fn(() => {
          if (op === "insert") {
            return Promise.resolve(
              config.conversationInsert ?? {
                data: { id: "new-conversation-id" },
                error: null,
              },
            );
          }
          return Promise.resolve(
            config.conversationLookup ?? { data: null, error: null },
          );
        }),
      };
      return chain;
    }

    if (table === "messages") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          messagesInsertSpy(payload);
          return Promise.resolve({
            error: config.messageInsertError ?? null,
          });
        }),
      };
    }

    throw new Error(`Unexpected table in test: ${table}`);
  });

  return {
    conversationsSelectSpy,
    conversationsInsertSpy,
    conversationsUpdateSpy,
    messagesInsertSpy,
  };
}

interface FakeOnEndEvent {
  responseMessage: LumoraUIMessage;
  isAborted?: boolean;
  finishReason?: "stop" | "length" | "error" | undefined;
}

// Stands in for `streamText(...).toUIMessageStreamResponse(options)` — runs
// the route's own `onEnd` callback (the hook the real AI SDK calls once the
// assistant's turn is over) with a test-controlled outcome, without ever
// calling a real model.
function setupStreamText(onEndEvent?: FakeOnEndEvent) {
  streamTextMock.mockReturnValue({
    toUIMessageStreamResponse: vi.fn(
      async (options: {
        onEnd?: (event: {
          responseMessage: LumoraUIMessage;
          isAborted: boolean;
          isContinuation: boolean;
          messages: LumoraUIMessage[];
          finishReason?: string;
        }) => Promise<void> | void;
      }) => {
        if (onEndEvent) {
          // `??` would treat an intentionally-passed `finishReason:
          // undefined` (simulating "no finish event ever arrived") the
          // same as "not provided" and silently default it back to
          // "stop" — so the fallback only applies when the key itself is
          // absent.
          const finishReason =
            "finishReason" in onEndEvent ? onEndEvent.finishReason : "stop";
          await options.onEnd?.({
            responseMessage: onEndEvent.responseMessage,
            isAborted: onEndEvent.isAborted ?? false,
            isContinuation: false,
            messages: [],
            finishReason,
          });
        }
        return new Response("ok");
      },
    ),
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GROQ_API_KEY = "test-groq-key";
  requireUserMock.mockResolvedValue({ id: "user-1" });
});

describe("authentication", () => {
  test("an unauthenticated request is rejected with 401 before any AI/DB work happens", async () => {
    requireUserMock.mockRejectedValue(
      new Error("Unauthorized: no authenticated user."),
    );
    setupSupabaseMock();

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));

    expect(response.status).toBe(401);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("an authenticated request proceeds to generate a response", async () => {
    setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([
        { type: "text", text: "hello", state: "done" },
      ]),
    });

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));

    expect(response.status).toBe(200);
    expect(streamTextMock).toHaveBeenCalled();
  });
});

describe("conversation ownership", () => {
  test("a request without conversationId creates a new conversation for the authenticated user", async () => {
    const spies = setupSupabaseMock({
      conversationInsert: { data: { id: "conv-new" }, error: null },
    });
    setupStreamText();

    await POST(makeRequest({ messages: [userMessage("hi")] }));

    expect(spies.conversationsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1" }),
    );
  });

  test("an existing conversation belonging to the current user can be continued", async () => {
    const spies = setupSupabaseMock({
      conversationLookup: { data: { id: "conv-existing" }, error: null },
    });
    setupStreamText();

    await POST(
      makeRequest({
        messages: [userMessage("hi")],
        conversationId: "conv-existing",
      }),
    );

    expect(spies.conversationsSelectSpy).toHaveBeenCalled();
    expect(spies.conversationsInsertSpy).not.toHaveBeenCalled();
    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-existing" }),
    );
  });

  test("another user's conversation cannot be accessed by guessing its id", async () => {
    // RLS scopes the lookup to the signed-in user, so a conversation that
    // exists but belongs to someone else comes back exactly like one that
    // doesn't exist at all: no row.
    setupSupabaseMock({ conversationLookup: { data: null, error: null } });
    setupStreamText();

    const response = await POST(
      makeRequest({
        messages: [userMessage("hi")],
        conversationId: "someone-elses-conversation",
      }),
    );

    expect(response.status).toBe(404);
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});

describe("persistence", () => {
  test("the user's message is persisted", async () => {
    const spies = setupSupabaseMock();
    setupStreamText();

    await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ role: "user", content: "Explain osmosis" }),
    );
  });

  test("a successful assistant response is persisted", async () => {
    const spies = setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([
        { type: "text", text: "Osmosis is the movement of water.", state: "done" },
      ]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        content: "Osmosis is the movement of water.",
      }),
    );
  });

  test("a failed generation does not create a fake assistant message", async () => {
    const spies = setupSupabaseMock();
    // No `finish` chunk ever arrived — the model call itself failed.
    setupStreamText({
      responseMessage: assistantMessageWithParts([]),
      finishReason: undefined,
    });

    await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

    const assistantInserts = spies.messagesInsertSpy.mock.calls.filter(
      ([payload]) => payload.role === "assistant",
    );
    expect(assistantInserts).toHaveLength(0);
  });

  test("an aborted (stopped) turn does not create an assistant message either", async () => {
    const spies = setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([
        { type: "text", text: "partial answer", state: "done" },
      ]),
      isAborted: true,
    });

    await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

    const assistantInserts = spies.messagesInsertSpy.mock.calls.filter(
      ([payload]) => payload.role === "assistant",
    );
    expect(assistantInserts).toHaveLength(0);
  });

  test("conversation updated_at changes after a successful completion", async () => {
    const spies = setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([
        { type: "text", text: "done", state: "done" },
      ]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("hi")] }));

    expect(spies.conversationsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ updated_at: expect.any(String) }),
    );
  });

  test("a failed generation does not bump conversation updated_at", async () => {
    const spies = setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([]),
      finishReason: undefined,
    });

    await POST(makeRequest({ messages: [userMessage("hi")] }));

    expect(spies.conversationsUpdateSpy).not.toHaveBeenCalled();
  });
});

describe("structured content", () => {
  test("tool/quiz content in the assistant's parts is preserved, not flattened to text", async () => {
    const spies = setupSupabaseMock();
    const quizPart = {
      type: "tool-createQuiz" as const,
      toolCallId: "call-1",
      state: "output-available" as const,
      input: { topic: "Cells", questions: [] },
      output: { quizId: "quiz-1", topic: "Cells", questions: [] },
    };
    setupStreamText({
      responseMessage: assistantMessageWithParts([quizPart]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("Quiz me on cells")] }));

    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        parts: [quizPart],
        // No text part exists on this message, so there's nothing to
        // populate the plain-text convenience column with.
        content: null,
      }),
    );
  });

  test("the user's structured parts are preserved as-is, not reduced to a string", async () => {
    const spies = setupSupabaseMock();
    setupStreamText();
    const message = userMessage("Explain recursion");

    await POST(makeRequest({ messages: [message] }));

    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ parts: message.parts }),
    );
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import { APICallError } from "ai";
import {
  assistantMessageWithParts,
  userMessage,
} from "@/app/generate/__tests__/fixtures";
import { MAX_IMAGE_BYTES } from "@/lib/ai/model";
import type { LumoraUIMessage } from "@/lib/ai/tools";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Real APICallError instances, so these tests exercise classifyAIError end
// to end, the same way a real Groq 429/5xx response would surface.
function rateLimitedProviderError(): APICallError {
  return new APICallError({
    message: "Rate limit reached for model qwen/qwen3.6-27b. Please try again in 7m25s.",
    url: GROQ_URL,
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
}

function providerUnavailableError(): APICallError {
  return new APICallError({
    message: "The server had an error while processing your request.",
    url: GROQ_URL,
    requestBodyValues: {},
    statusCode: 503,
    isRetryable: true,
  });
}

// A base64 data URL of a controlled byte size — the route never decodes
// the image, only measures/pattern-matches the string.
function makeDataUrl(mediaType: string, byteLength: number): string {
  const base64Length = Math.ceil((byteLength * 4) / 3 / 4) * 4;
  return `data:${mediaType};base64,${"A".repeat(base64Length)}`;
}

function userMessageWithImage(
  text: string,
  options: { mediaType?: string; byteLength?: number; extraImages?: number } = {},
  id = "user-1",
): LumoraUIMessage {
  const { mediaType = "image/png", byteLength = 1024, extraImages = 0 } = options;
  const imagePart = {
    type: "file" as const,
    mediaType,
    filename: "photo.png",
    url: makeDataUrl(mediaType, byteLength),
  };
  return {
    id,
    role: "user",
    parts: [
      { type: "text", text },
      imagePart,
      ...Array.from({ length: extraImages }, () => imagePart),
    ],
  };
}

const {
  requireUserMock,
  fromMock,
  createClientMock,
  streamTextMock,
  generateTextMock,
  createUIMessageStreamMock,
  createUIMessageStreamResponseMock,
  upsertKnowledgeNodeActivityMock,
} = vi.hoisted(() => {
  const requireUserMock = vi.fn();
  const fromMock = vi.fn();
  const createClientMock = vi.fn(async () => ({ from: fromMock }));
  const streamTextMock = vi.fn();
  const generateTextMock = vi.fn();
  const createUIMessageStreamMock = vi.fn();
  const createUIMessageStreamResponseMock = vi.fn();
  const upsertKnowledgeNodeActivityMock = vi.fn(() => Promise.resolve());
  return {
    requireUserMock,
    fromMock,
    createClientMock,
    streamTextMock,
    generateTextMock,
    createUIMessageStreamMock,
    createUIMessageStreamResponseMock,
    upsertKnowledgeNodeActivityMock,
  };
});

vi.mock("@/lib/supabase/authorization", () => ({
  requireUser: requireUserMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/knowledge-graph", () => ({
  upsertKnowledgeNodeActivity: upsertKnowledgeNodeActivityMock,
}));
vi.mock("@/lib/ai/config", () => ({
  textModel: "mock-text-model",
  visionModel: "mock-vision-model",
  resolveModel: (mode: string, hasImage: boolean) => {
    if (mode === "vision") return "mock-vision-model";
    if (mode === "fast") return "mock-text-model";
    return hasImage ? "mock-vision-model" : "mock-text-model";
  },
  GENERATION_CONFIG: {},
  SYSTEM_PROMPT: "test system prompt",
}));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: streamTextMock,
    generateText: generateTextMock,
    createUIMessageStream: createUIMessageStreamMock,
    createUIMessageStreamResponse: createUIMessageStreamResponseMock,
  };
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
// and `messages` without a real database.
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

// Stands in for streamText(...).toUIMessageStreamResponse(options) — runs
// the route's own onEnd callback with a test-controlled outcome.
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
          // undefined` the same as "not provided" — the fallback must only
          // apply when the key itself is absent.
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

// Simulates a provider/model failure reaching streamText's onError.
// Captures the route's onError return value (the safe AIErrorCode) in the
// mocked Response body so the test can assert on it directly.
function setupStreamTextError(error: unknown) {
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
        onError?: (error: unknown) => string;
      }) => {
        const errorText = options.onError?.(error);
        await options.onEnd?.({
          responseMessage: { id: "assistant-1", role: "assistant", parts: [] },
          isAborted: false,
          isContinuation: false,
          messages: [],
          finishReason: undefined,
        });
        return new Response(JSON.stringify({ errorText }));
      },
    ),
  });
}

const SAMPLE_EXTRACTION = {
  title: "Photosynthesis notes" as string | null,
  summary: "A diagram of the light-dependent reactions.",
  extractedContent: "Chlorophyll absorbs light energy...",
  keyConcepts: ["Chlorophyll", "Light-dependent reactions", "ATP"],
};

// Stands in for the image-extraction path's createUIMessageStream +
// createUIMessageStreamResponse pair, mirroring setupStreamText's "await
// onEnd deterministically" approach so tests can assert on persistence
// without racing a real background stream.
function setupImageExtraction(
  options: { extraction?: Partial<typeof SAMPLE_EXTRACTION>; rejectWith?: Error } = {},
) {
  if (options.rejectWith) {
    generateTextMock.mockRejectedValue(options.rejectWith);
  } else {
    generateTextMock.mockResolvedValue({
      toolCalls: [
        {
          toolCallId: "call-1",
          toolName: "recordExtraction",
          input: { ...SAMPLE_EXTRACTION, ...options.extraction },
        },
      ],
    });
  }

  createUIMessageStreamMock.mockImplementation(
    (streamOptions: {
      execute: (args: { writer: { write: (chunk: unknown) => void } }) => Promise<void>;
      onEnd?: (event: {
        responseMessage: LumoraUIMessage;
        isAborted: boolean;
        isContinuation: boolean;
        messages: LumoraUIMessage[];
        finishReason?: string;
      }) => Promise<void> | void;
      onError?: (error: unknown) => string;
    }) =>
      (async () => {
        const chunks: Array<{
          type: string;
          delta?: string;
          id?: string;
          data?: unknown;
          errorText?: unknown;
        }> = [];
        const writer = {
          write: (chunk: unknown) => {
            chunks.push(
              chunk as { type: string; delta?: string; id?: string; data?: unknown },
            );
          },
        };
        let responseMessage: LumoraUIMessage = { id: "assistant-1", role: "assistant", parts: [] };
        let finishReason: string | undefined = "stop";
        try {
          await streamOptions.execute({ writer });
          const text = chunks
            .filter((chunk) => chunk.type === "text-delta")
            .map((chunk) => chunk.delta ?? "")
            .join("");
          // Mirrors the real behavior: a data-* chunk becomes a
          // non-transient part on the finished message.
          const dataParts = chunks
            .filter((chunk) => chunk.type.startsWith("data-"))
            .map((chunk) => ({ type: chunk.type, id: chunk.id, data: chunk.data }));
          const parts = [
            ...dataParts,
            ...(text ? [{ type: "text" as const, text, state: "done" as const }] : []),
          ] as LumoraUIMessage["parts"];
          if (parts.length > 0) {
            responseMessage = { id: "assistant-1", role: "assistant", parts };
          }
        } catch (error) {
          finishReason = undefined;
          // Mirrors real createUIMessageStream behavior: an execute()
          // throw is caught and enqueued as {type: "error", errorText}.
          const errorText = streamOptions.onError?.(error);
          chunks.push({ type: "error", errorText });
        }
        await streamOptions.onEnd?.({
          responseMessage,
          isAborted: false,
          isContinuation: false,
          messages: [],
          finishReason,
        });
        return chunks;
      })(),
  );

  createUIMessageStreamResponseMock.mockImplementation(
    async ({ stream }: { stream: unknown }) => {
      await stream;
      return new Response("ok");
    },
  );
}

// Reads back the chunk list setupImageExtraction's mock produced for the
// most recent POST() call — the only way to observe what the extraction
// branch wrote to the stream.
async function getLastExtractionChunks(): Promise<
  Array<{ type: string; errorText?: unknown; data?: unknown }>
> {
  const lastCall = createUIMessageStreamMock.mock.results.at(-1);
  if (!lastCall || lastCall.type !== "return") return [];
  return lastCall.value as Promise<Array<{ type: string; errorText?: unknown; data?: unknown }>>;
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

  test("streams the response through a smoothing transform, not raw provider chunks", async () => {
    // Asserting only that some transform is wired in, not its exact
    // pacing, so tuning delayInMs/chunking later doesn't break this.
    setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([
        { type: "text", text: "hello", state: "done" },
      ]),
    });

    await POST(makeRequest({ messages: [userMessage("hi")] }));

    const [[callArgs]] = streamTextMock.mock.calls;
    expect(typeof callArgs.experimental_transform).toBe("function");
  });
});

describe("malformed messages", () => {
  test("a message with an unexpected part shape is rejected with 400 before streamText runs", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({
        messages: [
          {
            id: "user-1",
            role: "user",
            parts: [{ unexpected: "shape" }],
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid message format.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("`messages` not being an array is rejected with 400 before any DB work happens", async () => {
    setupSupabaseMock();

    const response = await POST(makeRequest({ messages: "not-an-array" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be JSON with a `messages` array.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  // titleFromMessage()/extractText() both call message.parts.filter(...)
  // before convertToModelMessages()'s own try/catch — a message missing
  // `parts` entirely used to throw past both, reaching neither an error
  // response nor the DB.
  test("a message missing `parts` entirely is rejected with 400 before any DB work happens, for a new conversation", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({ messages: [{ id: "user-1", role: "user" }] }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid message format.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("a message missing `parts` entirely is rejected with 400 before any DB work happens, for an existing conversation", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({
        messages: [{ id: "user-1", role: "user" }],
        conversationId: "conv-existing",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid message format.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("a null entry in `messages` is rejected with 400 rather than throwing", async () => {
    setupSupabaseMock();

    const response = await POST(makeRequest({ messages: [null] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid message format.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("mode routing and image attachments", () => {
  test("defaults to auto mode and the text model when no mode/image is given", async () => {
    setupSupabaseMock();
    setupStreamText();

    await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

    const [[callArgs]] = streamTextMock.mock.calls;
    expect(callArgs.model).toBe("mock-text-model");
  });

  test("auto mode with an attached image routes to the vision model via the extraction path, not streamText", async () => {
    setupSupabaseMock();
    setupImageExtraction();

    await POST(
      makeRequest({ messages: [userMessageWithImage("What is this?")] }),
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const [callArgs] = generateTextMock.mock.calls[0];
    expect(callArgs.model).toBe("mock-vision-model");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("vision mode with no image still routes to the vision model", async () => {
    setupSupabaseMock();
    setupStreamText();

    await POST(
      makeRequest({ messages: [userMessage("Explain osmosis")], mode: "vision" }),
    );

    const [[callArgs]] = streamTextMock.mock.calls;
    expect(callArgs.model).toBe("mock-vision-model");
  });

  test("vision mode with an attached image also routes to the vision model via the extraction path", async () => {
    setupSupabaseMock();
    setupImageExtraction();

    await POST(
      makeRequest({
        messages: [userMessageWithImage("What is this?")],
        mode: "vision",
      }),
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const [callArgs] = generateTextMock.mock.calls[0];
    expect(callArgs.model).toBe("mock-vision-model");
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("fast mode with an attached image is rejected with a clear 400, never reaching streamText", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({
        messages: [userMessageWithImage("What is this?")],
        mode: "fast",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Fast mode doesn't support images. Switch to Auto or Vision mode to send an image.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("an unrecognized mode value falls back to auto rather than rejecting the request", async () => {
    setupSupabaseMock();
    setupStreamText();

    await POST(
      makeRequest({ messages: [userMessage("Explain osmosis")], mode: "turbo" }),
    );

    const [[callArgs]] = streamTextMock.mock.calls;
    expect(callArgs.model).toBe("mock-text-model");
  });

  test("more than one image in a message is rejected with 400", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({
        messages: [userMessageWithImage("Compare these", { extraImages: 1 })],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Only one image is allowed per message.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("a disallowed image type is rejected with 400", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({
        messages: [userMessageWithImage("What is this?", { mediaType: "image/gif" })],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Images must be JPEG, PNG, or WebP.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("an oversized image is rejected with 400", async () => {
    setupSupabaseMock();

    const response = await POST(
      makeRequest({
        messages: [
          userMessageWithImage("What is this?", { byteLength: MAX_IMAGE_BYTES + 1024 }),
        ],
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Image must be 3MB or smaller.",
    });
    expect(streamTextMock).not.toHaveBeenCalled();
  });

  test("an attached image is stripped before the user message is persisted (no permanent image storage)", async () => {
    const spies = setupSupabaseMock();
    setupImageExtraction();

    await POST(
      makeRequest({ messages: [userMessageWithImage("What is this?")] }),
    );

    const userInsert = spies.messagesInsertSpy.mock.calls.find(
      ([payload]) => payload.role === "user",
    );
    expect(userInsert).toBeDefined();
    const persistedParts = userInsert?.[0].parts as LumoraUIMessage["parts"];
    expect(persistedParts.some((part) => part.type === "file")).toBe(false);
  });

  test("Qwen never receives the application tool registry for an image request", async () => {
    setupSupabaseMock();
    setupImageExtraction();

    await POST(
      makeRequest({ messages: [userMessageWithImage("Quiz me on this")] }),
    );

    const [callArgs] = generateTextMock.mock.calls[0];
    // Verified directly on the outgoing request: exactly one tool is
    // registered, and it isn't one of the application's.
    const toolNames = Object.keys(callArgs.tools);
    expect(toolNames).toEqual(["recordExtraction"]);
    expect(toolNames).not.toContain("createQuiz");
    expect(toolNames).not.toContain("createFlashcards");
    expect(toolNames).not.toContain("addKnowledgeTopic");
  });

  test("vision mode with no image still uses the normal tool-enabled streamText path, not extraction", async () => {
    setupSupabaseMock();
    setupStreamText();

    await POST(
      makeRequest({ messages: [userMessage("Explain osmosis")], mode: "vision" }),
    );

    expect(streamTextMock).toHaveBeenCalled();
    const [[callArgs]] = streamTextMock.mock.calls;
    expect(callArgs.tools).toBeDefined();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  test("an image request's extraction is persisted as the assistant's plain-text reply", async () => {
    const spies = setupSupabaseMock();
    setupImageExtraction({
      extraction: {
        summary: "A labeled diagram of a plant cell.",
        extractedContent: "Cell wall, chloroplast, nucleus.",
        keyConcepts: ["Cell wall", "Chloroplast", "Nucleus"],
      },
    });

    await POST(
      makeRequest({ messages: [userMessageWithImage("What is this?")] }),
    );

    const assistantInsert = spies.messagesInsertSpy.mock.calls.find(
      ([payload]) => payload.role === "assistant",
    );
    expect(assistantInsert).toBeDefined();
    const content = assistantInsert?.[0].content as string;
    expect(content).toContain("A labeled diagram of a plant cell.");
    expect(content).toContain("Cell wall, chloroplast, nucleus.");
    expect(content).toContain("Cell wall, Chloroplast, Nucleus");
  });

  test("a failed extraction does not persist a fake assistant message", async () => {
    const spies = setupSupabaseMock();
    setupImageExtraction({ rejectWith: new Error("provider error") });

    await POST(
      makeRequest({ messages: [userMessageWithImage("What is this?")] }),
    );

    const assistantInserts = spies.messagesInsertSpy.mock.calls.filter(
      ([payload]) => payload.role === "assistant",
    );
    expect(assistantInserts).toHaveLength(0);
  });

  test("the extraction is persisted as a structured data-extraction part, not just plain text", async () => {
    const spies = setupSupabaseMock();
    setupImageExtraction();

    await POST(
      makeRequest({ messages: [userMessageWithImage("What is this?")] }),
    );

    const assistantInsert = spies.messagesInsertSpy.mock.calls.find(
      ([payload]) => payload.role === "assistant",
    );
    const parts = assistantInsert?.[0].parts as LumoraUIMessage["parts"];
    const dataPart = parts.find((part) => part.type === "data-extraction");
    expect(dataPart).toBeDefined();
    expect((dataPart as { data: unknown }).data).toEqual(SAMPLE_EXTRACTION);
    // The plain-text mirror rides alongside it — history for a later
    // GPT-OSS turn, not for direct display.
    expect(parts.some((part) => part.type === "text")).toBe(true);
  });

  test("a later GPT-OSS turn never receives an image from earlier in the same conversation's history", async () => {
    setupSupabaseMock();
    setupStreamText();

    const priorImageTurn = userMessageWithImage("What is this?", {}, "user-1");
    const priorExtractionTurn: LumoraUIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "data-extraction", id: "extraction", data: SAMPLE_EXTRACTION },
        {
          type: "text",
          text: "A diagram of the light-dependent reactions.",
          state: "done",
        },
      ],
    };
    const followUp = userMessage(
      "Create a quiz based on Photosynthesis notes.",
      "user-2",
    );

    await POST(
      makeRequest({
        messages: [priorImageTurn, priorExtractionTurn, followUp],
        mode: "auto",
      }),
    );

    expect(streamTextMock).toHaveBeenCalled();
    const [[callArgs]] = streamTextMock.mock.calls;
    // The real convertToModelMessages runs here — asserting on its actual output.
    const serialized = JSON.stringify(callArgs.messages);
    expect(serialized).not.toContain("data:image");
  });

  // End-to-end across two real POST() calls: title, summary,
  // extractedContent, and keyConcepts must all survive the full
  // extraction -> persistence -> next-turn-history chain intact.
  test("the extracted title/summary/extractedContent/keyConcepts all reach GPT-OSS on the handoff turn", async () => {
    const spies = setupSupabaseMock();
    setupImageExtraction();

    await POST(makeRequest({ messages: [userMessageWithImage("What is this?")] }));

    const assistantInsert = spies.messagesInsertSpy.mock.calls.find(
      ([payload]) => payload.role === "assistant",
    );
    const persistedExtractionTurn = {
      id: "assistant-1",
      role: "assistant" as const,
      parts: assistantInsert?.[0].parts as LumoraUIMessage["parts"],
    };

    setupStreamText();
    const followUp = userMessage(
      `Create a quiz based on ${SAMPLE_EXTRACTION.title}.`,
      "user-2",
    );

    await POST(
      makeRequest({
        messages: [
          userMessageWithImage("What is this?"),
          persistedExtractionTurn,
          followUp,
        ],
        mode: "auto",
      }),
    );

    const [[callArgs]] = streamTextMock.mock.calls;
    const serialized = JSON.stringify(callArgs.messages);
    expect(serialized).toContain(SAMPLE_EXTRACTION.title);
    expect(serialized).toContain(SAMPLE_EXTRACTION.summary);
    expect(serialized).toContain(SAMPLE_EXTRACTION.extractedContent);
    for (const concept of SAMPLE_EXTRACTION.keyConcepts) {
      expect(serialized).toContain(concept);
    }
  });

  // Qwen returning genuinely weak content must not crash the pipeline or
  // produce garbage like "undefined"/"null" in the follow-up context.
  test("weak extraction content (no title, empty optional fields) still produces a valid, crash-free handoff turn", async () => {
    const spies = setupSupabaseMock();
    setupImageExtraction({
      extraction: { title: null, extractedContent: "", keyConcepts: [] },
    });

    const response = await POST(
      makeRequest({ messages: [userMessageWithImage("What is this?")] }),
    );
    expect(response.status).toBe(200);

    const assistantInsert = spies.messagesInsertSpy.mock.calls.find(
      ([payload]) => payload.role === "assistant",
    );
    const parts = assistantInsert?.[0].parts as LumoraUIMessage["parts"];
    const textPart = parts.find((part) => part.type === "text");
    // Only the summary is guaranteed non-empty here — no placeholder text
    // like "undefined" or "null" leaks in for the fields that were blank.
    expect((textPart as { text: string } | undefined)?.text).not.toMatch(/undefined|null/i);
  });
});

describe("provider/quota error handling", () => {
  const FORBIDDEN_LEAK_PATTERN = /groq|qwen|gpt-oss|tpd|tpm|please try again in \d/i;

  describe("image extraction failures", () => {
    test("a rate-limited extraction failure surfaces the safe RATE_LIMITED code, never the raw provider error", async () => {
      setupSupabaseMock();
      setupImageExtraction({ rejectWith: rateLimitedProviderError() });

      await POST(makeRequest({ messages: [userMessageWithImage("What is this?")] }));

      const chunks = await getLastExtractionChunks();
      const errorChunk = chunks.find((chunk) => chunk.type === "error");
      expect(errorChunk?.errorText).toBe("RATE_LIMITED");
      expect(JSON.stringify(chunks)).not.toMatch(FORBIDDEN_LEAK_PATTERN);
    });

    test("a provider-unavailable extraction failure surfaces the safe PROVIDER_UNAVAILABLE code", async () => {
      setupSupabaseMock();
      setupImageExtraction({ rejectWith: providerUnavailableError() });

      await POST(makeRequest({ messages: [userMessageWithImage("What is this?")] }));

      const chunks = await getLastExtractionChunks();
      const errorChunk = chunks.find((chunk) => chunk.type === "error");
      expect(errorChunk?.errorText).toBe("PROVIDER_UNAVAILABLE");
    });

    test("a generic extraction failure surfaces the safe GENERATION_FAILED code", async () => {
      setupSupabaseMock();
      setupImageExtraction({
        rejectWith: new Error("The vision model did not report an extraction."),
      });

      await POST(makeRequest({ messages: [userMessageWithImage("What is this?")] }));

      const chunks = await getLastExtractionChunks();
      const errorChunk = chunks.find((chunk) => chunk.type === "error");
      expect(errorChunk?.errorText).toBe("GENERATION_FAILED");
    });

    test("none of the three extraction failure cases ever persist an assistant message", async () => {
      const spies = setupSupabaseMock();
      for (const error of [
        rateLimitedProviderError(),
        providerUnavailableError(),
        new Error("boom"),
      ]) {
        setupImageExtraction({ rejectWith: error });
        await POST(makeRequest({ messages: [userMessageWithImage("What is this?")] }));
      }

      const assistantInserts = spies.messagesInsertSpy.mock.calls.filter(
        ([payload]) => payload.role === "assistant",
      );
      expect(assistantInserts).toHaveLength(0);
    });
  });

  describe("normal generation (GPT-OSS/Qwen text) failures", () => {
    test("a rate-limited generation failure surfaces the safe RATE_LIMITED code, never the raw provider error", async () => {
      const spies = setupSupabaseMock();
      setupStreamTextError(rateLimitedProviderError());

      const response = await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

      const body = (await response.json()) as { errorText?: string };
      expect(body.errorText).toBe("RATE_LIMITED");
      expect(JSON.stringify(body)).not.toMatch(FORBIDDEN_LEAK_PATTERN);
      expect(
        spies.messagesInsertSpy.mock.calls.filter(([payload]) => payload.role === "assistant"),
      ).toHaveLength(0);
    });

    test("a provider-unavailable generation failure surfaces the safe PROVIDER_UNAVAILABLE code", async () => {
      setupSupabaseMock();
      setupStreamTextError(providerUnavailableError());

      const response = await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

      const body = (await response.json()) as { errorText?: string };
      expect(body.errorText).toBe("PROVIDER_UNAVAILABLE");
    });

    test("a generic generation failure surfaces the safe GENERATION_FAILED code", async () => {
      setupSupabaseMock();
      setupStreamTextError(new Error("Something unrelated broke."));

      const response = await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

      const body = (await response.json()) as { errorText?: string };
      expect(body.errorText).toBe("GENERATION_FAILED");
    });

    test("a rate-limited failure during the createQuiz handoff (mode: auto, text-only) is classified the same way", async () => {
      setupSupabaseMock();
      setupStreamTextError(rateLimitedProviderError());

      const response = await POST(
        makeRequest({
          messages: [userMessage("Create a quiz based on Photosynthesis notes.")],
          mode: "auto",
        }),
      );

      const body = (await response.json()) as { errorText?: string };
      expect(body.errorText).toBe("RATE_LIMITED");
    });
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
    // RLS scopes the lookup, so a conversation belonging to someone else
    // comes back exactly like one that doesn't exist.
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

// A retry of the very first message of a session — before the client ever
// learned a conversationId — arrives here exactly like an initial
// submission except for the trigger value.
describe("retry (regenerate-message)", () => {
  test("regenerate-message with no conversationId is treated like an initial submission: a conversation is created and the user message is persisted", async () => {
    const spies = setupSupabaseMock({
      conversationInsert: { data: { id: "conv-new" }, error: null },
    });
    setupStreamText();

    await POST(
      makeRequest({
        messages: [userMessage("Explain osmosis")],
        trigger: "regenerate-message",
      }),
    );

    expect(spies.conversationsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1" }),
    );
    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        content: "Explain osmosis",
        conversation_id: "conv-new",
      }),
    );
  });

  test("regenerate-message with a known conversationId does not re-persist the already-saved user message", async () => {
    const spies = setupSupabaseMock({
      conversationLookup: { data: { id: "conv-existing" }, error: null },
    });
    setupStreamText();

    await POST(
      makeRequest({
        messages: [userMessage("Explain osmosis")],
        conversationId: "conv-existing",
        trigger: "regenerate-message",
      }),
    );

    expect(spies.conversationsInsertSpy).not.toHaveBeenCalled();
    const userInserts = spies.messagesInsertSpy.mock.calls.filter(
      ([payload]) => payload.role === "user",
    );
    expect(userInserts).toHaveLength(0);
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

describe("knowledge graph integration", () => {
  test("a finished createQuiz tool call upserts a knowledge-graph node", async () => {
    setupSupabaseMock();
    const quizPart = {
      type: "tool-createQuiz" as const,
      toolCallId: "call-1",
      state: "output-available" as const,
      input: { topic: "Cells", questions: [] },
      output: {
        quizId: "quiz-1",
        topic: "Cells",
        questions: [],
        relatedTopics: ["Mitochondria", "Cell Membrane"],
        category: "Biology",
      },
    };
    setupStreamText({
      responseMessage: assistantMessageWithParts([quizPart]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("Quiz me on cells")] }));

    expect(upsertKnowledgeNodeActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      {
        label: "Cells",
        kind: "quiz",
        relatedTopics: ["Mitochondria", "Cell Membrane"],
        category: "Biology",
      },
    );
  });

  test("a finished createFlashcards tool call upserts a knowledge-graph node", async () => {
    setupSupabaseMock();
    const flashcardsPart = {
      type: "tool-createFlashcards" as const,
      toolCallId: "call-1",
      state: "output-available" as const,
      input: { topic: "Cells", cards: [] },
      output: { flashcardSetId: "set-1", topic: "Cells", cards: [] },
    };
    setupStreamText({
      responseMessage: assistantMessageWithParts([flashcardsPart]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("Flashcards on cells")] }));

    expect(upsertKnowledgeNodeActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      { label: "Cells", kind: "flashcards", relatedTopics: undefined },
    );
  });

  test("a plain text turn with no tool call never touches the knowledge graph", async () => {
    setupSupabaseMock();
    setupStreamText({
      responseMessage: assistantMessageWithParts([
        { type: "text", text: "Osmosis is the movement of water.", state: "done" },
      ]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("Explain osmosis")] }));

    expect(upsertKnowledgeNodeActivityMock).not.toHaveBeenCalled();
  });

  test("a knowledge-graph write failure doesn't prevent the assistant message from being persisted", async () => {
    const spies = setupSupabaseMock();
    upsertKnowledgeNodeActivityMock.mockRejectedValueOnce(new Error("db error"));
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

    await expect(
      POST(makeRequest({ messages: [userMessage("Quiz me on cells")] })),
    ).resolves.toBeInstanceOf(Response);
    expect(spies.messagesInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ role: "assistant" }),
    );
  });

  test("a finished addKnowledgeTopic tool call upserts a knowledge-graph node with kind 'manual'", async () => {
    setupSupabaseMock();
    const addTopicPart = {
      type: "tool-addKnowledgeTopic" as const,
      toolCallId: "call-1",
      state: "output-available" as const,
      input: { topic: "World War II" },
      output: {
        topic: "World War II",
        relatedTopics: ["World War I", "The Cold War", "The Treaty of Versailles"],
        category: "20th Century History",
        summary: "A global conflict from 1939 to 1945.",
      },
    };
    setupStreamText({
      responseMessage: assistantMessageWithParts([addTopicPart]),
      finishReason: "stop",
    });

    await POST(makeRequest({ messages: [userMessage("Add World War II to my knowledge graph")] }));

    expect(upsertKnowledgeNodeActivityMock).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      {
        label: "World War II",
        kind: "manual",
        relatedTopics: ["World War I", "The Cold War", "The Treaty of Versailles"],
        category: "20th Century History",
        summary: "A global conflict from 1939 to 1945.",
      },
    );
  });
});

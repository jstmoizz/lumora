import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { APICallError } from "ai";
import { userMessage } from "@/app/generate/__tests__/fixtures";

// This suite exercises the *real* streamText / toUIMessageStream /
// createUIMessageStream machinery (only `@/lib/ai/config` and the token
// budget are faked) so the Gemini-attempt-then-Groq-fallback logic in
// app/api/chat/route.ts is covered by genuine execution, not mocks that
// stand in for it. route.test.ts keeps `canAttemptGemini` false throughout;
// here it can be true.

// Compat-mode ("v2") fake models are enough to drive streamText; silence
// the per-call warning they'd otherwise log.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;

type V2Chunk = Record<string, unknown> & { type: string };
type DoStream = (options: {
  abortSignal?: AbortSignal;
}) => Promise<{ stream: ReadableStream<V2Chunk> }>;

const {
  requireUserMock,
  fromMock,
  createClientMock,
  checkChatRateLimitMock,
  upsertKnowledgeNodeActivityMock,
  budgetCheckMock,
  budgetRecordMock,
  geminiDoStream,
  groqDoStream,
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  fromMock: vi.fn(),
  createClientMock: vi.fn(),
  checkChatRateLimitMock: vi.fn(() => ({ ok: true, retryAfterSeconds: 0 })),
  upsertKnowledgeNodeActivityMock: vi.fn(() => Promise.resolve()),
  budgetCheckMock: vi.fn<(key: string) => { ok: boolean }>(() => ({ ok: true })),
  budgetRecordMock: vi.fn<(key: string, tokens: number) => void>(),
  geminiDoStream: vi.fn<DoStream>(),
  groqDoStream: vi.fn<DoStream>(),
}));

function fakeModel(modelId: string, doStream: DoStream) {
  return {
    specificationVersion: "v2" as const,
    provider: "fake",
    modelId,
    supportedUrls: {},
    doStream,
  };
}

vi.mock("@/lib/ai/config", () => ({
  geminiModel: fakeModel("fake-gemini", (opts) => geminiDoStream(opts)),
  textModel: fakeModel("fake-groq-text", (opts) => groqDoStream(opts)),
  visionModel: fakeModel("fake-groq-vision", (opts) => groqDoStream(opts)),
  isE2eMockAiEnabled: () => false,
  resolveModel: () => fakeModel("fake-groq-text", (opts) => groqDoStream(opts)),
  GENERATION_CONFIG: {},
  SYSTEM_PROMPT: "test system prompt",
}));

vi.mock("@/lib/ai/gemini-budget", () => ({
  geminiTokenBudget: {
    check: (key: string) => budgetCheckMock(key),
    record: (key: string, tokens: number) => budgetRecordMock(key, tokens),
  },
}));

vi.mock("@/lib/supabase/authorization", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/api/rate-limit", () => ({ checkChatRateLimit: checkChatRateLimitMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/supabase/knowledge-graph", () => ({
  upsertKnowledgeNodeActivity: upsertKnowledgeNodeActivityMock,
}));

import { POST } from "../route";

const assistantInserts: Array<Record<string, unknown>> = [];

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// A v2 model stream that produces `text` then finishes cleanly.
function okStream(text: string): ReadableStream<V2Chunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "t" });
      controller.enqueue({ type: "text-delta", id: "t", delta: text });
      controller.enqueue({ type: "text-end", id: "t" });
      controller.enqueue({
        type: "finish",
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      });
      controller.close();
    },
  });
}

// A v2 model stream that fails immediately with a provider error part
// (what streamText surfaces for a 429/5xx before any content).
function errorPartStream(error: unknown): ReadableStream<V2Chunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "error", error });
      controller.close();
    },
  });
}

// Streams some text, then fails — the failure arrives after the peek has
// already committed to this provider.
function textThenErrorStream(text: string, error: unknown): ReadableStream<V2Chunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "t" });
      controller.enqueue({ type: "text-delta", id: "t", delta: text });
      controller.enqueue({ type: "error", error });
      controller.close();
    },
  });
}

async function readSse(response: Response): Promise<V2Chunk[]> {
  const body = await response.text();
  return body
    .split("\n\n")
    .map((line) => line.replace(/^data: /, "").trim())
    .filter((payload) => payload && payload !== "[DONE]")
    .map((payload) => JSON.parse(payload) as V2Chunk);
}

function textOf(chunks: V2Chunk[]): string {
  return chunks
    .filter((c) => c.type === "text-delta")
    .map((c) => String(c.delta ?? ""))
    .join("");
}

function rateLimited(): APICallError {
  return new APICallError({
    message: "Rate limit reached. Please try again in 7m.",
    url: "https://example.test",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  assistantInserts.length = 0;
  process.env.GROQ_API_KEY = "test-groq-key";
  vi.stubEnv("GOOGLE_API_KEY", "test-google-key");
  requireUserMock.mockResolvedValue({ id: "user-1" });
  budgetCheckMock.mockReturnValue({ ok: true });

  fromMock.mockImplementation((table: string) => {
    if (table === "conversations") {
      const chain: Record<string, unknown> = {};
      let op: "insert" | "update" | null = null;
      Object.assign(chain, {
        select: vi.fn(() => chain),
        insert: vi.fn(() => {
          op = "insert";
          return chain;
        }),
        update: vi.fn(() => {
          op = "update";
          return chain;
        }),
        eq: vi.fn(() => (op === "update" ? Promise.resolve({ error: null }) : chain)),
        single: vi.fn(() =>
          Promise.resolve(
            op === "insert"
              ? { data: { id: "conv-1" }, error: null }
              : { data: null, error: null },
          ),
        ),
      });
      return chain;
    }
    if (table === "messages") {
      return {
        insert: vi.fn((payload: Record<string, unknown>) => {
          if (payload.role === "assistant") assistantInserts.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  createClientMock.mockResolvedValue({ from: fromMock });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Gemini primary / Groq fallback", () => {
  test("a healthy Gemini response is streamed to the client and its tokens are recorded", async () => {
    geminiDoStream.mockResolvedValue({ stream: okStream("answer from gemini") });
    groqDoStream.mockResolvedValue({ stream: okStream("answer from groq") });

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));
    const chunks = await readSse(response);

    expect(textOf(chunks)).toBe("answer from gemini");
    expect(geminiDoStream).toHaveBeenCalledTimes(1);
    expect(groqDoStream).not.toHaveBeenCalled();
    expect(budgetRecordMock).toHaveBeenCalledWith("user-1", 15);
    expect(chunks.some((c) => c.type === "error")).toBe(false);
    expect(assistantInserts).toHaveLength(1);
  });

  test("a Gemini error before any output silently falls back to Groq", async () => {
    geminiDoStream.mockResolvedValue({ stream: errorPartStream(rateLimited()) });
    groqDoStream.mockResolvedValue({ stream: okStream("answer from groq") });

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));
    const chunks = await readSse(response);

    expect(textOf(chunks)).toBe("answer from groq");
    expect(geminiDoStream).toHaveBeenCalledTimes(1);
    expect(groqDoStream).toHaveBeenCalledTimes(1);
    expect(chunks.some((c) => c.type === "error")).toBe(false);
    expect(budgetRecordMock).not.toHaveBeenCalled();
  });

  test("a Gemini failure mid-stream surfaces a classified error and is NOT retried on Groq", async () => {
    geminiDoStream.mockResolvedValue({
      stream: textThenErrorStream("partial ", rateLimited()),
    });
    groqDoStream.mockResolvedValue({ stream: okStream("answer from groq") });

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));
    const chunks = await readSse(response);

    expect(textOf(chunks)).toBe("partial ");
    expect(groqDoStream).not.toHaveBeenCalled();
    const errorChunk = chunks.find((c) => c.type === "error");
    expect(errorChunk?.errorText).toBe("RATE_LIMITED");
    expect(JSON.stringify(chunks)).not.toMatch(/try again in 7m|api\.groq|generativelanguage/i);
    // A turn that ended in a provider error must not be persisted.
    expect(assistantInserts).toHaveLength(0);
  });

  test("an exhausted daily token budget skips Gemini entirely", async () => {
    budgetCheckMock.mockReturnValue({ ok: false });
    groqDoStream.mockResolvedValue({ stream: okStream("answer from groq") });

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));
    const chunks = await readSse(response);

    expect(textOf(chunks)).toBe("answer from groq");
    expect(geminiDoStream).not.toHaveBeenCalled();
    expect(groqDoStream).toHaveBeenCalledTimes(1);
  });

  test("a missing GOOGLE_API_KEY skips Gemini entirely", async () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    groqDoStream.mockResolvedValue({ stream: okStream("answer from groq") });

    const response = await POST(makeRequest({ messages: [userMessage("hi")] }));
    const chunks = await readSse(response);

    expect(textOf(chunks)).toBe("answer from groq");
    expect(geminiDoStream).not.toHaveBeenCalled();
    expect(budgetCheckMock).not.toHaveBeenCalled();
  });

  test("Gemini accepting the request but never streaming falls back to Groq once the first-chunk timeout fires", async () => {
    vi.useFakeTimers();
    try {
      geminiDoStream.mockImplementation(async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            abortSignal?.addEventListener("abort", () => {
              try {
                controller.error(abortSignal.reason ?? new Error("aborted"));
              } catch {
                /* already closed */
              }
            });
          },
        }),
      }));
      groqDoStream.mockResolvedValue({ stream: okStream("answer from groq") });

      const responsePromise = POST(makeRequest({ messages: [userMessage("hi")] }));
      await vi.advanceTimersByTimeAsync(16_000);
      const response = await responsePromise;
      const chunks = await readSse(response);

      expect(geminiDoStream).toHaveBeenCalledTimes(1);
      expect(groqDoStream).toHaveBeenCalledTimes(1);
      expect(textOf(chunks)).toBe("answer from groq");
      expect(chunks.some((c) => c.type === "error")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

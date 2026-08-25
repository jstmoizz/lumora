import { beforeEach, describe, expect, test, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
}));

vi.mock("@/lib/ai/config", () => ({
  visionModel: "mock-vision-model",
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: generateTextMock };
});

import { extractImageContent, imageExtractionSchema } from "../extraction";

const SAMPLE_IMAGE = {
  mediaType: "image/png",
  filename: "notes.png",
  url: "data:image/png;base64,aGVsbG8=",
};

const SAMPLE_EXTRACTION = {
  title: "Photosynthesis notes",
  summary: "A diagram of the light-dependent reactions.",
  extractedContent: "Chlorophyll absorbs light energy...",
  keyConcepts: ["Chlorophyll", "Light-dependent reactions", "ATP"],
};

function toolCallResult(input: unknown, toolName = "recordExtraction") {
  return { toolCalls: [{ toolCallId: "call-1", toolName, input }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateTextMock.mockResolvedValue(toolCallResult(SAMPLE_EXTRACTION));
});

describe("imageExtractionSchema", () => {
  test("accepts a well-formed extraction object", () => {
    expect(imageExtractionSchema.safeParse(SAMPLE_EXTRACTION).success).toBe(true);
  });

  test("title may be null and keyConcepts may be empty, but every key must be present", () => {
    // `title` is nullable rather than `.optional()` — see extraction.ts's
    // own comment on why every property stays required in the schema.
    expect(
      imageExtractionSchema.safeParse({
        title: null,
        summary: "A summary.",
        extractedContent: "Some content.",
        keyConcepts: [],
      }).success,
    ).toBe(true);

    expect(
      imageExtractionSchema.safeParse({
        extractedContent: "Some content.",
        keyConcepts: [],
      }).success,
    ).toBe(false);
    expect(
      imageExtractionSchema.safeParse({ title: null, summary: "A summary.", keyConcepts: [] })
        .success,
    ).toBe(false);
  });
});

describe("extractImageContent", () => {
  test("calls generateText with the vision model and only the internal recordExtraction tool — no application tools", async () => {
    await extractImageContent({ image: SAMPLE_IMAGE, userText: "What is this?" });

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const [callArgs] = generateTextMock.mock.calls[0];
    expect(callArgs.model).toBe("mock-vision-model");

    // The critical requirement: no application tool (createQuiz,
    // createFlashcards, addKnowledgeTopic, or anything else) reaches this
    // call — verified directly on the outgoing request, not inferred from
    // the response. Exactly one tool is registered, and it isn't one of
    // the application's.
    const toolNames = Object.keys(callArgs.tools);
    expect(toolNames).toEqual(["recordExtraction"]);
    expect(toolNames).not.toContain("createQuiz");
    expect(toolNames).not.toContain("createFlashcards");
    expect(toolNames).not.toContain("addKnowledgeTopic");

    // The model is forced to call it, not merely offered it as an option.
    expect(callArgs.toolChoice).toEqual({ type: "tool", toolName: "recordExtraction" });
  });

  test("the outgoing request carries the image as a message part, not just as loose config", async () => {
    await extractImageContent({ image: SAMPLE_IMAGE, userText: "What is this?" });

    const [callArgs] = generateTextMock.mock.calls[0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage).toBeDefined();
    const content = JSON.stringify(userMessage.content);
    expect(content).toContain(SAMPLE_IMAGE.url);
  });

  test("the system prompt is extraction-only and never mentions application tools", async () => {
    await extractImageContent({ image: SAMPLE_IMAGE });

    const [callArgs] = generateTextMock.mock.calls[0];
    const system = String(callArgs.system).toLowerCase();
    expect(system).not.toMatch(/createquiz|createflashcards|addknowledgetopic/);
  });

  test("falls back to a generic extraction prompt when the user sent no text with the image", async () => {
    await extractImageContent({ image: SAMPLE_IMAGE });

    const [callArgs] = generateTextMock.mock.calls[0];
    const content = JSON.stringify(callArgs.messages);
    expect(content).toMatch(/extract/i);
  });

  test("returns the recordExtraction tool call's validated input", async () => {
    const result = await extractImageContent({ image: SAMPLE_IMAGE });
    expect(result).toEqual(SAMPLE_EXTRACTION);
  });

  test("throws a clear error if the model never calls recordExtraction", async () => {
    generateTextMock.mockResolvedValue({ toolCalls: [] });

    await expect(extractImageContent({ image: SAMPLE_IMAGE })).rejects.toThrow(
      /did not report an extraction/,
    );
  });
});

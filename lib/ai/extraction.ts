/**
 * Vision-only image extraction: Qwen inspects an attached image and returns
 * structured, tool-free study content. This is the first stage of a
 * two-stage image pipeline — Qwen extracts here; a later stage (not yet
 * built) decides what, if anything, to do with the extraction, including
 * any application tool calls.
 *
 * Kept in its own module, separate from lib/ai/config.ts's tool-enabled
 * SYSTEM_PROMPT/streamText path, so it's structurally impossible for an
 * application tool to end up in this request — this module never imports
 * lib/ai/tools.ts. The only tool ever registered here is `recordExtraction`
 * below, a plain structured-output capture mechanism, not an application
 * capability — see its own comment for why it exists and why it's safe.
 */

import { convertToModelMessages, generateText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { visionModel } from "./config";

// `title` is nullable rather than `.optional()` so a schema-validating
// consumer downstream doesn't need special-casing for a missing key versus
// an explicit "there isn't one" — the model always reports one or the
// other. (Groq's own `response_format: json_schema` mode enforces this same
// "every property must be listed in `required`" rule and was the original
// reason this was written as `.nullable()` — see the comment on
// `recordExtractionTool` below for why this module doesn't use that mode at
// all anymore, but the nullable shape is worth keeping regardless.)
export const imageExtractionSchema = z.object({
  title: z.string().nullable(),
  summary: z.string(),
  extractedContent: z.string(),
  keyConcepts: z.array(z.string()),
});

export type ImageExtraction = z.infer<typeof imageExtractionSchema>;

// Deliberately short and vision-only — no tool-use instructions, nothing
// naming createQuiz/createFlashcards/addKnowledgeTopic, nothing for a later
// tool-enabled stage to trip over.
const EXTRACTION_SYSTEM_PROMPT = `You are looking at an image attached to a study app. Extract its study-relevant content — nothing else.

- Transcribe relevant text accurately, including headings, definitions, terminology, and equations where possible.
- Identify the important concepts the image is teaching or illustrating.
- For diagrams, charts, or figures, describe what they show in plain language.
- Ignore purely decorative elements (backgrounds, borders, unrelated clutter).
- Never invent content that isn't actually in the image.
- If part of the image is unreadable or ambiguous, say so plainly instead of guessing.

Report what you found using the recordExtraction tool.`;

// A single internal tool that exists only to capture the model's structured
// output in a reliable, schema-validated shape. This is NOT an application
// capability like createQuiz/createFlashcards/addKnowledgeTopic — it never
// touches the database, never renders anything, and is never registered
// alongside the real application tools (lib/ai/tools.ts isn't even
// imported here). It's forced via `toolChoice` below, purely as a
// structured-output mechanism.
//
// This exists because the more obvious approach — `generateObject()`,
// which drives structured output through `response_format` — turned out to
// be broken for this exact combination: confirmed directly against the
// real Groq API, an otherwise-identical request to qwen/qwen3.6-27b
// succeeds with no `response_format` and fails with "invalid image data"
// the instant one is added, regardless of whether it's `json_schema` mode
// or plain `json_object` mode. Forcing a single tool call sidesteps that
// entirely, since image content plus tool-calling is the one combination
// this model *does* support — also confirmed directly, including with a
// real application-shaped tool call.
const recordExtractionTool = tool({
  description: "Record the study content extracted from the image.",
  inputSchema: imageExtractionSchema,
  execute: async (input) => input,
});

interface ExtractImageContentInput {
  image: { mediaType: string; filename?: string; url: string };
  // The user's own message text alongside the image, if any (e.g. "quiz me
  // on this") — passed through only as context to help extraction focus on
  // what's relevant, never as an instruction to act on. Extraction never
  // has application tools to act with regardless.
  userText?: string;
}

/**
 * Runs the vision-only extraction pass.
 */
export async function extractImageContent({
  image,
  userText,
}: ExtractImageContentInput): Promise<ImageExtraction> {
  const modelMessages: ModelMessage[] = await convertToModelMessages([
    {
      role: "user",
      parts: [
        {
          type: "text",
          text: userText?.trim() || "Extract the study-relevant content from this image.",
        },
        {
          type: "file",
          mediaType: image.mediaType,
          filename: image.filename,
          url: image.url,
        },
      ],
    },
  ]);

  const { toolCalls } = await generateText({
    model: visionModel,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: modelMessages,
    tools: { recordExtraction: recordExtractionTool },
    toolChoice: { type: "tool", toolName: "recordExtraction" },
  });

  const call = toolCalls.find((toolCall) => toolCall.toolName === "recordExtraction");
  if (!call) {
    throw new Error("The vision model did not report an extraction.");
  }

  // The tool framework already validates `call.input` against
  // `imageExtractionSchema` before this point (an invalid call would have
  // thrown its own error) — parsing again here is just how the return type
  // narrows from the tool's generic input type to `ImageExtraction`.
  return imageExtractionSchema.parse(call.input);
}

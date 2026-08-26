/**
 * Vision-only image extraction: Qwen inspects an attached image and returns
 * structured, tool-free study content. Kept separate from lib/ai/config.ts's
 * tool-enabled path — this module never imports lib/ai/tools.ts, so an
 * application tool call can't end up in this request.
 */

import { convertToModelMessages, generateText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { visionModel } from "./config";

// `title` is nullable rather than `.optional()` so the model always reports
// one or the other explicitly, with no missing-key special-casing downstream.
export const imageExtractionSchema = z.object({
  title: z.string().nullable(),
  summary: z.string(),
  extractedContent: z.string(),
  keyConcepts: z.array(z.string()),
});

export type ImageExtraction = z.infer<typeof imageExtractionSchema>;

// Deliberately vision-only — no tool-use instructions, nothing naming
// application tools.
const EXTRACTION_SYSTEM_PROMPT = `You are looking at an image attached to a study app. Extract its study-relevant content — nothing else.

- Transcribe relevant text accurately, including headings, definitions, terminology, and equations where possible.
- Identify the important concepts the image is teaching or illustrating.
- For diagrams, charts, or figures, describe what they show in plain language.
- Ignore purely decorative elements (backgrounds, borders, unrelated clutter).
- Never invent content that isn't actually in the image.
- If part of the image is unreadable or ambiguous, say so plainly instead of guessing.

Report what you found using the recordExtraction tool.`;

// A single internal tool, forced via `toolChoice` below, that exists only
// to capture the model's structured output — not an application capability,
// never touches the database or renders anything.
//
// `generateObject()` (structured output via `response_format`) is broken
// for this model with image input: Groq returns "invalid image data" the
// instant `response_format` is added, in either json mode. Forcing a tool
// call sidesteps that, since image input plus tool-calling is the
// combination this model does support.
const recordExtractionTool = tool({
  description: "Record the study content extracted from the image.",
  inputSchema: imageExtractionSchema,
  execute: async (input) => input,
});

interface ExtractImageContentInput {
  image: { mediaType: string; filename?: string; url: string };
  // Context only, to help extraction focus — never an instruction to act on.
  userText?: string;
}

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

  // Already validated by the tool framework; parsing again just narrows the type.
  return imageExtractionSchema.parse(call.input);
}

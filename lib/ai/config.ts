/**
 * Single source of truth for Lumora's AI chat configuration.
 *
 * The API route (`app/api/chat/route.ts`) imports the model, system prompt,
 * and generation settings from here rather than defining them inline, so
 * every place that talks to Claude stays in sync when this changes.
 */

import { anthropic } from "@ai-sdk/anthropic";

/**
 * The Claude model Lumora's chat feature uses.
 *
 * `claude-sonnet-5` is Anthropic's current balanced model: strong reasoning
 * and writing quality with lower cost/latency than the Opus tier, which
 * suits a conversational study assistant better than a heavier model.
 *
 * The `anthropic()` provider reads the API key from the `ANTHROPIC_API_KEY`
 * environment variable automatically — the key is never read, stored, or
 * hardcoded in this file, and this module must only ever be imported by
 * server-side code (route handlers, server components).
 */
export const CHAT_MODEL_ID = "claude-sonnet-5";

export const chatModel = anthropic(CHAT_MODEL_ID);

/**
 * System prompt establishing Lumora's assistant persona.
 *
 * Deliberately scoped narrow for this skeleton: a general study/learning
 * assistant, not the full "notes into knowledge" feature set from the
 * wider Lumora product vision. Later assignments (note ingestion,
 * summarization, generation from user content) should extend this prompt
 * rather than duplicate a separate one elsewhere.
 */
export const SYSTEM_PROMPT = `You are Lumora, a friendly and knowledgeable study assistant.

Help the user understand topics, answer questions clearly, and support
their learning. Explain concepts step by step when it helps, use plain
language over jargon, and keep responses focused rather than exhaustive.
If you are unsure about something, say so instead of guessing.`;

/**
 * Generation settings passed to `streamText`.
 *
 * Kept conservative for a learning assistant: a moderate temperature for
 * clear, consistent explanations rather than highly creative output, and a
 * bounded output length so a single response can't run away indefinitely.
 */
export const GENERATION_CONFIG = {
  temperature: 0.5,
  maxOutputTokens: 2048,
} as const;

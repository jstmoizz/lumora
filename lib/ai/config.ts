/**
 * Single source of truth for Lumora's AI chat configuration.
 *
 * The API route (`app/api/chat/route.ts`) imports the model, system prompt,
 * and generation settings from here rather than defining them inline, so
 * every place that talks to the model stays in sync when this changes.
 */

import { groq } from "@ai-sdk/groq";

/**
 * The Groq model Lumora's chat feature uses.
 *
 * `llama-3.3-70b-versatile` was deprecated by Groq for free/developer-tier
 * usage (see console.groq.com/docs/deprecations), which broke this route
 * with a 404 `model_not_found` error. `openai/gpt-oss-120b` is Groq's
 * recommended replacement. It's a reasoning model, so responses may
 * include a separate reasoning stream alongside the chat text; the AI SDK
 * surfaces that as its own message part, and the existing streaming setup
 * here doesn't need any changes to keep working.
 *
 * The `groq()` provider reads the API key from the `GROQ_API_KEY`
 * environment variable automatically — the key is never read, stored, or
 * hardcoded in this file, and this module must only ever be imported by
 * server-side code (route handlers, server components).
 */
export const CHAT_MODEL_ID = "openai/gpt-oss-120b";

export const chatModel = groq(CHAT_MODEL_ID);

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

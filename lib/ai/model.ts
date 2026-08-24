/**
 * The Groq model identifier Lumora's chat feature uses.
 *
 * Kept in its own module rather than inline in `lib/ai/config.ts` so it has
 * no server-only dependencies — no provider client, no env vars — and can
 * be safely imported from client components (e.g. the Settings page) that
 * need to display the configured model without pulling in `@ai-sdk/groq`
 * or anything that reads `GROQ_API_KEY`.
 *
 * Single source of truth for the model identifier — every place that needs
 * it (the chat route, via `lib/ai/config.ts`, and the Settings page's
 * display) imports it from here rather than repeating the literal string.
 */
export const CHAT_MODEL_ID = "qwen/qwen3.6-27b";

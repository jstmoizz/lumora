/**
 * The Groq model identifier Lumora's chat feature uses.
 *
 * Kept in its own module rather than inline in `lib/ai/config.ts` so it has
 * no server-only dependencies — no provider client, no env vars — and can
 * be safely imported from client components (e.g. the Settings page) that
 * need to display the configured model without pulling in `@ai-sdk/groq`
 * or anything that reads `GROQ_API_KEY`.
 *
 * `llama-3.3-70b-versatile` was deprecated by Groq for free/developer-tier
 * usage (see console.groq.com/docs/deprecations), which broke the chat
 * route with a 404 `model_not_found` error. `openai/gpt-oss-120b` is
 * Groq's recommended replacement.
 *
 * This is the single source of truth for the model identifier — every
 * place that needs it (the chat route, via `lib/ai/config.ts`, and the
 * Settings page's display) imports it from here rather than repeating the
 * literal string, so nothing can drift out of sync with what's actually
 * configured again.
 */
export const CHAT_MODEL_ID = "openai/gpt-oss-120b";

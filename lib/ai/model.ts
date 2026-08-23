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
 * route with a 404 `model_not_found` error. `openai/gpt-oss-120b` was
 * Groq's recommended text-only replacement at the time.
 *
 * Switched again to `qwen/qwen3.6-27b` — as of this change, the only
 * vision-capable model Groq hosts (console.groq.com/docs/vision). This
 * step only swaps the identifier and re-verifies the existing tool-calling
 * flows (createQuiz/createFlashcards in lib/ai/tools.ts) still work on the
 * new model; it does not add image/file input anywhere yet — no upload UI
 * or FileUIPart handling has been built. That's the deliberate next step,
 * kept separate so a tool-calling regression and an upload-UI bug can't be
 * confused for each other.
 *
 * This is the single source of truth for the model identifier — every
 * place that needs it (the chat route, via `lib/ai/config.ts`, and the
 * Settings page's display) imports it from here rather than repeating the
 * literal string, so nothing can drift out of sync with what's actually
 * configured again.
 */
export const CHAT_MODEL_ID = "qwen/qwen3.6-27b";

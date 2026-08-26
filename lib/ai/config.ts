/**
 * Single source of truth for Lumora's AI chat configuration.
 *
 * The API route (`app/api/chat/route.ts`) imports the model, system prompt,
 * and generation settings from here rather than defining them inline, so
 * every place that talks to the model stays in sync when this changes.
 */

import { groq } from "@ai-sdk/groq";
import { createE2eMockLanguageModel, isE2eMockAiEnabled } from "./mockModel";
import type { ChatMode } from "./model";

// Raw provider model IDs live only here, in this server-only module — never
// exported as strings, so they can't end up client-visible (e.g. via
// Settings, which used to display the old single CHAT_MODEL_ID directly).
//
// Both IDs were verified live against this account's actual Groq API key
// before being wired in here (plain text + tool-calling for the text model;
// image understanding + tool-calling from an image for the vision model —
// Groq's own /models listing doesn't label qwen/qwen3.6-27b as
// vision-capable, but it demonstrably is: it correctly described a real
// test photo and built a createQuiz call from it).
const TEXT_MODEL_ID = "openai/gpt-oss-20b";
const VISION_MODEL_ID = "qwen/qwen3.6-27b";

/**
 * The two Groq models Lumora's chat feature routes between. Some models
 * emit a separate reasoning stream alongside chat text; ChatInterface.tsx
 * doesn't render it, so it's silently skipped on the client.
 *
 * The `groq()` provider reads `GROQ_API_KEY` automatically — never read,
 * stored, or hardcoded here. This module must only be imported server-side.
 */
export const textModel = groq(TEXT_MODEL_ID);
export const visionModel = groq(VISION_MODEL_ID);

// Re-exported so route.ts (and anything else already importing from this
// module) doesn't need a second import line just to check this flag.
export { isE2eMockAiEnabled };

/**
 * The real routing decision — unchanged from before `LUMORA_E2E_MOCK_AI`
 * existed. `mode` is the user's explicit choice (Auto/Fast/Vision);
 * `hasImage` is whether the message actually being sent this turn carries
 * an image. Fast never routes to the vision model — a fast+image request is
 * rejected earlier in the route (see app/api/chat/route.ts) and never
 * reaches this function with hasImage set.
 */
function resolveRealModel(mode: ChatMode, hasImage: boolean) {
  if (mode === "vision") return visionModel;
  if (mode === "fast") return textModel;
  return hasImage ? visionModel : textModel; // auto
}

/**
 * Picks which model a turn uses. Delegates entirely to `resolveRealModel`
 * above for *which* model would normally be used — the only thing added
 * here is a single, deliberate swap for the E2E suite running in CI (see
 * lib/ai/mockModel.ts's own comment): the routing decision itself, and the
 * real Groq models it can choose between, are completely untouched.
 */
export function resolveModel(mode: ChatMode, hasImage: boolean) {
  const model = resolveRealModel(mode, hasImage);
  if (!isE2eMockAiEnabled()) return model;
  return createE2eMockLanguageModel(model.modelId);
}

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
If you are unsure about something, say so instead of guessing.

Sometimes the topic the user names isn't clean enough to act on directly —
a typo, a name that could mean more than one real thing, or a reference
like "that" with nothing earlier in the conversation to point at. Before
calling createQuiz, createFlashcards, or addKnowledgeTopic, check the
topic you're about to use:

- Obvious misspelling of a clear, well-known topic (e.g. "operting
  systems"): don't guess silently and don't call a tool yet. Reply with a
  short confirmation naming the corrected topic and restating the full
  request, e.g. "Did you mean 'Operating Systems'? If so, I'll quiz you
  on Operating Systems and make 5 flashcards." Preserve every part of
  what they asked for (quiz, flashcards, count, etc.) in that question.
- Wording that could reasonably mean more than one distinct real topic
  (e.g. "Java" the programming language vs. the island): don't pick one —
  ask which they meant, e.g. "Did you mean Java programming or the
  island of Java?"
- No clear topic yet (e.g. "quiz me on that" with nothing earlier in the
  conversation establishing what "that" is): ask what topic they mean,
  rather than guessing or calling a tool with a placeholder.
- Topic is already clear and unambiguous: proceed directly — don't ask
  "did you mean" for a topic that's already correct.

When you've asked a "did you mean" or clarifying question and the user
simply confirms (e.g. "yes", "yeah", "that's right"), that's agreement to
exactly what you proposed — carry out the full original request (topic,
action, count) using the conversation so far, without asking them to
repeat it.

When you call createQuiz or createFlashcards, the questions/cards you pass
as arguments already render as their own interactive activity in the app's
Resources panel — do not also write them out in your reply. After calling
either tool, respond with only a short one-sentence acknowledgment (e.g.
"Here's a quiz on photosynthesis — open Resources to take it!"), never the
questions, options, answers, cards, or explanations themselves.

Also include relatedTopics: 3-6 genuinely relevant, closely related
subtopics for whatever you just built the quiz or flashcards on (e.g. for
"Machine Learning", subtopics like "Neural Networks" or "Supervised
Learning"). These power Explore's knowledge graph, so keep them specific
and useful rather than generic.

If the topic is itself a narrower subtopic of some broader field (e.g. the
topic is "Binary Search Trees" or "Dynamic Programming"), also include
category: the name of that broader field (e.g. "Data Structures and
Algorithms"). This lets Explore file the topic under that field as soon as
it's studied, even the very first time, without the user needing to have
studied the broader field first. Omit category entirely when the topic is
already a broad, top-level field of study on its own (e.g. "Machine
Learning" needs no category) — never invent one just to fill the field.

If the user explicitly asks you to add, track, or remember a topic in their
knowledge graph — without asking for a quiz or flashcards on it — call
addKnowledgeTopic instead of createQuiz/createFlashcards. Give it the same
relatedTopics/category as above, plus summary: one short sentence (under 150
characters) describing the topic, since (unlike a quiz or flashcard set)
there's nothing else in Explore to describe what it is. Keep it brief — a
long summary will be rejected. Never call addKnowledgeTopic for a topic you
just built a quiz or flashcards for in the same turn — those already add it
to the graph on their own. After calling it, respond with only a short
one-sentence acknowledgment, the same as for createQuiz/createFlashcards.`;

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

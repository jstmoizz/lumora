/**
 * Single source of truth for Lumora's AI chat configuration.
 *
 * The API route (`app/api/chat/route.ts`) imports the model, system prompt,
 * and generation settings from here rather than defining them inline, so
 * every place that talks to the model stays in sync when this changes.
 */

import { groq } from "@ai-sdk/groq";
import { CHAT_MODEL_ID } from "./model";

export { CHAT_MODEL_ID };

/**
 * The Groq model Lumora's chat feature uses, instantiated from
 * `CHAT_MODEL_ID` (see `lib/ai/model.ts` for the identifier itself and why
 * it lives in its own module). Some models on this route emit a separate
 * reasoning stream alongside the chat text; the AI SDK surfaces that as its
 * own message part, ChatInterface.tsx doesn't render it (only `text` and
 * the tool parts are handled there), and the existing streaming setup here
 * doesn't need any changes either way — a model that emits one just has
 * that part silently skipped on the client.
 *
 * The `groq()` provider reads the API key from the `GROQ_API_KEY`
 * environment variable automatically — the key is never read, stored, or
 * hardcoded in this file, and this module must only ever be imported by
 * server-side code (route handlers, server components).
 */
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
If you are unsure about something, say so instead of guessing.

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

/**
 * Server-side tools available to Lumora's chat model.
 *
 * Tools defined here are registered with `streamText` in
 * `app/api/chat/route.ts` and run entirely server-side — only their
 * validated, JSON-serializable output ever reaches the client. Unlike
 * `lib/ai/config.ts` (which reads the Groq API key and must only be
 * imported by server code), this module touches no secrets and no
 * environment variables, so its types are safe to import from client
 * components to type `useChat`.
 */

import { randomUUID } from "node:crypto";
import {
  tool,
  type InferUITools,
  type UIMessage,
} from "ai";
import { z } from "zod";
import type { ImageExtraction } from "./extraction";

// Groq's tool-calling sometimes emits "" for an omitted optional field
// instead of leaving the key out (reproduced in production: createQuiz
// rejected with `/category: length must be >= 1, but got 0` even though
// SYSTEM_PROMPT tells the model to omit category entirely when there isn't
// one). A plain `.min(1)` on an `.optional()` field only guards against a
// missing key, not this "present but blank" case, so it fails validation
// before execute() ever runs and can apply its own trim-then-omit handling.
// This treats a blank value the same as "not provided" instead of
// rejecting the whole tool call, while still enforcing the same non-blank/
// length bounds on any real value.
function optionalNonBlankString(max: number) {
  return z
    .string()
    .max(max)
    .transform((value) => {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    })
    .optional();
}

const quizQuestionInputSchema = z.object({
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(120)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});

export const createQuizInputSchema = z.object({
  topic: z.string().min(1).max(80),
  questions: z.array(quizQuestionInputSchema).min(1).max(5),
  // Feeds Explore's knowledge graph (lib/supabase/knowledge-graph.ts) as
  // suggested "unlocked" topics once this one has been studied — optional
  // since not every quiz needs to name related subtopics, but the model is
  // asked to include 3-6 whenever the subject genuinely has some (see
  // SYSTEM_PROMPT).
  relatedTopics: z.array(z.string().min(1).max(60)).min(3).max(6).optional(),
  // The broader field `topic` belongs under (e.g. topic "Binary Search
  // Trees" -> category "Data Structures and Algorithms"), so Explore can
  // nest it under that category even the very first time it's studied,
  // without needing the category to already exist as its own node. Omitted
  // when `topic` is itself already a broad top-level subject.
  category: optionalNonBlankString(80),
});

export type CreateQuizInput = z.infer<typeof createQuizInputSchema>;

export interface CreateQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface CreateQuizOutput {
  quizId: string;
  topic: string;
  questions: CreateQuizQuestion[];
  relatedTopics?: string[];
  category?: string;
}

/**
 * Generates a short multiple-choice quiz. The model supplies the actual
 * question content as tool-call arguments (validated against the Zod
 * schema below); `execute` itself does no further model calls — it only
 * trims/normalizes that input, assigns stable per-question ids, and runs a
 * few deterministic sanity checks a real quiz feature needs regardless of
 * where the questions came from (no duplicate answer choices, a correct
 * answer that actually points at one of them). Any of those checks failing
 * throws a plain `Error`, which the AI SDK catches and surfaces to the
 * client as the tool's `output-error` state.
 */
export const createQuizTool = tool({
  description:
    "Create a short multiple-choice quiz to test the student's understanding of a topic they're studying. Call this whenever the user asks to be quizzed, tested, or wants practice questions. Write 1-5 clear questions, each with exactly four distinct answer options and exactly one correct answer.",
  inputSchema: createQuizInputSchema,
  execute: async ({ topic, questions, relatedTopics, category }): Promise<CreateQuizOutput> => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) {
      throw new Error("The quiz topic was empty after trimming whitespace.");
    }

    const quizId = randomUUID();

    const normalizedQuestions = questions.map((rawQuestion, index) => {
      const questionNumber = index + 1;
      const questionText = rawQuestion.question.trim();
      if (!questionText) {
        throw new Error(
          `Question ${questionNumber} was empty after trimming whitespace.`,
        );
      }

      const options = rawQuestion.options.map((option) => option.trim());
      if (options.some((option) => option.length === 0)) {
        throw new Error(
          `Question ${questionNumber} ("${questionText}") has an empty answer option.`,
        );
      }

      const seenOptions = new Set<string>();
      for (const option of options) {
        const key = option.toLowerCase();
        if (seenOptions.has(key)) {
          throw new Error(
            `Question ${questionNumber} ("${questionText}") has duplicate answer options ("${option}"). Each answer choice must be unique.`,
          );
        }
        seenOptions.add(key);
      }

      if (
        rawQuestion.correctIndex < 0 ||
        rawQuestion.correctIndex >= options.length
      ) {
        throw new Error(
          `Question ${questionNumber} ("${questionText}") has an invalid correct-answer index.`,
        );
      }

      return {
        id: `${quizId}-${questionNumber}`,
        question: questionText,
        options,
        correctIndex: rawQuestion.correctIndex,
      };
    });

    const normalizedRelated = relatedTopics
      ?.map((related) => related.trim())
      .filter(Boolean);
    const normalizedCategory = category?.trim();

    return {
      quizId,
      topic: normalizedTopic,
      questions: normalizedQuestions,
      ...(normalizedRelated?.length ? { relatedTopics: normalizedRelated } : {}),
      ...(normalizedCategory ? { category: normalizedCategory } : {}),
    };
  },
});

const flashcardInputSchema = z.object({
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(300),
  explanation: z.string().max(400).optional(),
});

export const createFlashcardsInputSchema = z.object({
  topic: z.string().min(1).max(80),
  cards: z.array(flashcardInputSchema).min(1).max(10),
  // See createQuizInputSchema's relatedTopics/category for what these feed.
  relatedTopics: z.array(z.string().min(1).max(60)).min(3).max(6).optional(),
  category: optionalNonBlankString(80),
});

export type CreateFlashcardsInput = z.infer<typeof createFlashcardsInputSchema>;

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  explanation?: string;
}

export interface CreateFlashcardsOutput {
  flashcardSetId: string;
  topic: string;
  cards: Flashcard[];
  relatedTopics?: string[];
  category?: string;
}

/**
 * Generates a flashcard set. Mirrors createQuizTool exactly — same
 * validate-the-model's-own-arguments shape, same normalize/id-assign-only
 * `execute` (no further model calls), same per-item stable-id scheme keyed
 * off a freshly minted set id — so Practice's two activity types share one
 * mental model end to end, not just similar-looking UI.
 */
export const createFlashcardsTool = tool({
  description:
    "Create a set of flashcards to help the student review and memorize a topic they're studying. Call this whenever the user asks for flashcards, or to review/memorize/study a topic that way. Write 1-10 cards, each with a short front (the question or term) and a back (the answer or definition); an optional brief explanation can add context the back alone doesn't cover.",
  inputSchema: createFlashcardsInputSchema,
  execute: async ({ topic, cards, relatedTopics, category }): Promise<CreateFlashcardsOutput> => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) {
      throw new Error(
        "The flashcard topic was empty after trimming whitespace.",
      );
    }

    const flashcardSetId = randomUUID();

    const normalizedCards = cards.map((rawCard, index) => {
      const cardNumber = index + 1;
      const front = rawCard.front.trim();
      if (!front) {
        throw new Error(`Card ${cardNumber} had an empty front after trimming whitespace.`);
      }
      const back = rawCard.back.trim();
      if (!back) {
        throw new Error(`Card ${cardNumber} ("${front}") had an empty back after trimming whitespace.`);
      }
      const explanation = rawCard.explanation?.trim();

      return {
        id: `${flashcardSetId}-${cardNumber}`,
        front,
        back,
        ...(explanation ? { explanation } : {}),
      };
    });

    const normalizedRelated = relatedTopics
      ?.map((related) => related.trim())
      .filter(Boolean);
    const normalizedCategory = category?.trim();

    return {
      flashcardSetId,
      topic: normalizedTopic,
      cards: normalizedCards,
      ...(normalizedRelated?.length ? { relatedTopics: normalizedRelated } : {}),
      ...(normalizedCategory ? { category: normalizedCategory } : {}),
    };
  },
});

export const addKnowledgeTopicInputSchema = z.object({
  topic: z.string().min(1).max(80),
  // See createQuizInputSchema's relatedTopics/category for what these feed —
  // same fields, same meaning, just supplied without a quiz/flashcard set
  // attached.
  relatedTopics: z.array(z.string().min(1).max(60)).min(3).max(6).optional(),
  category: optionalNonBlankString(80),
  // Explore's TopicPanel shows this when present. createQuiz/createFlashcards
  // never supply one — their own content is the "detail" — but a topic
  // added this way has nothing else to show. Capped well above what
  // SYSTEM_PROMPT asks for (~200 chars): Groq validates tool-call arguments
  // against this schema *before* execute() runs, so a tighter cap the model
  // can overshoot (240 was too tight — summaries regularly landed at
  // 250-260) fails the whole request with an opaque error, not execute()'s
  // own `output-error` state.
  summary: z.string().min(1).max(400).optional(),
});

export type AddKnowledgeTopicInput = z.infer<typeof addKnowledgeTopicInputSchema>;

export interface AddKnowledgeTopicOutput {
  topic: string;
  relatedTopics?: string[];
  category?: string;
  summary?: string;
}

/**
 * Adds a topic to the user's Explore knowledge graph directly, with no quiz
 * or flashcard set attached — for when the user explicitly asks to
 * track/add/remember a topic there rather than study it right now.
 * createQuiz/createFlashcards already add their topic to the graph as a
 * side effect (see app/api/chat/route.ts's onEnd); this tool exists for the
 * case those don't cover; SYSTEM_PROMPT tells the model not to call both for
 * the same topic in the same turn.
 */
export const addKnowledgeTopicTool = tool({
  description:
    "Add a topic to the user's Explore knowledge graph when they explicitly ask to track, add, or remember it there — e.g. \"add World War II to my knowledge graph\", \"track that I'm learning Rust\", \"add this to Explore\". Do not call this for every topic mentioned in conversation, and do not call it in the same turn as createQuiz/createFlashcards for the same topic — those already add it as a side effect of studying it.",
  inputSchema: addKnowledgeTopicInputSchema,
  execute: async ({ topic, relatedTopics, category, summary }): Promise<AddKnowledgeTopicOutput> => {
    const normalizedTopic = topic.trim();
    if (!normalizedTopic) {
      throw new Error("The topic was empty after trimming whitespace.");
    }

    const normalizedRelated = relatedTopics
      ?.map((related) => related.trim())
      .filter(Boolean);
    const normalizedCategory = category?.trim();
    const normalizedSummary = summary?.trim();

    return {
      topic: normalizedTopic,
      ...(normalizedRelated?.length ? { relatedTopics: normalizedRelated } : {}),
      ...(normalizedCategory ? { category: normalizedCategory } : {}),
      ...(normalizedSummary ? { summary: normalizedSummary } : {}),
    };
  },
});

/**
 * The set of tools registered with the chat model, keyed by tool name.
 * `streamText`'s `tools` option in `app/api/chat/route.ts` is passed this
 * object directly, so the tool set used for typing and the one actually
 * registered can never drift apart.
 */
export const lumoraTools = {
  createQuiz: createQuizTool,
  createFlashcards: createFlashcardsTool,
  addKnowledgeTopic: addKnowledgeTopicTool,
};

/**
 * Per-message metadata `app/api/chat/route.ts` attaches to the assistant's
 * response so the client can learn which conversation it's part of.
 * `conversationId` is set once, on the stream's `start` event, for a
 * message that was just created (a brand-new conversation) — see the
 * route's `messageMetadata` callback. It's never present on a user message,
 * only ever on the assistant message the server generates.
 */
export interface LumoraMessageMetadata {
  conversationId?: string;
}

/**
 * Custom "data-*" UI part types the server can stream to the client outside
 * the tool-call/text vocabulary above. Currently just one: the vision
 * extraction path (lib/ai/extraction.ts, wired up in app/api/chat/route.ts)
 * sends a `data-extraction` part carrying the full `ImageExtraction` so
 * ChatInterface.tsx's ExtractionCard can render it directly from structured
 * data instead of parsing it back out of freeform text.
 */
export type LumoraUIDataTypes = {
  extraction: ImageExtraction;
};

/**
 * The chat message type shared by client and server, parameterized with
 * Lumora's registered tools (via `InferUITools`, which converts each raw
 * `Tool` into the `{ input, output }` shape `UIMessage` expects) so
 * `message.parts` narrows correctly — e.g. a `tool-createQuiz` part's
 * `output` is typed as `CreateQuizOutput`, not `unknown` — without manual
 * casts at the render boundary. `LumoraUIDataTypes` above does the same for
 * `data-*` parts.
 */
export type LumoraUIMessage = UIMessage<
  LumoraMessageMetadata,
  LumoraUIDataTypes,
  InferUITools<typeof lumoraTools>
>;

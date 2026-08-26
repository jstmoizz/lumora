/**
 * Server-side tools available to Lumora's chat model, registered with
 * `streamText` in app/api/chat/route.ts. Only validated, JSON-serializable
 * output ever reaches the client. Unlike lib/ai/config.ts, this module
 * touches no secrets, so its types are safe to import client-side for `useChat`.
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
// instead of leaving the key out, which a plain `.min(1).optional()` would
// reject outright. Treats a blank value the same as "not provided."
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
  // Suggested "unlocked" topics for Explore's knowledge graph once this one
  // is studied.
  relatedTopics: z.array(z.string().min(1).max(60)).min(3).max(6).optional(),
  // The broader field `topic` belongs under, so Explore can nest it there
  // even the first time it's studied. Omitted when `topic` is itself broad.
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

// `execute` makes no further model calls — it trims/normalizes the model's
// own arguments, assigns stable per-question ids, and runs sanity checks
// (no duplicate options, a correct answer that exists). A failed check
// throws, surfaced to the client as the tool's `output-error` state.
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

// Mirrors createQuizTool: same validate-then-normalize shape, same
// per-item stable-id scheme.
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
  relatedTopics: z.array(z.string().min(1).max(60)).min(3).max(6).optional(),
  category: optionalNonBlankString(80),
  // Explore's TopicPanel shows this when present, since a topic added this
  // way has nothing else to display. Capped at 400 (well above the ~200
  // asked for) since Groq validates before execute() runs, and tighter
  // caps got overshot, failing the whole request with an opaque error.
  summary: z.string().min(1).max(400).optional(),
});

export type AddKnowledgeTopicInput = z.infer<typeof addKnowledgeTopicInputSchema>;

export interface AddKnowledgeTopicOutput {
  topic: string;
  relatedTopics?: string[];
  category?: string;
  summary?: string;
}

// For when the user asks to track/add/remember a topic without studying it
// right now — createQuiz/createFlashcards already add their topic to the
// graph as a side effect.
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

// Passed directly to streamText's `tools` option, so the typed set and the
// registered set can never drift apart.
export const lumoraTools = {
  createQuiz: createQuizTool,
  createFlashcards: createFlashcardsTool,
  addKnowledgeTopic: addKnowledgeTopicTool,
};

// Set once, on a brand-new conversation's first assistant message, so the
// client learns which conversation it belongs to. Never present on a user message.
export interface LumoraMessageMetadata {
  conversationId?: string;
}

// Custom "data-*" part types beyond tool-call/text. Currently one: vision
// extraction sends a `data-extraction` part so ExtractionCard can render
// structured data directly instead of parsing it back out of text.
export type LumoraUIDataTypes = {
  extraction: ImageExtraction;
};

// The chat message type shared by client and server. InferUITools narrows
// `message.parts` so e.g. a `tool-createQuiz` part's output is typed as
// CreateQuizOutput, not unknown.
export type LumoraUIMessage = UIMessage<
  LumoraMessageMetadata,
  LumoraUIDataTypes,
  InferUITools<typeof lumoraTools>
>;

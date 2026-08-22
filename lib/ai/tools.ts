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
  type UIDataTypes,
  type UIMessage,
} from "ai";
import { z } from "zod";

const quizQuestionInputSchema = z.object({
  question: z.string().min(1).max(300),
  options: z.array(z.string().min(1).max(120)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});

const createQuizInputSchema = z.object({
  topic: z.string().min(1).max(80),
  questions: z.array(quizQuestionInputSchema).min(1).max(5),
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
  execute: async ({ topic, questions }): Promise<CreateQuizOutput> => {
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

    return {
      quizId,
      topic: normalizedTopic,
      questions: normalizedQuestions,
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
 * The chat message type shared by client and server, parameterized with
 * Lumora's registered tools (via `InferUITools`, which converts each raw
 * `Tool` into the `{ input, output }` shape `UIMessage` expects) so
 * `message.parts` narrows correctly — e.g. a `tool-createQuiz` part's
 * `output` is typed as `CreateQuizOutput`, not `unknown` — without manual
 * casts at the render boundary.
 */
export type LumoraUIMessage = UIMessage<
  LumoraMessageMetadata,
  UIDataTypes,
  InferUITools<typeof lumoraTools>
>;

/**
 * Live-model behavioral checks for the "did you mean?" topic recovery
 * guidance in SYSTEM_PROMPT (typo correction, ambiguous-topic
 * clarification, missing-topic clarification, and confirmation follow-
 * through). Unlike the rest of the suite, these call the real Groq model —
 * they're inherently non-deterministic and depend on model judgment, not
 * code, so they're opt-in rather than part of the default `vitest run`
 * (no network calls, no Groq quota usage, no flakiness in normal CI/local
 * runs). Run explicitly with:
 *
 *   RUN_LIVE_AI_TESTS=1 npx vitest run lib/ai/__tests__/topicRecovery.live.test.ts
 *
 * A failure here means the model didn't follow the prompt's guidance for
 * that specific phrasing this run, not necessarily that the guidance is
 * broken — rerun before treating it as a regression.
 */
import { describe, test, expect } from "vitest";
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { chatModel, GENERATION_CONFIG, SYSTEM_PROMPT } from "../config";
import { lumoraTools } from "../tools";

const RUN_LIVE = process.env.RUN_LIVE_AI_TESTS === "1";

async function ask(messages: ModelMessage[]) {
  return generateText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages,
    tools: lumoraTools,
    stopWhen: stepCountIs(2),
    ...GENERATION_CONFIG,
  });
}

function toolCallNames(result: Awaited<ReturnType<typeof ask>>) {
  return result.toolCalls.map((call) => call.toolName);
}

describe.skipIf(!RUN_LIVE)("topic recovery (live model)", () => {
  test(
    "clear topic: 'Quiz me on Operating Systems' calls createQuiz directly, no unnecessary confirmation",
    async () => {
      const result = await ask([
        { role: "user", content: "Quiz me on Operating Systems" },
      ]);
      expect(toolCallNames(result)).toContain("createQuiz");
    },
    90000,
  );

  test(
    "combined intents: 'Quiz me on Operating Systems and make 5 flashcards' preserves both",
    async () => {
      const result = await ask([
        {
          role: "user",
          content: "Quiz me on Operating Systems and make 5 flashcards",
        },
      ]);
      const names = toolCallNames(result);
      expect(names).toContain("createQuiz");
      expect(names).toContain("createFlashcards");
    },
    90000,
  );

  test(
    "typo: 'Quiz me on operting systems' asks for confirmation instead of guessing",
    async () => {
      const result = await ask([
        { role: "user", content: "Quiz me on operting systems" },
      ]);
      expect(toolCallNames(result)).toHaveLength(0);
      expect(result.text.toLowerCase()).toContain("operating systems");
    },
    90000,
  );

  test(
    "ambiguous topic: 'Quiz me on Java' asks which meaning instead of picking one",
    async () => {
      const result = await ask([{ role: "user", content: "Quiz me on Java" }]);
      expect(toolCallNames(result)).toHaveLength(0);
    },
    90000,
  );

  test(
    "missing topic: 'Quiz me on that' with no prior context asks for clarification",
    async () => {
      const result = await ask([{ role: "user", content: "Quiz me on that" }]);
      expect(toolCallNames(result)).toHaveLength(0);
    },
    90000,
  );

  test(
    "confirmation follow-through: a plain 'Yes.' after a typo confirmation proceeds with the corrected topic",
    async () => {
      const first = await ask([
        {
          role: "user",
          content: "Quiz me on operting systems and make 5 flashcards.",
        },
      ]);
      expect(toolCallNames(first)).toHaveLength(0);

      const second = await ask([
        {
          role: "user",
          content: "Quiz me on operting systems and make 5 flashcards.",
        },
        { role: "assistant", content: first.text },
        { role: "user", content: "Yes." },
      ]);

      const names = toolCallNames(second);
      expect(names).toContain("createQuiz");
      expect(names).toContain("createFlashcards");
      const quizCall = second.toolCalls.find((c) => c.toolName === "createQuiz");
      const topic = (quizCall?.input as { topic?: string } | undefined)?.topic ?? "";
      expect(topic.toLowerCase()).toContain("operating systems");
    },
    150000,
  );
});

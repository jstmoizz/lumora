import { describe, expect, test } from "vitest";
import {
  addAttemptToSummaries,
  parseQuizAttemptInput,
  summarizeQuizAttempts,
} from "../quizAttempts";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: "conv-1",
    quizId: "quiz-1",
    topic: "  Photosynthesis  ",
    mode: "full",
    correctCount: 2,
    totalCount: 3,
    missedQuestionIds: ["quiz-1-3"],
    ...overrides,
  };
}

describe("parseQuizAttemptInput", () => {
  test("accepts a well-formed attempt and trims the topic", () => {
    expect(parseQuizAttemptInput(validInput())).toEqual({
      conversationId: "conv-1",
      quizId: "quiz-1",
      topic: "Photosynthesis",
      mode: "full",
      correctCount: 2,
      totalCount: 3,
      missedQuestionIds: ["quiz-1-3"],
    });
  });

  test("treats a missing or null conversationId as no conversation", () => {
    expect(parseQuizAttemptInput(validInput({ conversationId: undefined }))?.conversationId).toBeUndefined();
    expect(parseQuizAttemptInput(validInput({ conversationId: null }))?.conversationId).toBeUndefined();
  });

  test.each([
    ["a non-object", "nope"],
    ["null", null],
    ["an unknown mode", validInput({ mode: "partial" })],
    ["an empty quizId", validInput({ quizId: "" })],
    ["a whitespace-only topic", validInput({ topic: "   " })],
    ["zero questions", validInput({ totalCount: 0, correctCount: 0, missedQuestionIds: [] })],
    ["more correct than total", validInput({ correctCount: 4 })],
    ["a negative score", validInput({ correctCount: -1 })],
    ["a fractional score", validInput({ correctCount: 1.5 })],
    ["a missed list that doesn't match the score", validInput({ missedQuestionIds: [] })],
    ["a non-string missed id", validInput({ missedQuestionIds: [3] })],
    ["an absurd question count", validInput({ totalCount: 500, correctCount: 500, missedQuestionIds: [] })],
  ])("rejects %s", (_label, input) => {
    expect(parseQuizAttemptInput(input)).toBeNull();
  });
});

describe("summarizeQuizAttempts", () => {
  test("counts every attempt but takes the best score from whole-quiz attempts only", () => {
    const summaries = summarizeQuizAttempts([
      { quiz_id: "quiz-1", mode: "full", correct_count: 1, total_count: 3 },
      { quiz_id: "quiz-1", mode: "missed", correct_count: 2, total_count: 2 },
      { quiz_id: "quiz-1", mode: "full", correct_count: 2, total_count: 3 },
      { quiz_id: "quiz-2", mode: "full", correct_count: 5, total_count: 5 },
    ]);

    expect(summaries).toEqual({
      "quiz-1": { attempts: 3, bestFull: { correct: 2, total: 3 } },
      "quiz-2": { attempts: 1, bestFull: { correct: 5, total: 5 } },
    });
  });

  test("has no best score when only missed-question retakes exist", () => {
    expect(
      summarizeQuizAttempts([{ quiz_id: "quiz-1", mode: "missed", correct_count: 1, total_count: 1 }]),
    ).toEqual({ "quiz-1": { attempts: 1, bestFull: null } });
  });

  test("returns an empty map for no rows", () => {
    expect(summarizeQuizAttempts([])).toEqual({});
  });
});

describe("addAttemptToSummaries", () => {
  test("keeps the existing best when a new attempt scores lower", () => {
    const before = { "quiz-1": { attempts: 1, bestFull: { correct: 3, total: 3 } } };
    const after = addAttemptToSummaries(before, {
      quizId: "quiz-1",
      mode: "full",
      correctCount: 1,
      totalCount: 3,
    });

    expect(after["quiz-1"]).toEqual({ attempts: 2, bestFull: { correct: 3, total: 3 } });
    // Returns a new map rather than mutating the one passed in.
    expect(before["quiz-1"].attempts).toBe(1);
  });
});

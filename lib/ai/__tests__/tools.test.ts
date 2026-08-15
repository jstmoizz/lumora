import { describe, test, expect } from "vitest";
import { createQuizTool, type CreateQuizOutput } from "../tools";

function execute(input: Parameters<NonNullable<typeof createQuizTool.execute>>[0]) {
  return createQuizTool.execute!(input, {
    toolCallId: "test-call",
    messages: [],
    context: {},
  }) as Promise<CreateQuizOutput>;
}

describe("createQuizTool.execute", () => {
  test("normalizes topic/question whitespace and assigns stable per-question ids", async () => {
    const result = await execute({
      topic: "  Photosynthesis  ",
      questions: [
        {
          question: "  What pigment captures light?  ",
          options: ["  Chlorophyll  ", "Melanin", "Keratin", "Hemoglobin"],
          correctIndex: 0,
        },
      ],
    });

    expect(result.topic).toBe("Photosynthesis");
    expect(result.questions[0].question).toBe("What pigment captures light?");
    expect(result.questions[0].options[0]).toBe("Chlorophyll");
    expect(result.questions[0].id).toBe(`${result.quizId}-1`);
  });

  test("rejects a topic that is empty after trimming", async () => {
    await expect(
      execute({
        topic: "   ",
        questions: [
          {
            question: "Q1",
            options: ["A", "B", "C", "D"],
            correctIndex: 0,
          },
        ],
      }),
    ).rejects.toThrow(/topic was empty/i);
  });

  test("rejects duplicate answer options, case-insensitively", async () => {
    await expect(
      execute({
        topic: "Chemistry",
        questions: [
          {
            question: "Pick the noble gas",
            options: ["Argon", "argon", "Oxygen", "Nitrogen"],
            correctIndex: 0,
          },
        ],
      }),
    ).rejects.toThrow(/duplicate answer options/i);
  });

  test("rejects a correctIndex that doesn't point at a real option", async () => {
    await expect(
      execute({
        topic: "Chemistry",
        questions: [
          {
            question: "Pick the noble gas",
            options: ["Argon", "Oxygen", "Nitrogen", "Carbon"],
            correctIndex: 4,
          },
        ],
      }),
    ).rejects.toThrow(/invalid correct-answer index/i);
  });

  test("rejects a question that is empty after trimming", async () => {
    await expect(
      execute({
        topic: "Chemistry",
        questions: [
          {
            question: "   ",
            options: ["A", "B", "C", "D"],
            correctIndex: 0,
          },
        ],
      }),
    ).rejects.toThrow(/Question 1 was empty/i);
  });
});

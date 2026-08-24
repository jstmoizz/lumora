import { describe, test, expect } from "vitest";
import {
  addKnowledgeTopicTool,
  createFlashcardsTool,
  createQuizTool,
  type AddKnowledgeTopicOutput,
  type CreateFlashcardsOutput,
  type CreateQuizOutput,
} from "../tools";

function execute(input: Parameters<NonNullable<typeof createQuizTool.execute>>[0]) {
  return createQuizTool.execute!(input, {
    toolCallId: "test-call",
    messages: [],
    context: {},
  }) as Promise<CreateQuizOutput>;
}

function executeFlashcards(
  input: Parameters<NonNullable<typeof createFlashcardsTool.execute>>[0],
) {
  return createFlashcardsTool.execute!(input, {
    toolCallId: "test-call",
    messages: [],
    context: {},
  }) as Promise<CreateFlashcardsOutput>;
}

function executeAddKnowledgeTopic(
  input: Parameters<NonNullable<typeof addKnowledgeTopicTool.execute>>[0],
) {
  return addKnowledgeTopicTool.execute!(input, {
    toolCallId: "test-call",
    messages: [],
    context: {},
  }) as Promise<AddKnowledgeTopicOutput>;
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

  test("passes through trimmed relatedTopics, feeding Explore's knowledge graph", async () => {
    const result = await execute({
      topic: "Machine Learning",
      questions: [{ question: "Q1", options: ["A", "B", "C", "D"], correctIndex: 0 }],
      relatedTopics: ["  Neural Networks  ", "Supervised Learning"],
    });

    expect(result.relatedTopics).toEqual(["Neural Networks", "Supervised Learning"]);
  });

  test("omits relatedTopics entirely when none were given", async () => {
    const result = await execute({
      topic: "Machine Learning",
      questions: [{ question: "Q1", options: ["A", "B", "C", "D"], correctIndex: 0 }],
    });

    expect(result.relatedTopics).toBeUndefined();
  });

  test("passes through a trimmed category, for nesting under a broader field", async () => {
    const result = await execute({
      topic: "Binary Search Trees",
      questions: [{ question: "Q1", options: ["A", "B", "C", "D"], correctIndex: 0 }],
      category: "  Data Structures and Algorithms  ",
    });

    expect(result.category).toBe("Data Structures and Algorithms");
  });

  test("omits category entirely when none was given", async () => {
    const result = await execute({
      topic: "Machine Learning",
      questions: [{ question: "Q1", options: ["A", "B", "C", "D"], correctIndex: 0 }],
    });

    expect(result.category).toBeUndefined();
  });
});

describe("createFlashcardsTool.execute", () => {
  test("normalizes topic/card whitespace, assigns stable ids, and drops an empty explanation", async () => {
    const result = await executeFlashcards({
      topic: "  Photosynthesis  ",
      cards: [
        {
          front: "  What pigment captures light?  ",
          back: "  Chlorophyll  ",
          explanation: "   ",
        },
      ],
    });

    expect(result.topic).toBe("Photosynthesis");
    expect(result.cards[0].front).toBe("What pigment captures light?");
    expect(result.cards[0].back).toBe("Chlorophyll");
    expect(result.cards[0].id).toBe(`${result.flashcardSetId}-1`);
    expect(result.cards[0].explanation).toBeUndefined();
  });

  test("keeps a real explanation, trimmed", async () => {
    const result = await executeFlashcards({
      topic: "Biology",
      cards: [
        {
          front: "What is mitosis?",
          back: "Cell division",
          explanation: "  Produces two identical daughter cells.  ",
        },
      ],
    });

    expect(result.cards[0].explanation).toBe(
      "Produces two identical daughter cells.",
    );
  });

  test("rejects a topic that is empty after trimming", async () => {
    await expect(
      executeFlashcards({
        topic: "   ",
        cards: [{ front: "Q1", back: "A1" }],
      }),
    ).rejects.toThrow(/topic was empty/i);
  });

  test("rejects a card with an empty front after trimming", async () => {
    await expect(
      executeFlashcards({
        topic: "Chemistry",
        cards: [{ front: "   ", back: "Argon" }],
      }),
    ).rejects.toThrow(/Card 1 had an empty front/i);
  });

  test("rejects a card with an empty back after trimming", async () => {
    await expect(
      executeFlashcards({
        topic: "Chemistry",
        cards: [{ front: "Noble gas?", back: "   " }],
      }),
    ).rejects.toThrow(/Card 1 \("Noble gas\?"\) had an empty back/i);
  });

  test("passes through trimmed relatedTopics, feeding Explore's knowledge graph", async () => {
    const result = await executeFlashcards({
      topic: "Machine Learning",
      cards: [{ front: "Q1", back: "A1" }],
      relatedTopics: ["  Neural Networks  ", "Supervised Learning"],
    });

    expect(result.relatedTopics).toEqual(["Neural Networks", "Supervised Learning"]);
  });

  test("omits relatedTopics entirely when none were given", async () => {
    const result = await executeFlashcards({
      topic: "Machine Learning",
      cards: [{ front: "Q1", back: "A1" }],
    });

    expect(result.relatedTopics).toBeUndefined();
  });

  test("passes through a trimmed category, for nesting under a broader field", async () => {
    const result = await executeFlashcards({
      topic: "Binary Search Trees",
      cards: [{ front: "Q1", back: "A1" }],
      category: "  Data Structures and Algorithms  ",
    });

    expect(result.category).toBe("Data Structures and Algorithms");
  });

  test("omits category entirely when none was given", async () => {
    const result = await executeFlashcards({
      topic: "Machine Learning",
      cards: [{ front: "Q1", back: "A1" }],
    });

    expect(result.category).toBeUndefined();
  });
});

describe("addKnowledgeTopicTool.execute", () => {
  test("normalizes topic whitespace", async () => {
    const result = await executeAddKnowledgeTopic({ topic: "  World War II  " });
    expect(result.topic).toBe("World War II");
  });

  test("rejects a topic that is empty after trimming", async () => {
    await expect(executeAddKnowledgeTopic({ topic: "   " })).rejects.toThrow(/topic was empty/i);
  });

  test("passes through trimmed relatedTopics, category, and summary", async () => {
    const result = await executeAddKnowledgeTopic({
      topic: "Rust",
      relatedTopics: ["  Ownership  ", "Borrow Checker", "Cargo"],
      category: "  Programming Languages  ",
      summary: "  A systems programming language focused on memory safety.  ",
    });

    expect(result.relatedTopics).toEqual(["Ownership", "Borrow Checker", "Cargo"]);
    expect(result.category).toBe("Programming Languages");
    expect(result.summary).toBe("A systems programming language focused on memory safety.");
  });

  test("omits relatedTopics, category, and summary entirely when none were given", async () => {
    const result = await executeAddKnowledgeTopic({ topic: "Rust" });

    expect(result.relatedTopics).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.summary).toBeUndefined();
  });
});

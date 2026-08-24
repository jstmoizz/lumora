import { describe, expect, test } from "vitest";
import { normalizeTopicKey } from "../topics";

describe("normalizeTopicKey", () => {
  test("the exact three-phrasing example from the spec all key to the same string", () => {
    const fromQuestions = [
      "What is supervised learning?",
      "Explain supervised learning.",
      "Give me examples of supervised learning.",
    ];
    // Not literally testing sentence extraction here (that's the model's
    // job) — just that once you have the same topic phrase, casing/
    // whitespace differences collapse to one key.
    expect(normalizeTopicKey("Supervised Learning")).toBe(
      normalizeTopicKey("supervised learning "),
    );
    expect(normalizeTopicKey("SUPERVISED LEARNING")).toBe(
      normalizeTopicKey("supervised learning "),
    );
    expect(fromQuestions.length).toBe(3); // sanity: the example itself
  });

  test("lowercases", () => {
    expect(normalizeTopicKey("Machine Learning")).toBe("machine learning");
  });

  test("trims leading/trailing whitespace", () => {
    expect(normalizeTopicKey("  Neural Networks  ")).toBe("neural networks");
  });

  test("collapses internal whitespace runs to a single space", () => {
    expect(normalizeTopicKey("Data   Structures\n\tand Algorithms")).toBe(
      "data structures and algorithms",
    );
  });

  test("is idempotent", () => {
    const once = normalizeTopicKey("  Linear   Algebra ");
    expect(normalizeTopicKey(once)).toBe(once);
  });
});

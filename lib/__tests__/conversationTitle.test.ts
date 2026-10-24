import { describe, expect, test } from "vitest";
import {
  CONVERSATION_TITLE_MAX_LENGTH,
  normalizeConversationTitle,
  validateConversationTitle,
} from "../conversationTitle";

describe("normalizeConversationTitle", () => {
  test("trims and collapses internal whitespace", () => {
    expect(normalizeConversationTitle("  Cell \n  biology\trevision ")).toBe(
      "Cell biology revision",
    );
  });
});

describe("validateConversationTitle", () => {
  test("accepts a normal title", () => {
    expect(validateConversationTitle("Osmosis notes")).toBeNull();
  });

  test("rejects an empty or whitespace-only title", () => {
    expect(validateConversationTitle("   ")).toBe("Enter a title.");
  });

  test("allows exactly the maximum length but not one character more", () => {
    expect(validateConversationTitle("a".repeat(CONVERSATION_TITLE_MAX_LENGTH))).toBeNull();
    expect(validateConversationTitle("a".repeat(CONVERSATION_TITLE_MAX_LENGTH + 1))).toMatch(
      /under 80 characters/,
    );
  });
});

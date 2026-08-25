import { describe, test, expect } from "vitest";
import { SYSTEM_PROMPT } from "../config";

// Guards the topic-recovery guidance in SYSTEM_PROMPT (typo confirmation,
// ambiguous-topic clarification, missing-topic clarification, confirming
// follow-through, and not over-asking for an already-clear topic) against
// accidental removal — the model's actual judgment can only be checked
// live (see topicRecovery.live.test.ts), but this at least ensures the
// instructions it depends on stay present.
describe("SYSTEM_PROMPT topic-recovery guidance", () => {
  test("instructs confirming an obvious typo before calling a tool", () => {
    expect(SYSTEM_PROMPT).toMatch(/misspelling/i);
    expect(SYSTEM_PROMPT).toMatch(/don't guess silently and don't call a tool yet/i);
  });

  test("instructs clarifying a genuinely ambiguous topic instead of picking one", () => {
    expect(SYSTEM_PROMPT).toMatch(/more than one distinct real topic/i);
    expect(SYSTEM_PROMPT).toMatch(/ask which they meant/i);
  });

  test("instructs asking when there is no clear topic yet", () => {
    expect(SYSTEM_PROMPT).toMatch(/no clear topic yet/i);
    expect(SYSTEM_PROMPT).toMatch(/rather than guessing or calling a tool with a\s*\n?\s*placeholder/i);
  });

  test("instructs proceeding directly, without asking, when the topic is already clear", () => {
    expect(SYSTEM_PROMPT).toMatch(/proceed directly/i);
    expect(SYSTEM_PROMPT).toMatch(/don't ask\s*\n?\s*"did you mean" for a topic that's already correct/i);
  });

  test("instructs treating a simple confirmation as agreement, carrying the full original request through", () => {
    expect(SYSTEM_PROMPT).toMatch(/simply confirms/i);
    expect(SYSTEM_PROMPT).toMatch(/without asking them to\s*\n?\s*repeat it/i);
  });
});

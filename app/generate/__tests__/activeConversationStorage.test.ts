import { describe, test, expect, beforeEach } from "vitest";
import {
  readActiveConversationId,
  writeActiveConversationId,
} from "../activeConversationStorage";

beforeEach(() => {
  sessionStorage.clear();
});

describe("activeConversationStorage", () => {
  test("returns null when nothing has been stored", () => {
    expect(readActiveConversationId()).toBeNull();
  });

  test("round-trips a written id", () => {
    writeActiveConversationId("conv-1");
    expect(readActiveConversationId()).toBe("conv-1");
  });

  test("writing null clears a previously stored id", () => {
    writeActiveConversationId("conv-1");
    writeActiveConversationId(null);
    expect(readActiveConversationId()).toBeNull();
  });

  test("uses sessionStorage, not localStorage — per-tab, not shared", () => {
    writeActiveConversationId("conv-1");
    expect(localStorage.getItem("lumora-active-conversation-id")).toBeNull();
    expect(sessionStorage.getItem("lumora-active-conversation-id")).toBe(
      "conv-1",
    );
  });
});

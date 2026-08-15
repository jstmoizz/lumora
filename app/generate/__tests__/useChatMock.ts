import { vi } from "vitest";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { LumoraUIMessage } from "@/lib/ai/tools";

export type MockUseChatReturn = UseChatHelpers<LumoraUIMessage>;

export function makeUseChatReturn(
  overrides: Partial<MockUseChatReturn> = {},
): MockUseChatReturn {
  return {
    id: "test-chat",
    messages: [],
    sendMessage: vi.fn(),
    regenerate: vi.fn(),
    resumeStream: vi.fn(),
    addToolResult: vi.fn(),
    addToolOutput: vi.fn(),
    addToolApprovalResponse: vi.fn(),
    setMessages: vi.fn(),
    clearError: vi.fn(),
    status: "ready",
    stop: vi.fn(),
    error: undefined,
    ...overrides,
  };
}

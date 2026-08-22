import { describe, test, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useChat } from "@ai-sdk/react";
import ChatInterface from "../ChatInterface";
import { makeUseChatReturn, type MockUseChatReturn } from "./useChatMock";
import { assistantMessageWithParts, assistantTextMessage, userMessage } from "./fixtures";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

// `useChat` is generic (`useChat<UI_MESSAGE>`); `vi.mocked` picks its
// untyped default instantiation, which doesn't structurally match
// `LumoraUIMessage`'s narrower `tool-createQuiz` part. This is the one spot
// that bridges back to the concrete type the component actually uses.
const mockUseChat = vi.mocked(useChat) as unknown as Mock<
  (options?: unknown) => MockUseChatReturn
>;

beforeEach(() => {
  mockUseChat.mockReset();
});

describe("composer send gating", () => {
  test("Send is disabled until non-whitespace text is entered", () => {
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface />);

    const textarea = screen.getByLabelText("Message");
    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "   " } });
    expect(sendButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: "Explain osmosis" } });
    expect(sendButton).toBeEnabled();
  });

  test("submitting calls sendMessage with the typed text and clears the input", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    const textarea = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Explain osmosis" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ text: "Explain osmosis" });
    expect(textarea.value).toBe("");
  });

  test("Enter submits, Shift+Enter does not", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    const textarea = screen.getByLabelText("Message");
    fireEvent.change(textarea, { target: { value: "Explain osmosis" } });

    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("resuming a conversation from History", () => {
  test("seeds useChat with the messages loaded for that conversation", () => {
    mockUseChat.mockReturnValue(makeUseChatReturn());
    const initialMessages = [userMessage("Explain osmosis", "msg-1")];

    render(
      <ChatInterface
        initialConversationId="conv-1"
        initialMessages={initialMessages}
      />,
    );

    expect(mockUseChat).toHaveBeenCalledWith(
      expect.objectContaining({ messages: initialMessages }),
    );
  });

  test("a new message sent in a resumed conversation carries its conversationId immediately, without waiting on message metadata", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));

    render(<ChatInterface initialConversationId="conv-1" />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Continue please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledWith(
      { text: "Continue please" },
      { body: { conversationId: "conv-1" } },
    );
  });
});

describe("empty-state example prompts", () => {
  test("clicking a suggestion sends it as-is", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    const group = screen.getByRole("group", { name: "Example prompts" });
    const [firstPrompt] = within(group).getAllByRole("button");
    const promptText = firstPrompt.textContent;

    fireEvent.click(firstPrompt);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({ text: promptText });
  });
});

describe("pending state", () => {
  test("shows Thinking… while awaiting the assistant's first chunk", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "submitted",
        messages: [userMessage("Quiz me on cell biology")],
      }),
    );
    render(<ChatInterface />);

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  test("Thinking… is gone once assistant content has streamed in", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "streaming",
        messages: [
          userMessage("Quiz me on cell biology"),
          assistantTextMessage("The mitochondria is", "assistant-1", "streaming"),
        ],
      }),
    );
    render(<ChatInterface />);

    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    expect(screen.getByText(/The mitochondria is/)).toBeInTheDocument();
  });
});

describe("streaming text rendering", () => {
  test("growing text replaces rather than duplicates prior content", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "streaming",
        messages: [
          userMessage("Explain recursion"),
          assistantTextMessage("Recursion is", "assistant-1", "streaming"),
        ],
      }),
    );
    const { rerender } = render(<ChatInterface />);
    expect(screen.getByText(/Recursion is/)).toBeInTheDocument();

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "streaming",
        messages: [
          userMessage("Explain recursion"),
          assistantTextMessage(
            "Recursion is when a function calls itself.",
            "assistant-1",
            "streaming",
          ),
        ],
      }),
    );
    rerender(<ChatInterface />);

    const matches = screen.getAllByText(/Recursion is/);
    expect(matches).toHaveLength(1);
    expect(
      screen.getByText("Recursion is when a function calls itself."),
    ).toBeInTheDocument();
  });
});

describe("error state", () => {
  test("network failure shows connection copy, not the raw error message", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "error",
        messages: [userMessage("Explain entropy")],
        error: new TypeError("Failed to fetch"),
      }),
    );
    render(<ChatInterface />);

    expect(screen.getByText("Couldn't reach Lumora")).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });

  test("non-network failure shows generic retry copy, not the raw error message", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "error",
        messages: [
          userMessage("Explain entropy"),
          assistantMessageWithParts([], "assistant-1"),
        ],
        error: new Error("rate limit exceeded"),
      }),
    );
    render(<ChatInterface />);

    expect(screen.getByText("Couldn't finish that response")).toBeInTheDocument();
    expect(screen.queryByText("rate limit exceeded")).not.toBeInTheDocument();
  });

  test("Retry calls regenerate exactly once even under a rapid double-click", () => {
    let resolveRegenerate!: () => void;
    const regenerate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRegenerate = resolve;
        }),
    );
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "error",
        messages: [userMessage("Explain entropy")],
        error: new Error("rate limit exceeded"),
        regenerate,
      }),
    );
    render(<ChatInterface />);

    const retryButton = screen.getByRole("button", { name: "Retry" });
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    expect(regenerate).toHaveBeenCalledTimes(1);
    resolveRegenerate();
  });
});

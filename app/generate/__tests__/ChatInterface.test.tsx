import { describe, test, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { useChat } from "@ai-sdk/react";
import ChatInterface from "../ChatInterface";
import { makeUseChatReturn, type MockUseChatReturn } from "./useChatMock";
import {
  assistantMessageWithParts,
  assistantTextMessage,
  outputAvailableFlashcardsPart,
  outputAvailableQuizPart,
  userMessage,
} from "./fixtures";

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

describe("onPromptSubmitted — GenerateWorkspace's Recent Prompts feed", () => {
  test("fires once per composer submission, with the sent text", () => {
    const onPromptSubmitted = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface onPromptSubmitted={onPromptSubmitted} />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain osmosis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onPromptSubmitted).toHaveBeenCalledTimes(1);
    expect(onPromptSubmitted).toHaveBeenCalledWith("Explain osmosis");
  });

  test("fires when an example prompt is clicked", () => {
    const onPromptSubmitted = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface onPromptSubmitted={onPromptSubmitted} />);

    const group = screen.getByRole("group", { name: "Example prompts" });
    const [firstPrompt] = within(group).getAllByRole("button");
    fireEvent.click(firstPrompt);

    expect(onPromptSubmitted).toHaveBeenCalledWith(firstPrompt.textContent);
  });

  test("is optional — omitting it doesn't break sending", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain osmosis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("pendingPrompt — selecting a Recent Prompt from outside the composer", () => {
  test("sends the pending prompt's text and reports it handled", () => {
    const sendMessage = vi.fn();
    const onPendingPromptHandled = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));

    render(
      <ChatInterface
        pendingPrompt={{ text: "Quiz me on cell biology", id: 1 }}
        onPendingPromptHandled={onPendingPromptHandled}
      />,
    );

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      text: "Quiz me on cell biology",
    });
    expect(onPendingPromptHandled).toHaveBeenCalledTimes(1);
  });

  test("does not resend on a re-render with the same pending prompt id", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));

    const pendingPrompt = { text: "Quiz me on cell biology", id: 1 };
    const { rerender } = render(
      <ChatInterface pendingPrompt={pendingPrompt} />,
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);

    rerender(<ChatInterface pendingPrompt={pendingPrompt} />);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test("selecting the same text again (a new id) sends it again", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));

    const { rerender } = render(
      <ChatInterface pendingPrompt={{ text: "Explain osmosis", id: 1 }} />,
    );
    rerender(<ChatInterface pendingPrompt={{ text: "Explain osmosis", id: 2 }} />);

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  test("waits for a ready status before sending", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({ sendMessage, status: "streaming" }),
    );

    render(
      <ChatInterface pendingPrompt={{ text: "Quiz me on cell biology", id: 1 }} />,
    );

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("onQuizGenerated — capturing quiz data for the Quiz panel", () => {
  test("fires once with the quiz output when a tool-createQuiz part reaches output-available", () => {
    const onQuizGenerated = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Quiz me on photosynthesis"),
          assistantMessageWithParts([outputAvailableQuizPart()]),
        ],
      }),
    );

    render(<ChatInterface onQuizGenerated={onQuizGenerated} />);

    expect(onQuizGenerated).toHaveBeenCalledTimes(1);
    expect(onQuizGenerated).toHaveBeenCalledWith(
      outputAvailableQuizPart().output,
    );
  });

  test("does not fire again for a quiz it has already reported", () => {
    const onQuizGenerated = vi.fn();
    const messages = [
      userMessage("Quiz me on photosynthesis"),
      assistantMessageWithParts([outputAvailableQuizPart()]),
    ];
    mockUseChat.mockReturnValue(makeUseChatReturn({ messages }));

    const { rerender } = render(
      <ChatInterface onQuizGenerated={onQuizGenerated} />,
    );
    expect(onQuizGenerated).toHaveBeenCalledTimes(1);

    // Same messages array, e.g. a re-render triggered by something
    // unrelated (a status change) — must not re-report the same quiz.
    mockUseChat.mockReturnValue(makeUseChatReturn({ messages }));
    rerender(<ChatInterface onQuizGenerated={onQuizGenerated} />);

    expect(onQuizGenerated).toHaveBeenCalledTimes(1);
  });

  test("does not render the interactive quiz inline — only the ready notice", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Quiz me on photosynthesis"),
          assistantMessageWithParts([outputAvailableQuizPart()]),
        ],
      }),
    );

    render(<ChatInterface />);

    expect(screen.getByText(/Quiz ready/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chlorophyll" }),
    ).not.toBeInTheDocument();
  });
});

describe("onFlashcardsGenerated — capturing flashcard data for Practice", () => {
  test("fires once with the flashcards output when a tool-createFlashcards part reaches output-available", () => {
    const onFlashcardsGenerated = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Flashcards on photosynthesis please"),
          assistantMessageWithParts([outputAvailableFlashcardsPart()]),
        ],
      }),
    );

    render(<ChatInterface onFlashcardsGenerated={onFlashcardsGenerated} />);

    expect(onFlashcardsGenerated).toHaveBeenCalledTimes(1);
    expect(onFlashcardsGenerated).toHaveBeenCalledWith(
      outputAvailableFlashcardsPart().output,
    );
  });

  test("does not fire again for a set it has already reported", () => {
    const onFlashcardsGenerated = vi.fn();
    const messages = [
      userMessage("Flashcards on photosynthesis please"),
      assistantMessageWithParts([outputAvailableFlashcardsPart()]),
    ];
    mockUseChat.mockReturnValue(makeUseChatReturn({ messages }));

    const { rerender } = render(
      <ChatInterface onFlashcardsGenerated={onFlashcardsGenerated} />,
    );
    expect(onFlashcardsGenerated).toHaveBeenCalledTimes(1);

    mockUseChat.mockReturnValue(makeUseChatReturn({ messages }));
    rerender(<ChatInterface onFlashcardsGenerated={onFlashcardsGenerated} />);

    expect(onFlashcardsGenerated).toHaveBeenCalledTimes(1);
  });

  test("does not render the flashcards inline — only the ready notice", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Flashcards on photosynthesis please"),
          assistantMessageWithParts([outputAvailableFlashcardsPart()]),
        ],
      }),
    );

    render(<ChatInterface />);

    expect(screen.getByText(/Flashcards ready/)).toBeInTheDocument();
    expect(
      screen.queryByText("What pigment captures light in photosynthesis?", {
        exact: false,
      }),
    ).not.toBeInTheDocument();
  });
});

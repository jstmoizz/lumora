import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, render, screen, within, fireEvent } from "@testing-library/react";
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

  // `status` (and therefore `canSend`) is React state — it only reflects
  // "no longer ready" once a render has happened. Two clicks dispatched
  // inside a single `act()` block deliberately deny React that render
  // between them (its DOM commit — the Send button becoming disabled, the
  // textarea clearing — is deferred until the outer `act()` returns), so
  // both clicks see the exact same pre-submit DOM. Two separate
  // `fireEvent.click` calls would each flush on their own, and the second
  // one would simply land on an already-disabled button — proving nothing
  // about the ref. `sendMessage` is made to return a pending promise so the
  // first click's `isSubmittingRef` guard is still set (not yet reset by
  // `finally`) at the moment the second click's handler runs.
  test("a rapid double-submit (before React can re-render) calls sendMessage exactly once", () => {
    let resolveSend!: () => void;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain osmosis" },
    });
    const sendButton = screen.getByRole("button", { name: "Send" });

    act(() => {
      fireEvent.click(sendButton);
      fireEvent.click(sendButton);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    resolveSend();
  });

  test("the guard releases once the first submission settles, so a later legitimate submit still sends", async () => {
    let resolveSend!: () => void;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    const textarea = screen.getByLabelText("Message");
    const sendButton = screen.getByRole("button", { name: "Send" });

    fireEvent.change(textarea, { target: { value: "First question" } });
    fireEvent.click(sendButton);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Let the first submission's promise settle, so its `finally` block
    // (the only place `isSubmittingRef` is cleared) actually runs.
    await act(async () => {
      resolveSend();
    });

    fireEvent.change(textarea, { target: { value: "Second question" } });
    fireEvent.click(sendButton);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ text: "Second question" });
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

  // M3: `handleExampleClick` shares the composer's own `isSubmittingRef`
  // (see the composer's "rapid double-submit" test above for the full
  // rationale on why this needs an `act()`-batched double click rather than
  // two separate `fireEvent.click` calls — `status`/`canSend`-derived
  // disabling only reflects a render that hasn't happened yet by the time
  // the second click would land here).
  test("a rapid double-click on the same example prompt calls sendMessage exactly once", () => {
    let resolveSend!: () => void;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    const group = screen.getByRole("group", { name: "Example prompts" });
    const [firstPrompt] = within(group).getAllByRole("button");

    act(() => {
      fireEvent.click(firstPrompt);
      fireEvent.click(firstPrompt);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    resolveSend();
  });

  test("the guard releases once the first example-prompt submission settles, so a later distinct example prompt still sends", async () => {
    let resolveSend!: () => void;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    render(<ChatInterface />);

    const group = screen.getByRole("group", { name: "Example prompts" });
    const [firstPrompt, secondPrompt] = within(group).getAllByRole("button");
    const secondPromptText = secondPrompt.textContent;

    fireEvent.click(firstPrompt);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // Let the first submission's promise settle, so its `finally` block
    // (the only place `isSubmittingRef` is cleared) actually runs.
    await act(async () => {
      resolveSend();
    });

    fireEvent.click(secondPrompt);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith({ text: secondPromptText });
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

  // Mirrors the exact scenario /api/chat's own "regenerate-message with no
  // conversationId" fix relies on: the very first message of a session
  // failed before the server's `start` metadata (the only way the client
  // learns a conversationId) ever streamed back, so no message here carries
  // `metadata.conversationId` and no `initialConversationId` prop is
  // passed. The client's own behavior for this case must keep calling
  // `regenerate()` with no body — it's the server's job (not this
  // component's) to treat that as an initial submission rather than a
  // retry of an established conversation.
  test("Retry with no known conversationId calls regenerate with no body", () => {
    const regenerate = vi.fn(() => Promise.resolve());
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "error",
        messages: [userMessage("Explain entropy")],
        error: new TypeError("Failed to fetch"),
        regenerate,
      }),
    );
    render(<ChatInterface />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith();
  });
});

describe("onConversationIdKnown — GenerateWorkspace's URL/Recent Chats sync", () => {
  test("fires immediately with initialConversationId, for a resumed conversation", () => {
    const onConversationIdKnown = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn());

    render(
      <ChatInterface
        initialConversationId="conv-1"
        onConversationIdKnown={onConversationIdKnown}
      />,
    );

    expect(onConversationIdKnown).toHaveBeenCalledWith("conv-1");
  });

  test("fires once metadata reports a newly created conversation's id", () => {
    const onConversationIdKnown = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Explain osmosis"),
          {
            ...assistantTextMessage("Osmosis is...", "assistant-1"),
            metadata: { conversationId: "conv-new" },
          },
        ],
      }),
    );

    render(<ChatInterface onConversationIdKnown={onConversationIdKnown} />);

    expect(onConversationIdKnown).toHaveBeenCalledWith("conv-new");
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

describe("onTurnSettled — GenerateWorkspace's Recent Chats refresh trigger", () => {
  test("fires when status moves from streaming to ready", () => {
    const onTurnSettled = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "streaming",
        messages: [userMessage("Explain osmosis")],
      }),
    );
    const { rerender } = render(
      <ChatInterface onTurnSettled={onTurnSettled} />,
    );
    expect(onTurnSettled).not.toHaveBeenCalled();

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "ready",
        messages: [
          userMessage("Explain osmosis"),
          assistantTextMessage("Osmosis is...", "assistant-1"),
        ],
      }),
    );
    rerender(<ChatInterface onTurnSettled={onTurnSettled} />);

    expect(onTurnSettled).toHaveBeenCalledTimes(1);
  });

  test("fires when a turn ends in error, not just success", () => {
    const onTurnSettled = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "submitted",
        messages: [userMessage("Explain osmosis")],
      }),
    );
    const { rerender } = render(
      <ChatInterface onTurnSettled={onTurnSettled} />,
    );

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "error",
        messages: [userMessage("Explain osmosis")],
        error: new Error("failed"),
      }),
    );
    rerender(<ChatInterface onTurnSettled={onTurnSettled} />);

    expect(onTurnSettled).toHaveBeenCalledTimes(1);
  });

  test("does not fire on an unrelated re-render while already idle", () => {
    const onTurnSettled = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ status: "ready" }));
    const { rerender } = render(
      <ChatInterface onTurnSettled={onTurnSettled} />,
    );

    mockUseChat.mockReturnValue(makeUseChatReturn({ status: "ready" }));
    rerender(<ChatInterface onTurnSettled={onTurnSettled} />);

    expect(onTurnSettled).not.toHaveBeenCalled();
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

describe("initial scroll position when resuming a conversation", () => {
  // jsdom has no real layout engine, so scrollHeight/clientHeight are 0 by
  // default — a scrollable conversation is simulated by stubbing them on
  // the prototype (affects every element for the test, restored after).
  function mockScrollableContainer() {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(2000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("starts at the top and offers Go to latest, instead of jumping to the newest message", () => {
    mockScrollableContainer();
    const initialMessages = [
      userMessage("Explain osmosis", "msg-1"),
      assistantTextMessage("Osmosis is the movement of water.", "assistant-1"),
    ];
    mockUseChat.mockReturnValue(makeUseChatReturn({ messages: initialMessages }));

    render(
      <ChatInterface
        initialConversationId="conv-1"
        initialMessages={initialMessages}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Go to latest" }),
    ).toBeInTheDocument();
  });

  test("a brand-new conversation (no initialMessages) has nothing to start at the top of", () => {
    mockScrollableContainer();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({ messages: [userMessage("Explain osmosis")] }),
    );

    // No `initialMessages` prop — this message came from the user typing
    // just now, not from resuming history.
    render(<ChatInterface />);

    expect(
      screen.queryByRole("button", { name: "Go to latest" }),
    ).not.toBeInTheDocument();
  });

  test("clicking Go to latest scrolls down and hides itself", () => {
    mockScrollableContainer();
    const initialMessages = [
      userMessage("Explain osmosis", "msg-1"),
      assistantTextMessage("Osmosis is the movement of water.", "assistant-1"),
    ];
    mockUseChat.mockReturnValue(makeUseChatReturn({ messages: initialMessages }));

    render(
      <ChatInterface
        initialConversationId="conv-1"
        initialMessages={initialMessages}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Go to latest" }));

    expect(
      screen.queryByRole("button", { name: "Go to latest" }),
    ).not.toBeInTheDocument();
  });

  test("resuming a conversation starts at the top, so Go to top has nothing to offer yet", () => {
    mockScrollableContainer();
    const initialMessages = [
      userMessage("Explain osmosis", "msg-1"),
      assistantTextMessage("Osmosis is the movement of water.", "assistant-1"),
    ];
    mockUseChat.mockReturnValue(makeUseChatReturn({ messages: initialMessages }));

    render(
      <ChatInterface
        initialConversationId="conv-1"
        initialMessages={initialMessages}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Go to top" }),
    ).not.toBeInTheDocument();
  });

  test("a short conversation that fits without scrolling offers neither button", () => {
    // No scrollable overflow: content exactly fills the viewport.
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    mockUseChat.mockReturnValue(
      makeUseChatReturn({ messages: [userMessage("Explain osmosis")] }),
    );

    render(<ChatInterface />);

    expect(
      screen.queryByRole("button", { name: "Go to latest" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Go to top" }),
    ).not.toBeInTheDocument();
  });
});

describe("Go to top — as an already-scrolled-down conversation grows", () => {
  function mockScrollableContainer() {
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(2000);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("appears once the conversation grows past one screen, even though the user never touched the scrollbar", () => {
    mockScrollableContainer();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Explain osmosis"),
          assistantTextMessage("Osmosis is the movement of water.", "assistant-1"),
        ],
      }),
    );

    render(<ChatInterface />);

    // Auto-follow scrolled to the bottom as the reply streamed in — the top
    // of the conversation is now out of view purely from that growth.
    expect(
      screen.getByRole("button", { name: "Go to top" }),
    ).toBeInTheDocument();
    // Already at the bottom (that's where auto-follow left it), so there's
    // nothing further down to jump to.
    expect(
      screen.queryByRole("button", { name: "Go to latest" }),
    ).not.toBeInTheDocument();
  });

  test("clicking Go to top scrolls up and hides itself", () => {
    mockScrollableContainer();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("Explain osmosis"),
          assistantTextMessage("Osmosis is the movement of water.", "assistant-1"),
        ],
      }),
    );

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Go to top" }));

    expect(
      screen.queryByRole("button", { name: "Go to top" }),
    ).not.toBeInTheDocument();
  });
});

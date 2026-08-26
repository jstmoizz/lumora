import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { act, render, screen, within, fireEvent } from "@testing-library/react";
import { useChat } from "@ai-sdk/react";
import ChatInterface from "../ChatInterface";
import { makeUseChatReturn, type MockUseChatReturn } from "./useChatMock";
import {
  assistantExtractionMessage,
  assistantMessageWithParts,
  assistantTextMessage,
  outputAvailableFlashcardsPart,
  outputAvailableQuizPart,
  SAMPLE_EXTRACTION,
  userMessage,
} from "./fixtures";

vi.mock("@ai-sdk/react", () => ({
  useChat: vi.fn(),
}));

// vi.mocked picks useChat's untyped default instantiation, which doesn't
// structurally match LumoraUIMessage — bridges back to the concrete type.
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
    expect(sendMessage).toHaveBeenCalledWith(
      { text: "Explain osmosis" },
      { body: { mode: "auto" } },
    );
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

  // Both clicks share one act() block so React can't re-render between
  // them — two separate fireEvent.click calls would each flush on their
  // own, and the second would just land on an already-disabled button,
  // proving nothing about the ref.
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
    expect(sendMessage).toHaveBeenLastCalledWith(
      { text: "Second question" },
      { body: { mode: "auto" } },
    );
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
      { body: { conversationId: "conv-1", mode: "auto" } },
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
    expect(sendMessage).toHaveBeenCalledWith(
      { text: promptText },
      { body: { mode: "auto" } },
    );
  });

  // handleExampleClick shares the composer's own isSubmittingRef — see the
  // composer's "rapid double-submit" test above for why this needs an
  // act()-batched double click.
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
    expect(sendMessage).toHaveBeenLastCalledWith(
      { text: secondPromptText },
      { body: { mode: "auto" } },
    );
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

describe("pending status copy — reflecting what the current turn is doing", () => {
  test("shows the quiz-specific copy while the Create Quiz handoff is pending", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );
    const { rerender } = render(<ChatInterface />);

    fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "submitted",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage(`Create a quiz based on ${SAMPLE_EXTRACTION.title}.`, "user-2"),
        ],
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Creating your quiz…")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  });

  test("shows the flashcards-specific copy while the Create Flashcards handoff is pending", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );
    const { rerender } = render(<ChatInterface />);

    fireEvent.click(screen.getByRole("button", { name: "Create Flashcards" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "submitted",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage(`Create flashcards based on ${SAMPLE_EXTRACTION.title}.`, "user-2"),
        ],
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Creating your flashcards…")).toBeInTheDocument();
  });

  test("an ordinary text turn keeps the generic Thinking… copy, not a handoff-specific one", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    const { rerender } = render(<ChatInterface />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain osmosis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "submitted",
        messages: [userMessage("Explain osmosis")],
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });

  test("a stale intent from a finished turn never leaks into the next, unrelated turn", async () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );
    const { rerender } = render(<ChatInterface />);

    // First turn: a quiz handoff. await act(async () => {}) flushes
    // handleExtractionAction's own await so isSubmittingRef releases before
    // the second send below.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));
    });
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "ready",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
          assistantTextMessage("Here's a quiz — open Resources to take it!", "assistant-2"),
        ],
      }),
    );
    rerender(<ChatInterface />);

    // Second, unrelated turn: a plain text question — must show the
    // generic copy, not "Creating your quiz…" left over from the first.
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain photosynthesis in more depth" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "submitted",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
          assistantTextMessage("Here's a quiz — open Resources to take it!", "assistant-2"),
          userMessage("Explain photosynthesis in more depth", "user-3"),
        ],
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.queryByText("Creating your quiz…")).not.toBeInTheDocument();
  });

  // Same guarantee as the test above, reached via Retry recovering from a
  // failure instead of a first-try success.
  test("a stale intent from a *failed-then-retried* turn never leaks into the next, unrelated turn", async () => {
    const sendMessage = vi.fn();
    const regenerate = vi.fn(() => Promise.resolve());
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );
    const { rerender } = render(<ChatInterface />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));
    });
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "error",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
        ],
        error: new Error("RATE_LIMITED"),
      }),
    );
    rerender(<ChatInterface />);
    expect(screen.getByText("AI usage is temporarily limited.")).toBeInTheDocument();

    // Retry succeeds this time.
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "ready",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
          assistantTextMessage("Here's a quiz — open Resources to take it!", "assistant-2"),
        ],
      }),
    );
    rerender(<ChatInterface />);
    expect(screen.queryByText("AI usage is temporarily limited.")).not.toBeInTheDocument();

    // Now a brand-new, unrelated message.
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain photosynthesis in more depth" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "submitted",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
          assistantTextMessage("Here's a quiz — open Resources to take it!", "assistant-2"),
          userMessage("Explain photosynthesis in more depth", "user-3"),
        ],
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.queryByText("Creating your quiz…")).not.toBeInTheDocument();
  });
});

describe("image attachment — Vision-processing hint", () => {
  function pngFile(name = "photo.png") {
    return new File([new Uint8Array([1, 2, 3, 4])], name, { type: "image/png" });
  }

  test("attaching an image shows a subtle hint that Vision processing will be used", async () => {
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });

    expect(await screen.findByText("Image attached · Vision processing")).toBeInTheDocument();
  });

  test("Fast is disabled in the mode picker while an image is attached, Auto/Vision remain usable", async () => {
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface />);

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });
    await screen.findByText("Image attached · Vision processing");

    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    fireEvent.pointerDown(modeButton, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.click(modeButton);

    const fastItem = await screen.findByRole("menuitemradio", { name: /Fast/ });
    expect(fastItem).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitemradio", { name: /Auto/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: /Vision/ })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("mode picker", () => {
  test("lists Auto, Fast, and Vision with their capability descriptions", async () => {
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface />);

    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    fireEvent.pointerDown(modeButton, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.click(modeButton);

    expect(await screen.findByRole("menuitemradio", { name: /Auto/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Fast/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: /Vision/ })).toBeInTheDocument();
    expect(screen.getByText("Best model for the task")).toBeInTheDocument();
    expect(screen.getByText("Fastest text responses")).toBeInTheDocument();
    expect(screen.getByText("Analyze images and visual content")).toBeInTheDocument();
    // No provider/model name anywhere in the picker.
    expect(screen.queryByText(/qwen|gpt-oss/i)).not.toBeInTheDocument();
  });

  test("the trigger is keyboard reachable and opens the menu on Enter", async () => {
    mockUseChat.mockReturnValue(makeUseChatReturn());
    render(<ChatInterface />);

    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    modeButton.focus();
    expect(modeButton).toHaveFocus();

    fireEvent.keyDown(modeButton, { key: "Enter" });
    expect(await screen.findByRole("menuitemradio", { name: /Vision/ })).toBeInTheDocument();
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

  // The very first message of a session failed before the server's start
  // metadata ever streamed back, so no conversationId is known anywhere —
  // regenerate() must still be called, just with no conversationId.
  test("Retry with no known conversationId calls regenerate with no conversationId", () => {
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
    expect(regenerate).toHaveBeenCalledWith({ body: { mode: "auto" } });
  });
});

describe("provider/quota error copy — the server only ever sends a safe AIErrorCode", () => {
  test("RATE_LIMITED from a normal chat failure shows the usage-limit copy with a mode-switch hint", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    const { rerender } = render(<ChatInterface />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain osmosis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "error",
        messages: [userMessage("Explain osmosis")],
        error: new Error("RATE_LIMITED"),
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("AI usage is temporarily limited.")).toBeInTheDocument();
    expect(screen.getByText(/different mode/)).toBeInTheDocument();
  });

  test("PROVIDER_UNAVAILABLE from a normal chat failure shows the temporary-unavailable copy", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    const { rerender } = render(<ChatInterface />);

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Explain osmosis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "error",
        messages: [userMessage("Explain osmosis")],
        error: new Error("PROVIDER_UNAVAILABLE"),
      }),
    );
    rerender(<ChatInterface />);

    expect(
      screen.getByText("The AI service is temporarily unavailable."),
    ).toBeInTheDocument();
  });

  function attachTestImage() {
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    return screen.findByText("Image attached · Vision processing");
  }

  test("RATE_LIMITED from a failed image submission shows the image-analysis-specific copy, not the generic one, and omits the mode-switch hint", async () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    const { rerender } = render(<ChatInterface />);

    await attachTestImage();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "error",
        messages: [userMessage("What is this?")],
        error: new Error("RATE_LIMITED"),
      }),
    );
    rerender(<ChatInterface />);

    expect(
      screen.getByText("Image analysis is temporarily unavailable."),
    ).toBeInTheDocument();
    expect(screen.queryByText("AI usage is temporarily limited.")).not.toBeInTheDocument();
    expect(screen.queryByText(/different mode/)).not.toBeInTheDocument();
  });

  test("a generic (non-quota) failure during image extraction shows the extraction-specific default, not the normal-chat default", async () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    const { rerender } = render(<ChatInterface />);

    await attachTestImage();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        status: "error",
        messages: [userMessage("What is this?")],
        error: new Error("GENERATION_FAILED"),
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Couldn't analyze this image.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't finish that response")).not.toBeInTheDocument();
  });

  test("retrying a failed image submission still shows the image-specific pending copy during the retry, not generic Thinking…", async () => {
    const regenerate = vi.fn(() => Promise.resolve());
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage, regenerate }));
    const { rerender } = render(<ChatInterface />);

    // Establish pendingIntent "image" the same way a real image send would.
    await attachTestImage();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "error",
        messages: [userMessage("What is this?")],
        error: new Error("RATE_LIMITED"),
      }),
    );
    rerender(<ChatInterface />);
    expect(
      screen.getByText("Image analysis is temporarily unavailable."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "submitted",
        messages: [userMessage("What is this?")],
      }),
    );
    rerender(<ChatInterface />);

    expect(screen.getByText("Understanding your image…")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
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

describe("ExtractionCard — reviewing an image's extracted content", () => {
  test("renders the card with the heading, title, summary, and extracted content", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);

    expect(screen.getByText("I found this in your image")).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_EXTRACTION.title as string)).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_EXTRACTION.summary)).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_EXTRACTION.extractedContent)).toBeInTheDocument();
    expect(screen.getByText("Chlorophyll")).toBeInTheDocument();
  });

  test("does not also render the extraction as plain chat text alongside the card", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);

    // The card renders the summary once (asserted above); the sibling text
    // part carrying the identical string must be suppressed, not rendered a
    // second time through Streamdown.
    expect(screen.getAllByText(SAMPLE_EXTRACTION.summary)).toHaveLength(1);
  });

  test("Create Quiz and Create Flashcards are real, keyboard-reachable buttons", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);

    const quizButton = screen.getByRole("button", { name: "Create Quiz" });
    const flashcardsButton = screen.getByRole("button", { name: "Create Flashcards" });
    expect(quizButton.tagName).toBe("BUTTON");
    expect(flashcardsButton.tagName).toBe("BUTTON");

    quizButton.focus();
    expect(quizButton).toHaveFocus();
    flashcardsButton.focus();
    expect(flashcardsButton).toHaveFocus();
  });

  test("Create Quiz sends a new GPT-OSS request naming the extracted topic, with no image attached", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [message, options] = sendMessage.mock.calls[0];
    expect(message.text).toContain(SAMPLE_EXTRACTION.title);
    expect(message.files).toBeUndefined();
    expect(options.body.mode).toBe("auto");
  });

  test("Create Flashcards sends a new GPT-OSS request naming the extracted topic, with no image attached", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Create Flashcards" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [message, options] = sendMessage.mock.calls[0];
    expect(message.text).toContain(SAMPLE_EXTRACTION.title);
    expect(message.files).toBeUndefined();
    expect(options.body.mode).toBe("auto");
  });

  // Must not matter which mode the composer shows — even "vision" must not
  // route this follow-up back to Qwen.
  test("Create Quiz still forces GPT-OSS even if the composer is still set to Vision mode", async () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);
    // Radix's DropdownMenuTrigger opens on `pointerdown`, not `click` — see
    // SettingsClient.test.tsx's openGenerateAccentMenu for the same fix.
    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    fireEvent.pointerDown(modeButton, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.click(modeButton);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Vision/ }));

    fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));

    const [, options] = sendMessage.mock.calls[0];
    expect(options.body.mode).toBe("auto");
  });

  test("clicking Create Quiz twice rapidly only sends one request", () => {
    let resolveSend!: () => void;
    const sendMessage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
    );
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);
    const quizButton = screen.getByRole("button", { name: "Create Quiz" });

    act(() => {
      fireEvent.click(quizButton);
      fireEvent.click(quizButton);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    resolveSend();
  });

  test("Ask about this moves focus to the composer instead of sending anything", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
        ],
      }),
    );

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));

    expect(screen.getByLabelText("Message")).toHaveFocus();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("the card's actions are disabled while a turn is already generating", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "streaming",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
        ],
      }),
    );

    render(<ChatInterface />);

    expect(screen.getByRole("button", { name: "Create Quiz" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create Flashcards" })).toBeDisabled();
  });

  test("the card's actions re-enable after a failed handoff, not stuck disabled", () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        status: "error",
        error: new Error("RATE_LIMITED"),
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
        ],
      }),
    );

    render(<ChatInterface />);

    expect(screen.getByRole("button", { name: "Create Quiz" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Create Flashcards" })).toBeEnabled();
  });

  // Renders extraction/handoff messages the way a resumed conversation
  // arrives (via initialMessages, not a live stream).
  test("a reloaded conversation renders the extraction card from persisted data and its actions still work", () => {
    const sendMessage = vi.fn();
    const initialMessages = [
      userMessage("What is this?", "msg-1"),
      assistantExtractionMessage(),
    ];
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage, messages: initialMessages }));

    render(
      <ChatInterface initialConversationId="conv-1" initialMessages={initialMessages} />,
    );

    expect(screen.getByText("I found this in your image")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, options] = sendMessage.mock.calls[0];
    expect(options.body).toEqual({ conversationId: "conv-1", mode: "auto" });
  });

  // Mirrors the Groq quirk noted in lib/ai/tools.ts — title "" must be
  // treated identically to null everywhere it's read.
  test("a blank-string title (not null) is treated as 'no title', same as null", () => {
    const sendMessage = vi.fn();
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage({ title: "" }),
        ],
      }),
    );

    render(<ChatInterface />);
    expect(screen.queryByText(SAMPLE_EXTRACTION.title as string)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));
    const [message] = sendMessage.mock.calls[0];
    expect(message.text).toBe("Create a quiz based on the image I shared.");
  });

  test("Ask about this never changes the composer's selected mode", async () => {
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );

    render(<ChatInterface />);
    expect(screen.getByRole("button", { name: /^Mode: Auto\./ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask about this" }));

    expect(screen.getByRole("button", { name: /^Mode: Auto\./ })).toBeInTheDocument();
  });
});

describe("quiz/flashcard handoff retry — must never fall back to Qwen", () => {
  // The core regression this block guards: handleRetry used to send the
  // composer's raw mode on every retry, so a Vision-mode handoff retry
  // would silently resend to Qwen instead of GPT-OSS.
  test("retrying a failed Create Quiz handoff forces mode auto even if the composer is still set to Vision", async () => {
    const sendMessage = vi.fn();
    const regenerate = vi.fn(() => Promise.resolve());
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );
    const { rerender } = render(<ChatInterface />);

    // Switch the composer to Vision — plausible after having just sent the
    // image in Vision mode, and nothing in the app resets it afterward.
    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    fireEvent.pointerDown(modeButton, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.click(modeButton);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Vision/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Quiz" }));
    });

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "error",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
        ],
        error: new Error("RATE_LIMITED"),
      }),
    );
    rerender(<ChatInterface />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith({ body: { mode: "auto" } });
  });

  test("retrying a failed Create Flashcards handoff forces mode auto the same way", async () => {
    const sendMessage = vi.fn();
    const regenerate = vi.fn(() => Promise.resolve());
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        messages: [userMessage("What is this?"), assistantExtractionMessage()],
      }),
    );
    const { rerender } = render(<ChatInterface />);

    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    fireEvent.pointerDown(modeButton, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.click(modeButton);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Vision/ }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create Flashcards" }));
    });

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "error",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create flashcards based on Photosynthesis notes.", "user-2"),
        ],
        error: new Error("PROVIDER_UNAVAILABLE"),
      }),
    );
    rerender(<ChatInterface />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith({ body: { mode: "auto" } });
  });

  // The counterpart case: an image extraction retry must keep whichever
  // mode is selected, since handleRetry decides based on what actually
  // failed, not a blanket override.
  test("retrying a failed image extraction keeps the currently selected mode, unlike a handoff retry", async () => {
    const sendMessage = vi.fn();
    const regenerate = vi.fn(() => Promise.resolve());
    mockUseChat.mockReturnValue(makeUseChatReturn({ sendMessage }));
    const { rerender } = render(<ChatInterface />);

    const modeButton = screen.getByRole("button", { name: /^Mode:/ });
    fireEvent.pointerDown(modeButton, { button: 0, pointerId: 1, isPrimary: true });
    fireEvent.click(modeButton);
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Vision/ }));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    await screen.findByText("Image attached · Vision processing");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "error",
        messages: [userMessage("What is this?")],
        error: new Error("RATE_LIMITED"),
      }),
    );
    rerender(<ChatInterface />);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(regenerate).toHaveBeenCalledWith({ body: { mode: "vision" } });
  });

  test("Retry never calls sendMessage — only the SDK's own regenerate — so it can't duplicate or re-trigger an ExtractionCard action", async () => {
    const sendMessage = vi.fn();
    const regenerate = vi.fn(() => Promise.resolve());
    mockUseChat.mockReturnValue(
      makeUseChatReturn({
        sendMessage,
        regenerate,
        status: "error",
        messages: [
          userMessage("What is this?"),
          assistantExtractionMessage(),
          userMessage("Create a quiz based on Photosynthesis notes.", "user-2"),
        ],
        error: new Error("RATE_LIMITED"),
      }),
    );

    render(<ChatInterface />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
    // The original extraction card is still there, untouched by the retry.
    expect(screen.getByText("I found this in your image")).toBeInTheDocument();
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

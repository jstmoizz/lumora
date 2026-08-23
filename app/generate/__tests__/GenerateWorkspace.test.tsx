import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { LumoraUIMessage } from "@/lib/ai/tools";
import type { ConversationSummary } from "@/lib/supabase/conversations";
import GenerateWorkspace from "../GenerateWorkspace";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

// ChatInterface itself is fully covered by ChatInterface.test.tsx (it needs
// its own useChat mock). Here it's stubbed down to just the props
// GenerateWorkspace's own logic actually reacts to, so these tests exercise
// GenerateWorkspace's session-switching/persistence wiring in isolation.
vi.mock("../ChatInterface", () => ({
  default: ({
    initialConversationId,
    initialMessages,
    onConversationIdKnown,
    onTurnSettled,
  }: {
    initialConversationId?: string;
    initialMessages?: LumoraUIMessage[];
    onConversationIdKnown?: (id: string) => void;
    onTurnSettled?: () => void;
  }) => (
    <div data-testid="chat-interface">
      <span data-testid="chat-initial-id">{initialConversationId ?? ""}</span>
      <span data-testid="chat-message-count">
        {initialMessages?.length ?? 0}
      </span>
      <button onClick={() => onConversationIdKnown?.("conv-new")}>
        simulate conversation known
      </button>
      <button onClick={() => onTurnSettled?.()}>simulate turn settled</button>
    </div>
  ),
}));

function conversation(
  overrides: Partial<ConversationSummary> = {},
): ConversationSummary {
  return {
    id: "conv-1",
    title: "Explain osmosis",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  replaceMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("layout and labels", () => {
  test("renders Recent Chats and Resources as the two side panels", () => {
    render(<GenerateWorkspace initialConversations={[conversation()]} />);

    expect(screen.getByRole("complementary", { name: "Recent chats" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Resources" })).toBeInTheDocument();
  });
});

describe("New Chat", () => {
  test("clears the active conversation, remounts the session, and resets the URL", () => {
    render(
      <GenerateWorkspace
        initialConversationId="conv-1"
        initialMessages={[]}
        initialConversations={[conversation()]}
      />,
    );

    expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-1");

    const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
    fireEvent.click(within(recentChats).getByRole("button", { name: "New Chat" }));

    expect(screen.getByTestId("chat-initial-id")).toBeEmptyDOMElement();
    expect(replaceMock).toHaveBeenCalledWith("/generate", { scroll: false });
  });
});

describe("selecting a Recent Chat", () => {
  test("fetches its messages and switches the active session", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "m1", role: "user", parts: [] }] }),
    });

    render(
      <GenerateWorkspace
        initialConversations={[
          conversation({ id: "conv-2", title: "Quiz me on cell biology" }),
        ]}
      />,
    );

    const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
    fireEvent.click(
      within(recentChats).getByRole("button", { name: /Quiz me on cell biology/ }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-2"),
    );
    expect(screen.getByTestId("chat-message-count")).toHaveTextContent("1");
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-2");
    expect(replaceMock).toHaveBeenCalledWith(
      "/generate?conversationId=conv-2",
      { scroll: false },
    );
  });
});

describe("conversation lifecycle callbacks from ChatInterface", () => {
  test("onConversationIdKnown syncs the URL and refreshes Recent Chats", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [conversation({ id: "conv-new" })] }),
    });

    render(<GenerateWorkspace initialConversations={[]} />);

    fireEvent.click(
      screen.getByRole("button", { name: "simulate conversation known" }),
    );

    expect(replaceMock).toHaveBeenCalledWith(
      "/generate?conversationId=conv-new",
      { scroll: false },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations"));
  });

  test("onTurnSettled re-fetches Recent Chats", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [conversation()] }),
    });

    render(<GenerateWorkspace initialConversations={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "simulate turn settled" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations"));
  });
});

describe("resuming a session on a bare /generate load", () => {
  test("restores the tab's active conversation from sessionStorage when the URL has none", async () => {
    sessionStorage.setItem("lumora-active-conversation-id", "conv-stored");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "m1", role: "user", parts: [] }] }),
    });

    render(<GenerateWorkspace initialConversations={[]} />);

    expect(
      screen.getByText("Restoring your conversation…"),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId("chat-initial-id")).toHaveTextContent(
        "conv-stored",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/conversations/conv-stored");
  });

  test("does nothing when nothing was stored", () => {
    render(<GenerateWorkspace initialConversations={[]} />);

    expect(screen.getByTestId("chat-initial-id")).toBeEmptyDOMElement();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a conversationId already resolved from the URL skips the sessionStorage check entirely", () => {
    sessionStorage.setItem("lumora-active-conversation-id", "conv-stored");

    render(
      <GenerateWorkspace
        initialConversationId="conv-from-url"
        initialMessages={[]}
        initialConversations={[]}
      />,
    );

    expect(screen.getByTestId("chat-initial-id")).toHaveTextContent(
      "conv-from-url",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

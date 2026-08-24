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

describe("Generate accent", () => {
  test("defaults to indigo", () => {
    const { container } = render(
      <GenerateWorkspace initialConversations={[conversation()]} />,
    );

    expect(container.querySelector("[data-generate-accent]")).toHaveAttribute(
      "data-generate-accent",
      "indigo",
    );
  });

  test("picks up an accent chosen earlier in Settings, persisted via localStorage", async () => {
    window.localStorage.setItem("lumora-generate-accent", "pink");

    const { container } = render(
      <GenerateWorkspace initialConversations={[conversation()]} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector("[data-generate-accent]"),
      ).toHaveAttribute("data-generate-accent", "pink");
    });
  });

  test("ignores a corrupted stored value and falls back to indigo", async () => {
    window.localStorage.setItem("lumora-generate-accent", "not-a-real-accent");

    const { container } = render(
      <GenerateWorkspace initialConversations={[conversation()]} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector("[data-generate-accent]"),
      ).toHaveAttribute("data-generate-accent", "indigo");
    });
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

  test("a network failure surfaces an accessible error, clears loading, and leaves the active session untouched — no unhandled rejection", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    render(
      <GenerateWorkspace
        initialConversations={[
          conversation({ id: "conv-2", title: "Quiz me on cell biology" }),
        ]}
      />,
    );

    const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
    const row = within(recentChats).getByRole("button", {
      name: /Quiz me on cell biology/,
    });
    fireEvent.click(row);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load this conversation. Please try again.",
    );
    // Loading cleared — the row is clickable again, not stuck disabled.
    await waitFor(() => expect(row).not.toBeDisabled());
    // Nothing about the active (empty, brand-new) session changed.
    expect(screen.getByTestId("chat-initial-id")).toBeEmptyDOMElement();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  test("a 404 surfaces a stale-conversation message, refreshes the list, and applies no conversation state", async () => {
    fetchMock.mockImplementation((input: string) => {
      if (input === "/api/conversations/conv-gone") {
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
      }
      if (input === "/api/conversations") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: [] }),
        });
      }
      throw new Error(`unexpected fetch: ${input}`);
    });

    render(
      <GenerateWorkspace
        initialConversations={[
          conversation({ id: "conv-gone", title: "A conversation that's since been deleted" }),
        ]}
      />,
    );

    const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
    fireEvent.click(
      within(recentChats).getByRole("button", {
        name: /A conversation that's since been deleted/,
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This conversation is no longer available.",
    );
    expect(screen.getByTestId("chat-initial-id")).toBeEmptyDOMElement();
    expect(replaceMock).not.toHaveBeenCalled();
    // The stale conversation's own row disappears once the list refreshes.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/conversations"));
  });

  test("retrying the same conversation after a failure works normally", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fetchMock.mockResolvedValueOnce({
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
    const row = within(recentChats).getByRole("button", {
      name: /Quiz me on cell biology/,
    });

    fireEvent.click(row);
    await screen.findByRole("alert");

    fireEvent.click(row);
    await waitFor(() =>
      expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-2"),
    );
    // The error from the first attempt doesn't linger once the retry
    // succeeds.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("rapid overlapping selection", () => {
    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }

    test("B resolving before A: B wins, A's late response is ignored", async () => {
      const responseA = deferred<{
        ok: boolean;
        json: () => Promise<{ messages: LumoraUIMessage[] }>;
      }>();
      const responseB = deferred<{
        ok: boolean;
        json: () => Promise<{ messages: LumoraUIMessage[] }>;
      }>();
      fetchMock.mockImplementation((input: string) => {
        if (input === "/api/conversations/conv-a") return responseA.promise;
        if (input === "/api/conversations/conv-b") return responseB.promise;
        throw new Error(`unexpected fetch: ${input}`);
      });

      render(
        <GenerateWorkspace
          initialConversations={[
            conversation({ id: "conv-a", title: "Topic A" }),
            conversation({ id: "conv-b", title: "Topic B" }),
          ]}
        />,
      );

      const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
      fireEvent.click(within(recentChats).getByRole("button", { name: /Topic A/ }));
      fireEvent.click(within(recentChats).getByRole("button", { name: /Topic B/ }));

      // B resolves first.
      responseB.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: "b1", role: "user", parts: [] }] }),
      });
      await waitFor(() =>
        expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-b"),
      );
      expect(replaceMock).toHaveBeenCalledWith(
        "/generate?conversationId=conv-b",
        { scroll: false },
      );

      // A resolves after — stale, must not overwrite B.
      responseA.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: "a1", role: "user", parts: [] }] }),
      });
      // Nothing to await for A's effect specifically (there shouldn't be
      // one) — flush microtasks, then assert state is still B's.
      await Promise.resolve();
      await Promise.resolve();
      expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-b");
      expect(screen.getByTestId("chat-message-count")).toHaveTextContent("1");
      expect(replaceMock).not.toHaveBeenCalledWith(
        "/generate?conversationId=conv-a",
        { scroll: false },
      );
    });

    test("A resolving before B: B still wins once it resolves", async () => {
      const responseA = deferred<{
        ok: boolean;
        json: () => Promise<{ messages: LumoraUIMessage[] }>;
      }>();
      const responseB = deferred<{
        ok: boolean;
        json: () => Promise<{ messages: LumoraUIMessage[] }>;
      }>();
      fetchMock.mockImplementation((input: string) => {
        if (input === "/api/conversations/conv-a") return responseA.promise;
        if (input === "/api/conversations/conv-b") return responseB.promise;
        throw new Error(`unexpected fetch: ${input}`);
      });

      render(
        <GenerateWorkspace
          initialConversations={[
            conversation({ id: "conv-a", title: "Topic A" }),
            conversation({ id: "conv-b", title: "Topic B" }),
          ]}
        />,
      );

      const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
      fireEvent.click(within(recentChats).getByRole("button", { name: /Topic A/ }));
      fireEvent.click(within(recentChats).getByRole("button", { name: /Topic B/ }));

      // A resolves first — stale the instant B was clicked, must not apply
      // even though nothing from B has resolved yet.
      responseA.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: "a1", role: "user", parts: [] }] }),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(screen.getByTestId("chat-initial-id")).toBeEmptyDOMElement();

      responseB.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: "b1", role: "user", parts: [] }] }),
      });
      await waitFor(() =>
        expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-b"),
      );
      expect(replaceMock).toHaveBeenCalledWith(
        "/generate?conversationId=conv-b",
        { scroll: false },
      );
    });

    test("a stale failure from A does not replace B's already-applied success", async () => {
      const responseA = deferred<{ ok: boolean; status?: number }>();
      const responseB = deferred<{
        ok: boolean;
        json: () => Promise<{ messages: LumoraUIMessage[] }>;
      }>();
      fetchMock.mockImplementation((input: string) => {
        if (input === "/api/conversations/conv-a") return responseA.promise;
        if (input === "/api/conversations/conv-b") return responseB.promise;
        throw new Error(`unexpected fetch: ${input}`);
      });

      render(
        <GenerateWorkspace
          initialConversations={[
            conversation({ id: "conv-a", title: "Topic A" }),
            conversation({ id: "conv-b", title: "Topic B" }),
          ]}
        />,
      );

      const recentChats = screen.getByRole("complementary", { name: "Recent chats" });
      fireEvent.click(within(recentChats).getByRole("button", { name: /Topic A/ }));
      fireEvent.click(within(recentChats).getByRole("button", { name: /Topic B/ }));

      responseB.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: "b1", role: "user", parts: [] }] }),
      });
      await waitFor(() =>
        expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-b"),
      );

      // A's request fails after B has already succeeded — must not show an
      // error for the conversation that's no longer what's selected.
      responseA.resolve({ ok: false, status: 500 });
      await Promise.resolve();
      await Promise.resolve();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-b");
    });
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

import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CreateQuizOutput } from "@/lib/ai/tools";
import type { ConversationSummary } from "@/lib/supabase/conversations";
import { multiQuestionQuiz } from "./fixtures";

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock("@/lib/supabase/conversation-actions", () => ({
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("@/lib/supabase/quiz-attempt-actions", () => ({
  saveQuizAttempt: vi.fn(),
  getQuizAttemptSummaries: vi.fn(),
}));

// Same idea as GenerateWorkspace.test.tsx's stub: just the props this
// file's wiring reacts to, plus a way to make a quiz appear.
vi.mock("../ChatInterface", () => ({
  default: ({
    initialConversationId,
    onConversationIdKnown,
    onQuizGenerated,
  }: {
    initialConversationId?: string;
    onConversationIdKnown?: (id: string) => void;
    onQuizGenerated?: (quiz: CreateQuizOutput) => void;
  }) => (
    <div data-testid="chat-interface">
      <span data-testid="chat-initial-id">{initialConversationId ?? ""}</span>
      <button onClick={() => onConversationIdKnown?.("conv-new")}>
        simulate conversation known
      </button>
      <button onClick={() => onQuizGenerated?.(multiQuestionQuiz())}>simulate quiz</button>
    </div>
  ),
}));

import { deleteConversation, renameConversation } from "@/lib/supabase/conversation-actions";
import {
  getQuizAttemptSummaries,
  saveQuizAttempt,
} from "@/lib/supabase/quiz-attempt-actions";
import GenerateWorkspace from "../GenerateWorkspace";

function conversations(): ConversationSummary[] {
  const now = new Date().toISOString();
  return [
    { id: "conv-1", title: "Explain osmosis", updatedAt: now },
    { id: "conv-2", title: "Quiz me on cell biology", updatedAt: now },
  ];
}

function recentChats() {
  return screen.getByRole("complementary", { name: "Recent chats" });
}

function recentRow(title: string) {
  const row = within(recentChats())
    .getAllByRole("listitem")
    .find((item) => item.textContent?.includes(title));
  if (!row) throw new Error(`No row for ${title}`);
  return row;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
  sessionStorage.clear();
  vi.mocked(getQuizAttemptSummaries).mockResolvedValue({});
  vi.mocked(saveQuizAttempt).mockResolvedValue({ ok: true });
});

describe("Recent Chats — rename and delete", () => {
  test("renaming updates the row in place", async () => {
    vi.mocked(renameConversation).mockResolvedValue({ ok: true });
    render(<GenerateWorkspace initialConversations={conversations()} />);

    fireEvent.click(
      within(recentRow("Explain osmosis")).getByRole("button", { name: "Rename conversation" }),
    );
    const input = within(recentChats()).getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(input, { target: { value: "Osmosis notes" } });
    fireEvent.submit(input);

    await waitFor(() =>
      expect(within(recentChats()).getByRole("button", { name: /Osmosis notes/ })).toBeInTheDocument(),
    );
    expect(renameConversation).toHaveBeenCalledWith("conv-1", "Osmosis notes");
  });

  test("deleting a conversation that isn't open just removes it from the list", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: true });
    render(
      <GenerateWorkspace initialConversations={conversations()} initialConversationId="conv-2" />,
    );

    fireEvent.click(
      within(recentRow("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(within(recentChats()).queryByText("Explain osmosis")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-2");
    expect(replaceMock).not.toHaveBeenCalledWith("/generate", expect.anything());
  });

  test("deleting the open conversation starts a fresh chat", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: true });
    render(
      <GenerateWorkspace initialConversations={conversations()} initialConversationId="conv-1" />,
    );
    expect(screen.getByTestId("chat-initial-id")).toHaveTextContent("conv-1");

    fireEvent.click(
      within(recentRow("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getByTestId("chat-initial-id")).toHaveTextContent(""));
    expect(replaceMock).toHaveBeenCalledWith("/generate", { scroll: false });
  });

  test("a failed delete keeps the conversation and shows an error", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: false });
    render(<GenerateWorkspace initialConversations={conversations()} />);

    fireEvent.click(
      within(recentRow("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await within(recentChats()).findByRole("alert")).toHaveTextContent(
      "Couldn't delete this conversation. Please try again.",
    );
    expect(within(recentChats()).getByText("Explain osmosis")).toBeInTheDocument();
  });
});

describe("Resources — quiz attempts", () => {
  function finishQuizInResources() {
    const resources = screen.getByRole("complementary", { name: "Resources" });
    fireEvent.click(within(resources).getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(within(resources).getByRole("button", { name: "Next question" }));
    fireEvent.click(within(resources).getByRole("button", { name: "Carbon dioxide" }));
    fireEvent.click(within(resources).getByRole("button", { name: "Next question" }));
    fireEvent.click(within(resources).getByRole("button", { name: "Chloroplast" }));
    fireEvent.click(within(resources).getByRole("button", { name: "Finish quiz" }));
    return resources;
  }

  test("loads saved scores for an existing conversation", async () => {
    vi.mocked(getQuizAttemptSummaries).mockResolvedValue({
      "quiz-multi": { attempts: 2, bestFull: { correct: 2, total: 3 } },
    });
    render(
      <GenerateWorkspace initialConversations={conversations()} initialConversationId="conv-1" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "simulate quiz" }));

    const resources = screen.getByRole("complementary", { name: "Resources" });
    expect(await within(resources).findByText("3 questions · Best 2/3")).toBeInTheDocument();
    expect(getQuizAttemptSummaries).toHaveBeenCalledWith("conv-1");
  });

  test("a brand-new chat saves its score under the id it learns after the first turn", async () => {
    render(<GenerateWorkspace initialConversations={conversations()} />);
    expect(getQuizAttemptSummaries).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "simulate conversation known" }));
    fireEvent.click(screen.getByRole("button", { name: "simulate quiz" }));
    const resources = finishQuizInResources();

    await waitFor(() => expect(saveQuizAttempt).toHaveBeenCalledTimes(1));
    expect(saveQuizAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-new",
        quizId: "quiz-multi",
        mode: "full",
        correctCount: 3,
        totalCount: 3,
      }),
    );
    // Reflected immediately, without waiting on a refetch.
    expect(within(resources).getByText("3 questions · Best 3/3")).toBeInTheDocument();
  });
});

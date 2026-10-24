import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ConversationSummary } from "@/lib/supabase/conversations";

vi.mock("@/lib/supabase/conversation-actions", () => ({
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

import { deleteConversation, renameConversation } from "@/lib/supabase/conversation-actions";
import {
  readActiveConversationId,
  writeActiveConversationId,
} from "@/app/generate/activeConversationStorage";
import HistoryClient from "../HistoryClient";

function conversations(): ConversationSummary[] {
  const now = new Date().toISOString();
  return [
    { id: "conv-1", title: "Explain osmosis", updatedAt: now },
    { id: "conv-2", title: "Quiz me on recursion", updatedAt: now },
    { id: "conv-3", title: "Cell biology revision", updatedAt: now },
  ];
}

function rows() {
  return within(screen.getByRole("list", { name: "Study sessions" })).getAllByRole("listitem");
}

function rowFor(title: string) {
  const row = rows().find((item) => item.textContent?.includes(title));
  if (!row) throw new Error(`No row for ${title}`);
  return row;
}

beforeEach(() => {
  vi.mocked(renameConversation).mockReset();
  vi.mocked(deleteConversation).mockReset();
  sessionStorage.clear();
});

describe("HistoryClient — search", () => {
  test("filters conversations by title, case-insensitively", () => {
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search conversations" }), {
      target: { value: "  OSMOSIS " },
    });

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("Explain osmosis");
  });

  test("says so when nothing matches, and clearing the search brings everything back", () => {
    render(<HistoryClient conversations={conversations()} />);
    const search = screen.getByRole("searchbox", { name: "Search conversations" });

    fireEvent.change(search, { target: { value: "thermodynamics" } });
    expect(screen.getByRole("status")).toHaveTextContent("No conversations match “thermodynamics”.");
    expect(screen.queryByRole("list", { name: "Study sessions" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    expect(rows()).toHaveLength(3);
  });

  test("no search box on the empty state", () => {
    render(<HistoryClient conversations={[]} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});

describe("HistoryClient — rename", () => {
  test("each row's actions are described by that row's title", () => {
    render(<HistoryClient conversations={conversations()} />);

    const rename = within(rowFor("Explain osmosis")).getByRole("button", {
      name: "Rename conversation",
    });
    expect(rename).toHaveAccessibleDescription("Explain osmosis");
  });

  test("saves a new title in place, without leaving the page", async () => {
    vi.mocked(renameConversation).mockResolvedValue({ ok: true });
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Rename conversation" }),
    );
    const input = screen.getByRole("textbox", { name: "Conversation title" });
    expect(input).toHaveValue("Explain osmosis");
    fireEvent.change(input, { target: { value: "  Osmosis   notes " } });
    fireEvent.submit(input);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Osmosis notes/ })).toHaveAttribute(
        "href",
        "/generate?conversationId=conv-1",
      ),
    );
    expect(renameConversation).toHaveBeenCalledWith("conv-1", "  Osmosis   notes ");
    expect(screen.queryByRole("textbox", { name: "Conversation title" })).not.toBeInTheDocument();
  });

  test("an empty title is rejected before any request is made", () => {
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Rename conversation" }),
    );
    const input = screen.getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(input);

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a title.");
    expect(renameConversation).not.toHaveBeenCalled();
  });

  test("a failed save keeps the form open with the error, and the old title stays", async () => {
    vi.mocked(renameConversation).mockResolvedValue({ ok: false });
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Rename conversation" }),
    );
    const input = screen.getByRole("textbox", { name: "Conversation title" });
    fireEvent.change(input, { target: { value: "Something else" } });
    fireEvent.submit(input);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't rename this conversation. Please try again.",
    );
    expect(input).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("link", { name: /Explain osmosis/ })).toBeInTheDocument();
  });
});

describe("HistoryClient — delete", () => {
  test("asks for confirmation, then removes the conversation", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: true });
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Delete this conversation?" });
    expect(dialog).toHaveTextContent('"Explain osmosis"');
    expect(deleteConversation).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(rows()).toHaveLength(2));
    expect(deleteConversation).toHaveBeenCalledWith("conv-1");
    expect(screen.queryByText("Explain osmosis")).not.toBeInTheDocument();
  });

  test("Cancel leaves everything alone", () => {
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteConversation).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(3);
  });

  test("a failed delete keeps the row and shows an error", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: false });
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't delete this conversation. Please try again.",
    );
    expect(rows()).toHaveLength(3);
  });

  test("deleting Generate's last-active conversation clears it, so Generate doesn't try to restore it", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: true });
    writeActiveConversationId("conv-1");
    render(<HistoryClient conversations={conversations()} />);

    fireEvent.click(
      within(rowFor("Explain osmosis")).getByRole("button", { name: "Delete conversation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(readActiveConversationId()).toBeNull());
  });

  test("deleting the last conversation shows the empty state", async () => {
    vi.mocked(deleteConversation).mockResolvedValue({ ok: true });
    render(<HistoryClient conversations={[conversations()[0]]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete conversation" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("No study sessions yet")).toBeInTheDocument();
  });
});

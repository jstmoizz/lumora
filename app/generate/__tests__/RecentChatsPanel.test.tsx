import { describe, test, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import RecentChatsPanel from "../RecentChatsPanel";
import type { ConversationSummary } from "@/lib/supabase/conversations";

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

describe("RecentChatsPanel empty state", () => {
  test("shows a clean empty state when there are no conversations yet", () => {
    render(
      <RecentChatsPanel
        conversations={[]}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Your conversations will show up here."),
    ).toBeInTheDocument();
    // New Chat is still available even with nothing to show yet.
    expect(screen.getByRole("button", { name: "New Chat" })).toBeInTheDocument();
  });
});

describe("RecentChatsPanel with conversations", () => {
  test("renders each conversation as a keyboard-reachable button, in the given order", () => {
    render(
      <RecentChatsPanel
        conversations={[
          conversation({ id: "conv-1", title: "Explain osmosis" }),
          conversation({ id: "conv-2", title: "Quiz me on cell biology" }),
        ]}
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole("button").filter(
      (button) => button.textContent !== "New Chat",
    );
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent("Explain osmosis");
    expect(buttons[1]).toHaveTextContent("Quiz me on cell biology");
  });

  test("clicking a conversation calls onSelect with its id", () => {
    const onSelect = vi.fn();
    render(
      <RecentChatsPanel
        conversations={[conversation({ id: "conv-1", title: "Explain osmosis" })]}
        onSelect={onSelect}
        onNewChat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Explain osmosis/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  test("clicking New Chat calls onNewChat", () => {
    const onNewChat = vi.fn();
    render(
      <RecentChatsPanel
        conversations={[conversation()]}
        onSelect={vi.fn()}
        onNewChat={onNewChat}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Chat" }));

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  test("marks the active conversation via aria-current, and no other row", () => {
    render(
      <RecentChatsPanel
        conversations={[
          conversation({ id: "conv-1", title: "Explain osmosis" }),
          conversation({ id: "conv-2", title: "Quiz me on cell biology" }),
        ]}
        activeConversationId="conv-2"
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Quiz me on cell biology/ }),
    ).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("button", { name: /Explain osmosis/ }),
    ).not.toHaveAttribute("aria-current");
  });

  test("disables only the row currently being loaded", () => {
    render(
      <RecentChatsPanel
        conversations={[
          conversation({ id: "conv-1", title: "Explain osmosis" }),
          conversation({ id: "conv-2", title: "Quiz me on cell biology" }),
        ]}
        loadingConversationId="conv-2"
        onSelect={vi.fn()}
        onNewChat={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Explain osmosis/ }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /Quiz me on cell biology/ }),
    ).toBeDisabled();
  });
});

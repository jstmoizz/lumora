import { describe, expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import HistoryClient from "../HistoryClient";

describe("HistoryClient", () => {
  test("shows the empty state and Start studying CTA when there are no conversations", () => {
    render(<HistoryClient conversations={[]} />);

    expect(screen.getByText("No study sessions yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Start studying" }),
    ).toHaveAttribute("href", "/generate");
    expect(screen.queryByRole("list", { name: "Study sessions" })).not.toBeInTheDocument();
  });

  test("lists conversations, most-recently-updated first as given, each linking to its own chat", () => {
    render(
      <HistoryClient
        conversations={[
          { id: "conv-1", title: "Explain osmosis", updatedAt: new Date().toISOString() },
          { id: "conv-2", title: "Quiz me on recursion", updatedAt: new Date().toISOString() },
        ]}
      />,
    );

    expect(screen.queryByText("No study sessions yet")).not.toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Study sessions" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(
      within(items[0]).getByRole("link", { name: /Explain osmosis/ }),
    ).toHaveAttribute("href", "/generate?conversationId=conv-1");
    expect(
      within(items[1]).getByRole("link", { name: /Quiz me on recursion/ }),
    ).toHaveAttribute("href", "/generate?conversationId=conv-2");
  });

  test("renders a relative last-updated time for each conversation", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    render(
      <HistoryClient
        conversations={[{ id: "conv-1", title: "Explain osmosis", updatedAt: oneHourAgo }]}
      />,
    );

    expect(screen.getByText("1 hour ago")).toBeInTheDocument();
  });
});

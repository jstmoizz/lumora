import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExploreClient from "../ExploreClient";
import { KNOWLEDGE_NODES } from "../data";

// jsdom has no WebGL, so `hasWebGL()` always resolves false in this
// environment — ExploreClient always lands on StaticFallback here, which is
// exactly the branch these tests exercise. The 3D Scene itself is verified
// manually and in e2e (real Chromium has WebGL); it isn't render-tested here
// since jsdom can't execute it and CSS-class/Three.js-internal assertions
// would be brittle.
describe("ExploreClient", () => {
  test("renders every knowledge topic as an accessible, selectable button", () => {
    render(<ExploreClient />);
    for (const node of KNOWLEDGE_NODES) {
      expect(
        screen.getAllByRole("button", { name: node.label }).length,
      ).toBeGreaterThan(0);
    }
  });

  test("selecting a topic opens the topic panel with its content", () => {
    render(<ExploreClient />);
    const node = KNOWLEDGE_NODES[0];

    const [trigger] = screen.getAllByRole("button", { name: node.label });
    fireEvent.click(trigger);

    expect(screen.getByRole("heading", { name: node.label })).toBeInTheDocument();
    expect(screen.getByText(node.summary)).toBeInTheDocument();
  });

  test("selecting a different topic updates the panel", () => {
    render(<ExploreClient />);
    const [first, second] = KNOWLEDGE_NODES;

    fireEvent.click(screen.getAllByRole("button", { name: first.label })[0]);
    expect(screen.getByRole("heading", { name: first.label })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: second.label })[0]);
    expect(screen.getByRole("heading", { name: second.label })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: first.label }),
    ).not.toBeInTheDocument();
  });

  test("Back to overview clears the selection", () => {
    render(<ExploreClient />);
    const node = KNOWLEDGE_NODES[0];

    fireEvent.click(screen.getAllByRole("button", { name: node.label })[0]);
    expect(screen.getByRole("heading", { name: node.label })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(
      screen.queryByRole("heading", { name: node.label }),
    ).not.toBeInTheDocument();
  });

  test("topic controls reflect the current selection via aria-pressed", () => {
    render(<ExploreClient />);
    const node = KNOWLEDGE_NODES[0];

    const [trigger] = screen.getAllByRole("button", { name: node.label });
    expect(trigger).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(trigger);
    const [selected] = screen.getAllByRole("button", { name: node.label });
    expect(selected).toHaveAttribute("aria-pressed", "true");
  });
});

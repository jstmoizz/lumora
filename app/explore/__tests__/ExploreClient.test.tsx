import { beforeEach, describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExploreClient from "../ExploreClient";
import { KNOWLEDGE_NODES } from "../data";

vi.mock("@/lib/supabase/topic-progress-actions", () => ({
  recordTopicStudied: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { recordTopicStudied } from "@/lib/supabase/topic-progress-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// jsdom has no WebGL, so `hasWebGL()` always resolves false in this
// environment — ExploreClient always lands on StaticFallback here, which is
// exactly the branch these tests exercise. The 3D Scene itself is verified
// manually and in e2e (real Chromium has WebGL); it isn't render-tested here
// since jsdom can't execute it and CSS-class/Three.js-internal assertions
// would be brittle.
describe("ExploreClient", () => {
  test("renders every knowledge topic as an accessible, selectable button", () => {
    render(<ExploreClient progress={{}} />);
    for (const node of KNOWLEDGE_NODES) {
      expect(
        screen.getAllByRole("button", { name: node.label }).length,
      ).toBeGreaterThan(0);
    }
  });

  test("selecting a topic opens the topic panel with its content", () => {
    render(<ExploreClient progress={{}} />);
    const node = KNOWLEDGE_NODES[0];

    const [trigger] = screen.getAllByRole("button", { name: node.label });
    fireEvent.click(trigger);

    expect(screen.getByRole("heading", { name: node.label })).toBeInTheDocument();
    expect(screen.getByText(node.summary)).toBeInTheDocument();
  });

  test("selecting a different topic updates the panel", () => {
    render(<ExploreClient progress={{}} />);
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
    render(<ExploreClient progress={{}} />);
    const node = KNOWLEDGE_NODES[0];

    fireEvent.click(screen.getAllByRole("button", { name: node.label })[0]);
    expect(screen.getByRole("heading", { name: node.label })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
    expect(
      screen.queryByRole("heading", { name: node.label }),
    ).not.toBeInTheDocument();
  });

  test("topic controls reflect the current selection via aria-pressed", () => {
    render(<ExploreClient progress={{}} />);
    const node = KNOWLEDGE_NODES[0];

    const [trigger] = screen.getAllByRole("button", { name: node.label });
    expect(trigger).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(trigger);
    const [selected] = screen.getAllByRole("button", { name: node.label });
    expect(selected).toHaveAttribute("aria-pressed", "true");
  });

  describe("topic progress recording", () => {
    test("selecting a topic records it as studied exactly once", () => {
      render(<ExploreClient progress={{}} />);
      const node = KNOWLEDGE_NODES[0];

      fireEvent.click(screen.getAllByRole("button", { name: node.label })[0]);

      expect(recordTopicStudied).toHaveBeenCalledTimes(1);
      expect(recordTopicStudied).toHaveBeenCalledWith(node.id);
    });

    test("re-clicking the already-selected topic does not record it again", () => {
      render(<ExploreClient progress={{}} />);
      const node = KNOWLEDGE_NODES[0];

      const [trigger] = screen.getAllByRole("button", { name: node.label });
      fireEvent.click(trigger);
      fireEvent.click(trigger);
      fireEvent.click(trigger);

      expect(recordTopicStudied).toHaveBeenCalledTimes(1);
    });

    test("selecting a different topic records the new one too", () => {
      render(<ExploreClient progress={{}} />);
      const [first, second] = KNOWLEDGE_NODES;

      fireEvent.click(screen.getAllByRole("button", { name: first.label })[0]);
      fireEvent.click(screen.getAllByRole("button", { name: second.label })[0]);

      expect(recordTopicStudied).toHaveBeenCalledTimes(2);
      expect(recordTopicStudied).toHaveBeenNthCalledWith(1, first.id);
      expect(recordTopicStudied).toHaveBeenNthCalledWith(2, second.id);
    });

    test("selecting the same topic again after going back to overview records it again", () => {
      render(<ExploreClient progress={{}} />);
      const node = KNOWLEDGE_NODES[0];

      const [trigger] = screen.getAllByRole("button", { name: node.label });
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));
      fireEvent.click(
        screen.getAllByRole("button", { name: node.label })[0],
      );

      expect(recordTopicStudied).toHaveBeenCalledTimes(2);
    });

    test("a failed progress write does not break topic selection", async () => {
      vi.mocked(recordTopicStudied).mockRejectedValueOnce(
        new Error("network error"),
      );
      render(<ExploreClient progress={{}} />);
      const node = KNOWLEDGE_NODES[0];

      fireEvent.click(screen.getAllByRole("button", { name: node.label })[0]);

      expect(
        screen.getByRole("heading", { name: node.label }),
      ).toBeInTheDocument();
    });
  });
});

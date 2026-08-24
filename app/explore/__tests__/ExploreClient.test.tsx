import { beforeEach, describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ExploreClient from "../ExploreClient";
import type { KnowledgeGraphNode } from "../data";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/knowledge-graph-actions", () => ({
  deleteKnowledgeNode: vi.fn(() => Promise.resolve({ ok: true })),
  resetKnowledgeGraph: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { deleteKnowledgeNode, resetKnowledgeGraph } from "@/lib/supabase/knowledge-graph-actions";

function node(overrides: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "ml",
    topicKey: "machine learning",
    label: "Machine Learning",
    summary: "Systems that learn from data.",
    parentId: null,
    relatedLabels: [],
    activityCount: 1,
    quizCount: 1,
    flashcardCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    lastStudiedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// jsdom has no WebGL, so `hasWebGL()` always resolves false in this
// environment — ExploreClient always lands on StaticFallback here, which is
// exactly the branch these tests exercise. The 3D Scene itself is verified
// manually and in e2e (real Chromium has WebGL); it isn't render-tested here
// since jsdom can't execute it and CSS-class/Three.js-internal assertions
// would be brittle.
//
// jsdom also doesn't evaluate Tailwind's responsive `hidden`/`md:flex`
// classes as real layout — both the desktop Topics list (OptionWheel,
// role="option" items) and the mobile chip row (role="button" items) render
// into the DOM simultaneously in every test here, for the same topic list.
// Tests pick whichever role fits what they're asserting.
describe("ExploreClient — new user", () => {
  test("shows only the empty-state message, no topic buttons", () => {
    render(<ExploreClient nodes={[]} />);

    expect(screen.getByText("Your knowledge graph starts here.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Machine Learning" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Machine Learning" })).not.toBeInTheDocument();
  });

  test("still shows Knowledge Level 1 · Curious", () => {
    render(<ExploreClient nodes={[]} />);
    expect(screen.getByText(/Knowledge Level 1 · Curious/)).toBeInTheDocument();
  });

  test("does not show Reset Knowledge Graph when there's nothing to reset", () => {
    render(<ExploreClient nodes={[]} />);
    expect(screen.queryByRole("button", { name: "Reset Knowledge Graph" })).not.toBeInTheDocument();
  });
});

describe("ExploreClient — the topic list", () => {
  test("a studied topic appears in the Topics list, both as a listbox option and a mobile chip", () => {
    render(<ExploreClient nodes={[node()]} />);

    expect(screen.getByRole("option", { name: "Machine Learning" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Machine Learning" }).length).toBeGreaterThan(0);
  });

  test("selecting a studied topic (via its mobile chip) opens the topic panel with its content", () => {
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);

    expect(screen.getByRole("heading", { name: "Machine Learning" })).toBeInTheDocument();
    expect(screen.getByText("Systems that learn from data.")).toBeInTheDocument();
    expect(screen.getByText(/1 study session/)).toBeInTheDocument();
  });

  test("selecting a studied topic via its Topics-list option opens the same panel", () => {
    // Two nodes, not one: OptionWheel starts centered on index 0 and only
    // fires onChange when the selection actually moves to a different index
    // — clicking the sole/already-centered item is a no-op by design (see
    // OptionWheel.test.tsx's own "does not re-fire" case).
    const nodes = [node(), node({ id: "la", topicKey: "linear algebra", label: "Linear Algebra" })];
    render(<ExploreClient nodes={nodes} />);

    fireEvent.click(screen.getByRole("option", { name: "Linear Algebra" }));

    expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Topic" })).toBeInTheDocument();
  });

  test("selecting a different topic updates the panel", () => {
    const nodes = [node(), node({ id: "la", topicKey: "linear algebra", label: "Linear Algebra" })];
    render(<ExploreClient nodes={nodes} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    expect(screen.getByRole("heading", { name: "Machine Learning" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Linear Algebra" })[0]);
    expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Machine Learning" })).not.toBeInTheDocument();
  });

  test("Back to overview clears the selection", () => {
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));

    expect(screen.queryByRole("heading", { name: "Machine Learning" })).not.toBeInTheDocument();
  });

  test("the mobile chip for the selected topic reflects it via aria-pressed", () => {
    render(<ExploreClient nodes={[node()]} />);

    const [trigger] = screen.getAllByRole("button", { name: "Machine Learning" });
    expect(trigger).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(trigger);
    const [selected] = screen.getAllByRole("button", { name: "Machine Learning" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
  });

  test("a topic that's only an unlocked (not-yet-studied) suggestion does NOT appear in the Topics list", () => {
    // The list is scoped to real graph nodes only — a related label the
    // model named but the user hasn't studied yet must not show up here,
    // even though it does surface via the selected node's own Related pills
    // (covered below).
    const nodes = [node({ relatedLabels: ["Neural Networks"] })];
    render(<ExploreClient nodes={nodes} />);

    expect(screen.queryByRole("option", { name: "Neural Networks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Neural Networks" })).not.toBeInTheDocument();
  });

  test("selecting an unlocked related label from the panel's Related pills previews it with a Study button, not a delete button", () => {
    const nodes = [node({ relatedLabels: ["Neural Networks"] })];
    render(<ExploreClient nodes={nodes} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    const panel = screen.getByRole("region");
    fireEvent.click(within(panel).getByRole("button", { name: "Neural Networks" }));

    expect(screen.getByRole("heading", { name: "Neural Networks" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Study this topic/ })).toHaveAttribute(
      "href",
      "/generate?topic=Neural%20Networks",
    );
    expect(screen.queryByRole("button", { name: "Delete Topic" })).not.toBeInTheDocument();
  });

  test("a related label that's already a node appears only once in the list, not duplicated", () => {
    const nodes = [
      node({ relatedLabels: ["Linear Algebra"] }),
      node({ id: "la", topicKey: "linear algebra", label: "Linear Algebra" }),
    ];
    render(<ExploreClient nodes={nodes} />);

    expect(screen.getAllByRole("option", { name: "Linear Algebra" })).toHaveLength(1);
  });

  test("TopicPanel's related list resolves an already-studied related label to its real node, not a preview", () => {
    const nodes = [
      node({ relatedLabels: ["Linear Algebra"] }),
      node({
        id: "la",
        topicKey: "linear algebra",
        label: "Linear Algebra",
        summary: "The study of vectors and matrices.",
      }),
    ];
    render(<ExploreClient nodes={nodes} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    const panel = screen.getByRole("region");
    fireEvent.click(within(panel).getByRole("button", { name: "Linear Algebra" }));

    expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();
    expect(screen.getByText("The study of vectors and matrices.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Topic" })).toBeInTheDocument();
  });

  test("a studied child topic appears in the Topics list alongside its parent, flat", () => {
    const nodes = [
      node(),
      node({
        id: "nn",
        topicKey: "neural networks",
        label: "Neural Networks",
        parentId: "ml",
      }),
    ];
    render(<ExploreClient nodes={nodes} />);

    expect(screen.getByRole("option", { name: "Machine Learning" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Neural Networks" })).toBeInTheDocument();
  });
});

describe("ExploreClient — delete", () => {
  test("deleting a node requires confirmation before it's removed", async () => {
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));

    expect(deleteKnowledgeNode).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteKnowledgeNode).toHaveBeenCalledWith("ml");
  });

  test("cancelling the confirmation does not delete anything", () => {
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteKnowledgeNode).not.toHaveBeenCalled();
  });
});

describe("ExploreClient — reset", () => {
  test("resetting the graph requires confirmation", () => {
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset Knowledge Graph" }));
    expect(resetKnowledgeGraph).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Reset Graph" }));
    expect(resetKnowledgeGraph).toHaveBeenCalled();
  });
});

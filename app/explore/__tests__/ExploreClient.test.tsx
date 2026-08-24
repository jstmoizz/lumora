import { beforeEach, describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
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

// Lets a test hold a mutation "in flight" (unresolved) across two rapid
// Confirm clicks, then resolve it on demand — needed to actually exercise
// the M7 double-confirm race rather than the mutation settling before the
// second click can even fire.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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

// `lastTriggerRef`/`handleBack` (see the existing "normal Back... still
// focuses the original trigger" and delete-focus tests below) were already
// correct for the mobile chip row and TopicPanel's own Related buttons —
// both already passed `event.currentTarget` through `onSelect`. These two
// cases cover the paths that didn't: the desktop OptionWheel (whose
// `onChange` used to only report an index/label, no element) and a 3D
// KnowledgeNode's own floating label (whose `onClick` used to call
// `onSelect(node.id)` with no trigger at all).
describe("ExploreClient — keyboard focus restoration (H5)", () => {
  test("selecting a topic through the desktop Topics wheel restores focus to the wheel after Back", () => {
    // Two nodes, not one: OptionWheel starts centered on index 0 and only
    // fires onChange when the selection actually moves to a different index.
    const nodes = [node(), node({ id: "la", topicKey: "linear algebra", label: "Linear Algebra" })];
    render(<ExploreClient nodes={nodes} />);

    fireEvent.click(screen.getByRole("option", { name: "Linear Algebra" }));
    expect(screen.getByRole("heading", { name: "Linear Algebra" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));

    // The wheel's root listbox — not the individual (non-tabbable)
    // `role="option"` row — is the real, focusable element OptionWheel's
    // roving-focus model actually exposes; see OptionWheel.test.tsx for
    // direct coverage of that contract.
    expect(screen.getByRole("listbox", { name: "Topics" })).toHaveFocus();
  });

  // jsdom has no WebGL, so the real 3D <Scene>/<KnowledgeNode> never renders
  // through ExploreClient here (see this file's own top-of-file comment) —
  // StaticFallback is what actually renders in its place, and its overlay
  // buttons share the exact same contract KnowledgeNode's floating label now
  // does: `tabIndex={-1}` + `aria-hidden="true"` (H6), while still passing
  // `event.currentTarget` as the selection trigger (H5). This test proves
  // that combination round-trips correctly at the ExploreClient/focus-
  // management level; KnowledgeNode.test.tsx separately proves the real 3D
  // label itself has that same wiring.
  test("selecting a topic through its 3D-space overlay control restores focus to that control after Back", () => {
    render(<ExploreClient nodes={[node()]} />);

    const graphRegion = screen.getByLabelText(
      "Interactive 3D knowledge space. Use the topic list for keyboard access.",
    );
    // Scoped to the graph region, and queried with `hidden: true` and no
    // `name` filter: an aria-hidden element has no computable accessible
    // name at all (by spec — that's the whole point of H6, it's no longer a
    // normal, discoverable tab stop), so `hidden: true` is what's needed to
    // find it here at all. With a single node rendered, this is the only
    // button in the graph region.
    const trigger = within(graphRegion).getByRole("button", { hidden: true });
    expect(trigger).toHaveTextContent("Machine Learning");

    fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "Machine Learning" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));

    // tabIndex={-1} only removes an element from the natural Tab sequence —
    // it doesn't stop `.focus()` (programmatic or, as here, restored via
    // `lastTriggerRef.current?.focus()`) from landing on it.
    expect(trigger).toHaveFocus();
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

  test("a failed delete surfaces an accessible error and leaves the node selected, without refreshing", async () => {
    vi.mocked(deleteKnowledgeNode).mockResolvedValueOnce({ ok: false });
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't delete this topic. Please try again.",
    );
    // The panel is still showing the node the failed delete targeted —
    // selection was not cleared as though the delete had succeeded.
    expect(screen.getByRole("heading", { name: "Machine Learning" })).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("retrying after a failed delete calls deleteKnowledgeNode again", async () => {
    vi.mocked(deleteKnowledgeNode).mockResolvedValueOnce({ ok: false });
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await screen.findByRole("alert");

    // The node is still selected (see the test above), so Delete Topic is
    // still right there — this is the "retry naturally" path.
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    expect(deleteKnowledgeNode).toHaveBeenCalledTimes(2);
  });

  // M7: closes the window where two Confirm clicks land before React has
  // committed any re-render at all (not just before the visible disabled
  // style paints). A plain pair of sequential `fireEvent.click()` calls
  // doesn't reproduce this: each is independently flushed via its own
  // `act()`, and by the second call the dialog has already closed and
  // unmounted the button (confirmed via a throwaway diagnostic — the
  // button's `isConnected` was already `false`), so it would "pass" even
  // with no guard at all. Wrapping both clicks in one outer `act()` batches
  // them together with no commit in between, which is what actually
  // exercises the race — and does reproduce two calls without the
  // `isDeletingRef` guard in ExploreClient.tsx (verified the same way).
  test("rapid double-confirm on delete triggers exactly one mutation call", async () => {
    const { promise, resolve } = deferred<{ ok: boolean }>();
    vi.mocked(deleteKnowledgeNode).mockReturnValueOnce(promise);
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    const confirmButton = within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" });

    act(() => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
    });

    expect(deleteKnowledgeNode).toHaveBeenCalledTimes(1);

    resolve({ ok: true });
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(deleteKnowledgeNode).toHaveBeenCalledTimes(1);
  });

  test("a successful delete of the selected node still refreshes, and closes the panel", async () => {
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Machine Learning" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("heading", { name: "Machine Learning" }),
    ).not.toBeInTheDocument();
  });

  test("a successful delete of the selected node moves focus to the stable graph region, not the (now-gone) trigger", async () => {
    render(<ExploreClient nodes={[node()]} />);

    const trigger = screen.getAllByRole("button", { name: "Machine Learning" })[0];
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Delete Topic" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );

    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));

    // The trigger that opened the panel must not be left holding focus —
    // in the real app, `router.refresh()` removes it from the DOM entirely.
    expect(trigger).not.toHaveFocus();
    expect(
      screen.getByLabelText(
        "Interactive 3D knowledge space. Use the topic list for keyboard access.",
      ),
    ).toHaveFocus();
  });

  test("a normal Back (no deletion) still focuses the original trigger, not the graph region", () => {
    render(<ExploreClient nodes={[node()]} />);

    const trigger = screen.getAllByRole("button", { name: "Machine Learning" })[0];
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Back to overview" }));

    expect(trigger).toHaveFocus();
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

  // M7: same guard, and same "why a plain pair of fireEvent.click() calls
  // doesn't prove anything" reasoning, as delete's rapid-double-confirm test
  // above — applied to ResetGraphControl's own separate mutation/pending
  // state (`isResettingRef`).
  test("rapid double-confirm on reset triggers exactly one mutation call", async () => {
    const { promise, resolve } = deferred<{ ok: boolean }>();
    vi.mocked(resetKnowledgeGraph).mockReturnValueOnce(promise);
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset Knowledge Graph" }));
    const confirmButton = screen.getByRole("button", { name: "Reset Graph" });

    act(() => {
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);
    });

    expect(resetKnowledgeGraph).toHaveBeenCalledTimes(1);

    resolve({ ok: true });
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(resetKnowledgeGraph).toHaveBeenCalledTimes(1);
  });

  test("a failed reset surfaces an accessible error and does not refresh, leaving the graph as-is", async () => {
    vi.mocked(resetKnowledgeGraph).mockResolvedValueOnce({ ok: false });
    render(<ExploreClient nodes={[node()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset Knowledge Graph" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset Graph" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't reset your knowledge graph. Please try again.",
    );
    // The graph wasn't actually reset server-side, so nothing should act as
    // though it was — no refresh, and the (still-nonexistent, in this
    // mocked world) node is untouched either way.
    expect(refreshMock).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "Machine Learning" })).toBeInTheDocument();
  });
});

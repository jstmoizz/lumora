import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import KnowledgeNode from "../KnowledgeNode";
import type { KnowledgeGraphNode } from "../../data";

// jsdom has no WebGL, so the real 3D <Scene> (and, in turn, KnowledgeNode)
// is never render-tested through ExploreClient — see that test file's own
// top-of-file comment. Rendering KnowledgeNode directly here still isn't
// possible against a real R3F/WebGL canvas, but its two hooks into
// react-three-fiber/drei are narrow enough to stub out precisely: `useFrame`
// only drives imperative per-frame mesh transforms (irrelevant to what's
// being asserted here), and `Html` is a portal wrapper whose children are
// plain DOM — replacing it with a passthrough renders the actual button
// this component produces, with no reimplementation of KnowledgeNode itself.
vi.mock("@react-three/fiber", () => ({
  useFrame: () => {},
}));
vi.mock("@react-three/drei", () => ({
  Html: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

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

function renderNode(onSelect = vi.fn()) {
  render(
    <KnowledgeNode
      node={node()}
      position={[0, 0, 0]}
      depth={0}
      accent="indigo"
      isSelected={false}
      isRelated={false}
      isDimmed={false}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

// The Topics list (OptionWheel on desktop, a chip row on mobile) renders
// this exact same set of topics as real, accessible controls — matching
// StaticFallback's already-established treatment of its own duplicate
// overlay buttons (see StaticFallback.tsx's own comment for the full
// rationale).
describe("KnowledgeNode — floating label accessibility (H6)", () => {
  test("the label is excluded from the tab order and hidden from the accessibility tree", () => {
    renderNode();

    const label = screen.getByText("Machine Learning");
    expect(label.tagName).toBe("BUTTON");
    expect(label).toHaveAttribute("tabindex", "-1");
    expect(label).toHaveAttribute("aria-hidden", "true");
  });

  test("a hidden label is not reachable via an accessible role query, mirroring StaticFallback's overlay buttons", () => {
    renderNode();

    // getByRole excludes aria-hidden elements by default (an aria-hidden
    // node has no computable accessible name at all, by spec) — this is the
    // actual mechanism by which the label stops duplicating the Topics
    // list's tab stops for keyboard/screen-reader users.
    expect(
      screen.queryByRole("button", { name: "Machine Learning" }),
    ).not.toBeInTheDocument();
    // It's still genuinely present in the DOM (confirmed via plain text, not
    // a role query, since an aria-hidden element's role/name are themselves
    // suppressed) — only excluded from the accessibility tree, not removed.
    expect(screen.getByText("Machine Learning")).toBeInTheDocument();
  });
});

describe("KnowledgeNode — floating label selection (H5)", () => {
  test("clicking the label calls onSelect with the node id and the label element itself as the trigger", () => {
    const onSelect = renderNode();

    const label = screen.getByText("Machine Learning");
    fireEvent.click(label);

    expect(onSelect).toHaveBeenCalledWith("ml", label);
  });

  test("tabIndex={-1} does not prevent the label from still being a valid programmatic focus target", () => {
    renderNode();

    const label = screen.getByText("Machine Learning");
    label.focus();

    expect(label).toHaveFocus();
  });
});

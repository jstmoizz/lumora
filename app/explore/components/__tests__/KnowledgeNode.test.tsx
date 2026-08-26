import { describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { Vector3 } from "three";
import KnowledgeNode from "../KnowledgeNode";
import type { KnowledgeGraphNode } from "../../data";

// jsdom can't render a real R3F/WebGL canvas, so useFrame/useThree are
// stubbed and Html is replaced with a passthrough — this renders the actual
// button KnowledgeNode produces without reimplementing the component.
vi.mock("@react-three/fiber", () => ({
  useFrame: () => {},
  // Minimal stand-in so drag-handling code's camera/controls lookups don't
  // throw — no test here exercises pointer-drag, only the Html label click.
  useThree: (selector: (state: { camera: { getWorldDirection: () => void }; controls: null }) => unknown) =>
    selector({ camera: { getWorldDirection: () => {} }, controls: null }),
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
      onDragEnd={vi.fn()}
      livePositions={{ current: new Map<string, Vector3>() }}
    />,
  );
  return onSelect;
}

// The Topics list already renders this same set of topics as real,
// accessible controls, so the overlay label is deliberately hidden from
// the accessibility tree (matching StaticFallback's own overlay buttons).
describe("KnowledgeNode — floating label accessibility", () => {
  test("the label is excluded from the tab order and hidden from the accessibility tree", () => {
    renderNode();

    const label = screen.getByText("Machine Learning");
    expect(label.tagName).toBe("BUTTON");
    expect(label).toHaveAttribute("tabindex", "-1");
    expect(label).toHaveAttribute("aria-hidden", "true");
  });

  test("a hidden label is not reachable via an accessible role query, mirroring StaticFallback's overlay buttons", () => {
    renderNode();

    // aria-hidden elements are excluded from role queries by default.
    expect(
      screen.queryByRole("button", { name: "Machine Learning" }),
    ).not.toBeInTheDocument();
    // Still genuinely in the DOM — only hidden from the accessibility tree.
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

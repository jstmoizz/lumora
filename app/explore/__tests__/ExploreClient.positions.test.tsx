import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KnowledgeGraphNode } from "../data";

// Separate file so these mocks (WebGL forced on, Scene stubbed) don't leak
// into ExploreClient.test.tsx's suite, which relies on real WebGL-less jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/knowledge-graph-actions", () => ({
  deleteKnowledgeNode: vi.fn(() => Promise.resolve({ ok: true })),
  resetKnowledgeGraph: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("../webgl", () => ({
  useWebglSupported: () => true,
}));

// vitest.setup.ts stubs matchMedia to report reduced-motion "on" globally,
// which would otherwise force showScene false regardless of the WebGL mock.
vi.mock("../useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

// jsdom can't execute a real R3F Canvas — stub Scene with a component that
// surfaces exactly the props under test.
vi.mock("../components/Scene", () => ({
  default: (props: { initialPositions: Record<string, [number, number, number]> }) => (
    <div data-testid="scene-stub">{JSON.stringify(props.initialPositions)}</div>
  ),
}));

import ExploreClient from "../ExploreClient";

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

describe("ExploreClient — hydrated positions reach Scene", () => {
  test("forwards the server-hydrated positions prop to Scene as initialPositions", async () => {
    const positions = { ml: [1.2, 0.4, -2.1] as [number, number, number] };
    render(<ExploreClient nodes={[node()]} positions={positions} />);

    const stub = await screen.findByTestId("scene-stub");
    expect(JSON.parse(stub.textContent!)).toEqual(positions);
  });

  test("defaults to an empty positions map when the prop is omitted", async () => {
    render(<ExploreClient nodes={[node()]} />);

    const stub = await screen.findByTestId("scene-stub");
    expect(JSON.parse(stub.textContent!)).toEqual({});
  });
});

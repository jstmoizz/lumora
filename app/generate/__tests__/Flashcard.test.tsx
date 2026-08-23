import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Flashcard from "../Flashcard";

// vitest.setup.ts stubs matchMedia to always report matches: true, so
// prefers-reduced-motion reads as "reduce" by default in every test here.
function mockPrefersReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("Flashcard", () => {
  test("shows the question by name via the live status region, not flipped", () => {
    render(
      <Flashcard
        front="What pigment captures light?"
        back="Chlorophyll"
        flipped={false}
        onFlip={() => {}}
        position={1}
        total={3}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Flashcard 1 of 3. Question: What pigment captures light?",
    );
  });

  test("shows the answer via the live status region once flipped", () => {
    render(
      <Flashcard
        front="What pigment captures light?"
        back="Chlorophyll"
        flipped
        onFlip={() => {}}
        position={1}
        total={3}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Flashcard 1 of 3. Answer: Chlorophyll",
    );
  });

  test("clicking the card calls onFlip", () => {
    const onFlip = () => {
      called = true;
    };
    let called = false;
    render(
      <Flashcard
        front="Q"
        back="A"
        flipped={false}
        onFlip={onFlip}
        position={1}
        total={1}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Flip flashcard" }));
    expect(called).toBe(true);
  });

  test("marks the flipped-away face aria-hidden so only the visible side is exposed", () => {
    render(
      <Flashcard
        front="Q"
        back="A"
        flipped={false}
        onFlip={() => {}}
        position={1}
        total={1}
      />,
    );

    expect(screen.getByText("Q").closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "false",
    );
    expect(screen.getByText("A").closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  test("reflects aria-pressed for the flipped state", () => {
    const { rerender } = render(
      <Flashcard front="Q" back="A" flipped={false} onFlip={() => {}} position={1} total={1} />,
    );
    expect(screen.getByRole("button", { name: "Flip flashcard" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(
      <Flashcard front="Q" back="A" flipped onFlip={() => {}} position={1} total={1} />,
    );
    expect(screen.getByRole("button", { name: "Flip flashcard" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("under reduced motion, the flip loses its animated transition class", () => {
    mockPrefersReducedMotion(true);
    render(
      <Flashcard front="Q" back="A" flipped={false} onFlip={() => {}} position={1} total={1} />,
    );
    expect(screen.getByRole("button", { name: "Flip flashcard" })).toHaveClass(
      "flashcard-inner--instant",
    );
  });

  test("without reduced motion, the animated transition class is present", () => {
    mockPrefersReducedMotion(false);
    render(
      <Flashcard front="Q" back="A" flipped={false} onFlip={() => {}} position={1} total={1} />,
    );
    expect(
      screen.getByRole("button", { name: "Flip flashcard" }),
    ).not.toHaveClass("flashcard-inner--instant");
    mockPrefersReducedMotion(true);
  });
});

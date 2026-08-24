import { describe, test, expect } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import FlashcardsPanel from "../FlashcardsPanel";
import {
  emptyFlashcardSet,
  multiCardFlashcardSet,
  singleCardFlashcardSet,
} from "./fixtures";

describe("FlashcardsPanel empty state", () => {
  test("shows a calm idle message when no flashcards have been generated yet", () => {
    render(<FlashcardsPanel flashcardSets={[]} />);
    expect(screen.getByText("No flashcards yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next card" }),
    ).not.toBeInTheDocument();
  });
});

// Regression coverage for a flashcard set resumed from a persisted
// conversation whose `cards` array is empty — unreachable from live
// generation (the tool's own Zod schema requires at least one), but
// persisted data is loaded straight from the database with no
// re-validation against that schema. ActiveFlashcardSet used to index
// straight into `set.cards[0]` and crash the whole /generate route; it
// must now render a fallback instead.
describe("FlashcardsPanel — persisted set with zero cards", () => {
  test("renders an accessible fallback instead of crashing, with no card UI", () => {
    render(<FlashcardsPanel flashcardSets={[emptyFlashcardSet()]} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("These flashcards couldn't be loaded.");
    expect(alert).toHaveTextContent("Try generating them again.");

    expect(screen.queryByRole("button", { name: "Flip flashcard" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next card" })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  test("the Disclosure still labels it correctly, and a normal set alongside it is unaffected", () => {
    // The newest set (index 0 — see useAutoCollapseList) starts expanded;
    // putting the healthy one there means the broken one starts collapsed,
    // exercising the fallback via the "expand it" path rather than only on
    // first paint.
    render(
      <FlashcardsPanel flashcardSets={[singleCardFlashcardSet(), emptyFlashcardSet()]} />,
    );

    // The broken set's own header still shows its topic/card count — only
    // its *content* is replaced by the fallback.
    expect(screen.getByText("0 cards")).toBeInTheDocument();

    const collapsedTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: false,
    });
    fireEvent.click(collapsedTrigger);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "These flashcards couldn't be loaded.",
    );

    // The healthy set (the newest, already expanded) still works normally.
    expect(screen.getByRole("button", { name: "Flip flashcard" })).toBeInTheDocument();
  });
});

describe("FlashcardsPanel single set", () => {
  test("renders the first card, flips it, and shows a position indicator", () => {
    render(<FlashcardsPanel flashcardSets={[multiCardFlashcardSet()]} />);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(
      screen.getByText("What pigment captures light in photosynthesis?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Flip flashcard" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Answer: Chlorophyll/);
  });

  test("Next advances to the following card and resets the flip", () => {
    render(<FlashcardsPanel flashcardSets={[multiCardFlashcardSet()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Flip flashcard" }));
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      screen.getByText("Which gas do plants absorb for photosynthesis?"),
    ).toBeInTheDocument();
    // Advancing shows the new card's question side, not left flipped.
    expect(screen.getByRole("status")).toHaveTextContent(
      /^Flashcard 2 of 3\. Question:/,
    );
  });

  test("Previous is disabled on the first card, Next disabled on the last", () => {
    render(<FlashcardsPanel flashcardSets={[multiCardFlashcardSet()]} />);
    expect(screen.getByRole("button", { name: "Previous card" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next card" })).toBeDisabled();
  });

  test("ArrowRight/ArrowLeft navigate between cards", () => {
    render(<FlashcardsPanel flashcardSets={[multiCardFlashcardSet()]} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Flip flashcard" }), {
      key: "ArrowRight",
    });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Flip flashcard" }), {
      key: "ArrowLeft",
    });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});

describe("FlashcardsPanel multiple sets", () => {
  test("every set gets its own row, labeled by topic and card count", () => {
    render(
      <FlashcardsPanel
        flashcardSets={[multiCardFlashcardSet(), singleCardFlashcardSet()]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Photosynthesis/, expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 cards")).toBeInTheDocument();
    expect(screen.getByText("1 card")).toBeInTheDocument();
  });

  test("only the newest set starts expanded; the older one starts collapsed but keeps its own state on reopen", () => {
    render(
      <FlashcardsPanel
        flashcardSets={[multiCardFlashcardSet(), singleCardFlashcardSet()]}
      />,
    );

    // Advance the (expanded) newest set to its second card.
    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    // Collapse it.
    const newestTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: true,
    });
    fireEvent.click(newestTrigger);
    expect(newestTrigger).toHaveAttribute("aria-expanded", "false");

    // Reopen it — still on card 2, not reset back to card 1.
    fireEvent.click(newestTrigger);
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  test("expanding a collapsed set reveals it without disturbing the other set's position", () => {
    render(
      <FlashcardsPanel
        flashcardSets={[multiCardFlashcardSet(), singleCardFlashcardSet()]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next card" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    const collapsedTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: false,
    });
    fireEvent.click(collapsedTrigger);
    expect(collapsedTrigger).toHaveAttribute("aria-expanded", "true");

    const card = collapsedTrigger.closest("div");
    if (!card) throw new Error("expected the disclosure card container");
    expect(within(card).getByText("1 / 1")).toBeInTheDocument();
    // The other (still expanded) set kept its own position.
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });
});

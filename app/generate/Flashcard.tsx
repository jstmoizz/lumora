"use client";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "../components/useReducedMotion";
import "./Flashcard.css";

interface FlashcardProps {
  front: string;
  back: string;
  explanation?: string;
  flipped: boolean;
  onFlip: () => void;
  /** 1-based position, e.g. `3` for "Flashcard 3 of 10". */
  position: number;
  total: number;
}

// A single flip card — the main visual interaction Practice's Flashcards
// activity is built around. A real <button> (not a div with onClick), so
// Enter/Space flip it the same way any other control in this codebase
// works, with no dependency on hover; ArrowLeft/ArrowRight navigation is
// wired by the caller (ActiveFlashcardSet in FlashcardsPanel.tsx) via
// onKeyDown on the same interaction, not a separate hidden control.
//
// Both faces are always in the DOM — the 3D flip needs both to rotate
// between (see Flashcard.css) — but the face that's turned away is marked
// `aria-hidden` so it's never exposed to assistive tech, and a `role=
// "status"` line below (the same live-region pattern QuizPanel's own
// "Correct!"/"Not quite" feedback already uses) announces the current
// side's actual content in words. That's what satisfies "don't rely
// solely on the animation to communicate state" — the rotation itself is
// purely decorative, and is skipped entirely under reduced motion (see
// Flashcard.css's own media query + the `reducedMotion` class below) while
// the announced state changes exactly the same either way.
export default function Flashcard({
  front,
  back,
  explanation,
  flipped,
  onFlip,
  position,
  total,
}: FlashcardProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div className="flashcard-scene">
      <button
        type="button"
        onClick={onFlip}
        aria-pressed={flipped}
        aria-label="Flip flashcard"
        className={cn(
          "flashcard-inner",
          flipped && "flashcard-inner--flipped",
          reducedMotion && "flashcard-inner--instant",
        )}
      >
        <span className="flashcard-face flashcard-face--front" aria-hidden={flipped}>
          <span className="flashcard-eyebrow">Question</span>
          <span className="flashcard-text">{front}</span>
        </span>
        <span className="flashcard-face flashcard-face--back" aria-hidden={!flipped}>
          <span className="flashcard-eyebrow">Answer</span>
          <span className="flashcard-text">{back}</span>
          {explanation && (
            <span className="flashcard-explanation">{explanation}</span>
          )}
        </span>
      </button>
      <p role="status" className="sr-only">
        Flashcard {position} of {total}. {flipped ? "Answer" : "Question"}:{" "}
        {flipped ? back : front}
      </p>
    </div>
  );
}

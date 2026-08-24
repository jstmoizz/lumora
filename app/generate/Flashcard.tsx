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

// A single flip card. A real <button> (not a div with onClick), so
// Enter/Space flip it like any other control in this codebase; Arrow
// navigation is wired by the caller (ActiveFlashcardSet in
// FlashcardsPanel.tsx) via onKeyDown on the same interaction.
//
// Both faces stay in the DOM (the 3D flip rotates between them — see
// Flashcard.css), but the turned-away face is `aria-hidden`, and a
// `role="status"` line below (same live-region pattern as QuizPanel's
// feedback) announces the current side in words — the rotation itself is
// purely decorative and skipped under reduced motion, while the announced
// state changes exactly the same either way.
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

"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon, LayersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreateFlashcardsOutput } from "@/lib/ai/tools";
import Disclosure from "./Disclosure";
import Flashcard from "./Flashcard";
import { useAutoCollapseList } from "./useAutoCollapseList";

interface FlashcardsPanelProps {
  flashcardSets: CreateFlashcardsOutput[];
}

// The Flashcards half of Practice (see PracticePanel.tsx) — mirrors
// QuizPanel.tsx's structure exactly (empty state, one Disclosure per
// generated set, useAutoCollapseList for the same "newest opens, only the
// previously-auto-opened one collapses" behavior) since it's solving the
// identical problem for a second activity type, not a different one.
export default function FlashcardsPanel({ flashcardSets }: FlashcardsPanelProps) {
  const { isOpen, setOpen } = useAutoCollapseList(
    flashcardSets[0]?.flashcardSetId,
  );

  return (
    <div className="flex h-full flex-col gap-2">
      {flashcardSets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-lg bg-secondary text-foreground"
          >
            <LayersIcon className="size-4" />
          </div>
          <p className="text-sm font-medium text-foreground">
            No flashcards yet
          </p>
          <p className="max-w-[22ch] text-xs text-muted-foreground">
            Ask Lumora for flashcards on a topic and it&apos;ll show up here.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
          {flashcardSets.map((set) => (
            <Disclosure
              key={set.flashcardSetId}
              open={isOpen(set.flashcardSetId)}
              onOpenChange={(open) => setOpen(set.flashcardSetId, open)}
              label={set.topic}
              meta={`${set.cards.length} card${set.cards.length === 1 ? "" : "s"}`}
            >
              <ActiveFlashcardSet set={set} />
            </Disclosure>
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveFlashcardSet({ set }: { set: CreateFlashcardsOutput }) {
  // Position + flip side, kept here (not in Flashcard itself) so they
  // survive this set's own Disclosure being collapsed and reopened —
  // Disclosure keeps its content mounted (hidden, not removed) specifically
  // so state like this isn't lost the moment a card closes.
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = set.cards.length;
  const card = set.cards[index];
  const isFirst = index === 0;
  const isLast = index === total - 1;

  function goToPrevious() {
    if (isFirst) return;
    setIndex((current) => current - 1);
    setFlipped(false);
  }

  function goToNext() {
    if (isLast) return;
    setIndex((current) => current + 1);
    setFlipped(false);
  }

  // Arrow-key navigation alongside the card's own Enter/Space-to-flip —
  // bubbles up from whichever control inside currently has focus (the
  // card itself, or either nav button), so it works regardless of exactly
  // where focus landed.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      goToNext();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goToPrevious();
    }
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {set.topic}
        </p>
        <p className="shrink-0 text-xs font-medium text-muted-foreground">
          {index + 1} / {total}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="h-1 w-full overflow-hidden rounded-full bg-[var(--generate-accent-soft)]"
      >
        <div
          className="h-full rounded-full bg-[var(--generate-accent-solid)] transition-[width] duration-300 ease-out"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <Flashcard
        front={card.front}
        back={card.back}
        explanation={card.explanation}
        flipped={flipped}
        onFlip={() => setFlipped((current) => !current)}
        position={index + 1}
        total={total}
      />

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={goToPrevious}
          disabled={isFirst}
          aria-label="Previous card"
          className="gap-1"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={goToNext}
          disabled={isLast}
          aria-label="Next card"
          className="gap-1 bg-[var(--generate-accent-solid)] text-[var(--generate-accent-foreground)] hover:bg-[var(--generate-accent-solid)] hover:opacity-90"
        >
          Next
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

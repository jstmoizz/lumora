"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CreateFlashcardsOutput, CreateQuizOutput } from "@/lib/ai/tools";
import FlashcardsPanel from "./FlashcardsPanel";
import QuizPanel from "./QuizPanel";

interface PracticePanelProps {
  quizzes: CreateQuizOutput[];
  flashcardSets: CreateFlashcardsOutput[];
}

// Generate's Practice panel — the container for both activity types the
// chat can generate (Quizzes, Flashcards). Replaces the old single-purpose
// Quiz panel: the interactive quiz/flashcard experience lives entirely
// here, never duplicated into the chat itself (see PracticeToolPart.tsx
// and ChatInterface.tsx's onQuizGenerated/onFlashcardsGenerated).
//
// Reuses the project's existing Tabs primitive (components/ui/tabs.tsx,
// a Radix wrapper — real tab semantics, roving tabindex, and
// arrow-key-between-tabs navigation all come from it for free) rather than
// hand-rolling ARIA tabs. QuizPanel/FlashcardsPanel are each still fully
// self-contained and independently testable — this only decides which one
// is visible.
export default function PracticePanel({
  quizzes,
  flashcardSets,
}: PracticePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Practice
        </h2>
        <p className="text-xs text-muted-foreground">
          Test your knowledge or review a topic with generated quizzes and
          flashcards.
        </p>
      </div>

      <Tabs defaultValue="quizzes" className="min-h-0 flex-1">
        <TabsList className="w-full">
          <TabsTrigger value="quizzes">
            Quizzes
            {quizzes.length > 0 && (
              <span
                aria-hidden="true"
                className="ml-1 size-1.5 rounded-full bg-primary"
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="flashcards">
            Flashcards
            {flashcardSets.length > 0 && (
              <span
                aria-hidden="true"
                className="ml-1 size-1.5 rounded-full bg-primary"
              />
            )}
          </TabsTrigger>
        </TabsList>

        {/*
          forceMount + a manual data-state hide (rather than Radix's own
          default of unmounting the inactive tab) — same reasoning as
          Disclosure.tsx's `hidden` attribute: switching to Flashcards and
          back to Quizzes mid-quiz must not reset which question you were
          on or what you'd already answered.
        */}
        <TabsContent
          value="quizzes"
          forceMount
          className="min-h-0 data-[state=inactive]:hidden"
        >
          <QuizPanel quizzes={quizzes} />
        </TabsContent>
        <TabsContent
          value="flashcards"
          forceMount
          className="min-h-0 data-[state=inactive]:hidden"
        >
          <FlashcardsPanel flashcardSets={flashcardSets} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

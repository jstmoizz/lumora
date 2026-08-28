"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CreateFlashcardsOutput, CreateQuizOutput } from "@/lib/ai/tools";
import FlashcardsPanel from "./FlashcardsPanel";
import QuizPanel from "./QuizPanel";

interface PracticePanelProps {
  quizzes: CreateQuizOutput[];
  flashcardSets: CreateFlashcardsOutput[];
  /** Passed straight through to QuizPanel — see its own comment. */
  onExplainMistakes?: (text: string) => void;
}

// Generate's Resources panel (internally still "Practice" — only the
// user-facing label changed) — the container for both activity types the
// chat can generate. The interactive experience lives entirely here, never
// duplicated into the chat itself (see PracticeToolPart.tsx).
//
// Reuses the project's Tabs primitive (components/ui/tabs.tsx, a Radix
// wrapper) for real tab semantics and roving-tabindex navigation, rather
// than hand-rolling ARIA tabs. QuizPanel/FlashcardsPanel stay fully
// self-contained — this only decides which one is visible.
export default function PracticePanel({
  quizzes,
  flashcardSets,
  onExplainMistakes,
}: PracticePanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Resources
        </h2>
        <p className="text-xs text-muted-foreground">
          Test your knowledge or review a topic with generated quizzes and
          flashcards.
        </p>
      </div>

      <Tabs defaultValue="quizzes" className="min-h-0 flex-1">
        <TabsList className="w-full">
          <TabsTrigger
            value="quizzes"
            className="data-active:text-[var(--generate-accent)]"
          >
            Quizzes
            {quizzes.length > 0 && (
              <span
                aria-hidden="true"
                className="ml-1 size-1.5 rounded-full bg-[var(--generate-accent-solid)]"
              />
            )}
          </TabsTrigger>
          <TabsTrigger
            value="flashcards"
            className="data-active:text-[var(--generate-accent)]"
          >
            Flashcards
            {flashcardSets.length > 0 && (
              <span
                aria-hidden="true"
                className="ml-1 size-1.5 rounded-full bg-[var(--generate-accent-solid)]"
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
          <QuizPanel quizzes={quizzes} onExplainMistakes={onExplainMistakes} />
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

"use client";

import { useCallback, useRef, useState } from "react";
import { HistoryIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CreateFlashcardsOutput,
  CreateQuizOutput,
  LumoraUIMessage,
} from "@/lib/ai/tools";
import ChatInterface, { type PendingPrompt } from "./ChatInterface";
import MobilePanelDrawer from "./MobilePanelDrawer";
import PracticePanel from "./PracticePanel";
import RecentPromptsPanel from "./RecentPromptsPanel";

// How many recent prompts to keep — an intentionally simple in-memory
// list (session-only, not persisted), per the brief: this is not a
// conversation-management system, just enough to re-run something you
// asked a minute ago.
const MAX_RECENT_PROMPTS = 20;

interface GenerateWorkspaceProps {
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
}

// The three-column Generate layout: Recent Prompts | Chat | Practice. Chat
// (ChatInterface) is the only piece that owns `useChat` — this component
// doesn't lift that state up, it just listens to three callbacks
// (`onPromptSubmitted`, `onQuizGenerated`, `onFlashcardsGenerated`) and, in
// the other direction, hands ChatInterface a `pendingPrompt` when a Recent
// Prompt is selected. See ChatInterface.tsx's prop comments for the full
// contract.
export default function GenerateWorkspace({
  initialConversationId,
  initialMessages,
}: GenerateWorkspaceProps) {
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  // Newest first, matching Recent Prompts' own ordering convention below —
  // every quiz/flashcard set the user generates this session gets its own
  // slot rather than replacing the last one (see PracticePanel.tsx for the
  // per-activity collapsible-card rendering these feed).
  const [quizzes, setQuizzes] = useState<CreateQuizOutput[]>([]);
  const [flashcardSets, setFlashcardSets] = useState<CreateFlashcardsOutput[]>(
    [],
  );
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(
    null,
  );
  const [mobilePanel, setMobilePanel] = useState<"recent" | "practice" | null>(
    null,
  );
  const nextPendingPromptIdRef = useRef(0);

  const handlePromptSubmitted = useCallback((text: string) => {
    // Newest first; re-sending a prompt that's already in the list moves
    // it to the front rather than listing it twice.
    setRecentPrompts((prev) =>
      [text, ...prev.filter((prompt) => prompt !== text)].slice(
        0,
        MAX_RECENT_PROMPTS,
      ),
    );
  }, []);

  const handleSelectRecentPrompt = useCallback((text: string) => {
    nextPendingPromptIdRef.current += 1;
    setPendingPrompt({ text, id: nextPendingPromptIdRef.current });
    setMobilePanel(null);
  }, []);

  const handlePendingPromptHandled = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  const handleQuizGenerated = useCallback((quiz: CreateQuizOutput) => {
    // Dedupes by quizId defensively (ChatInterface's own onQuizGenerated
    // effect already only fires once per id), rather than assuming it'll
    // never be called twice for the same quiz.
    setQuizzes((prev) => [quiz, ...prev.filter((q) => q.quizId !== quiz.quizId)]);
  }, []);

  const handleFlashcardsGenerated = useCallback(
    (flashcards: CreateFlashcardsOutput) => {
      setFlashcardSets((prev) => [
        flashcards,
        ...prev.filter((set) => set.flashcardSetId !== flashcards.flashcardSetId),
      ]);
    },
    [],
  );

  const hasPracticeContent = quizzes.length > 0 || flashcardSets.length > 0;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:mx-auto lg:max-w-[1400px] lg:grid lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:items-stretch lg:gap-5">
      {/*
        Below `lg`, both side panels collapse behind these two toggles
        (opening MobilePanelDrawer) instead of squeezing three columns into
        a narrow viewport — chat stays the full-width, immediately visible
        primary surface at every size down to mobile.
      */}
      <div className="flex items-center justify-center gap-2 lg:hidden">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMobilePanel("recent")}
          className="gap-1.5"
        >
          <HistoryIcon aria-hidden="true" className="size-3.5" />
          Recent
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMobilePanel("practice")}
          className="gap-1.5"
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          Practice
          {hasPracticeContent && (
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-primary"
            />
          )}
        </Button>
      </div>

      <aside
        aria-label="Recent prompts"
        className="hidden min-h-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4"
      >
        <RecentPromptsPanel
          prompts={recentPrompts}
          onSelect={handleSelectRecentPrompt}
        />
      </aside>

      <div className="flex min-h-0 flex-1 flex-col items-center">
        <ChatInterface
          initialConversationId={initialConversationId}
          initialMessages={initialMessages}
          pendingPrompt={pendingPrompt}
          onPendingPromptHandled={handlePendingPromptHandled}
          onPromptSubmitted={handlePromptSubmitted}
          onQuizGenerated={handleQuizGenerated}
          onFlashcardsGenerated={handleFlashcardsGenerated}
        />
      </div>

      <aside
        aria-label="Practice"
        className="hidden min-h-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4"
      >
        <PracticePanel quizzes={quizzes} flashcardSets={flashcardSets} />
      </aside>

      <MobilePanelDrawer
        open={mobilePanel === "recent"}
        onOpenChange={(open) => setMobilePanel(open ? "recent" : null)}
        title="Recent prompts"
        side="left"
      >
        <RecentPromptsPanel
          prompts={recentPrompts}
          onSelect={handleSelectRecentPrompt}
        />
      </MobilePanelDrawer>

      <MobilePanelDrawer
        open={mobilePanel === "practice"}
        onOpenChange={(open) => setMobilePanel(open ? "practice" : null)}
        title="Practice"
        side="right"
      >
        <PracticePanel quizzes={quizzes} flashcardSets={flashcardSets} />
      </MobilePanelDrawer>
    </div>
  );
}

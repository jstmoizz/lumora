"use client";

import { useCallback, useRef, useState } from "react";
import { HistoryIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreateQuizOutput, LumoraUIMessage } from "@/lib/ai/tools";
import ChatInterface, { type PendingPrompt } from "./ChatInterface";
import MobilePanelDrawer from "./MobilePanelDrawer";
import QuizPanel from "./QuizPanel";
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

// The three-column Generate layout: Recent Prompts | Chat | Quiz. Chat
// (ChatInterface) is the only piece that owns `useChat` — this component
// doesn't lift that state up, it just listens to two callbacks
// (`onPromptSubmitted`, `onQuizGenerated`) and, in the other direction,
// hands ChatInterface a `pendingPrompt` when a Recent Prompt is selected.
// See ChatInterface.tsx's prop comments for the full contract.
export default function GenerateWorkspace({
  initialConversationId,
  initialMessages,
}: GenerateWorkspaceProps) {
  const [recentPrompts, setRecentPrompts] = useState<string[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<CreateQuizOutput | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(
    null,
  );
  const [mobilePanel, setMobilePanel] = useState<"recent" | "quiz" | null>(
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
    setActiveQuiz(quiz);
  }, []);

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
          onClick={() => setMobilePanel("quiz")}
          className="gap-1.5"
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          Quiz
          {activeQuiz && (
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
        />
      </div>

      <aside
        aria-label="Quiz"
        className="hidden min-h-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4"
      >
        <QuizPanel quiz={activeQuiz} />
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
        open={mobilePanel === "quiz"}
        onOpenChange={(open) => setMobilePanel(open ? "quiz" : null)}
        title="Quiz"
        side="right"
      >
        <QuizPanel quiz={activeQuiz} />
      </MobilePanelDrawer>
    </div>
  );
}

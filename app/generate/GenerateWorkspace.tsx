"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HistoryIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  CreateFlashcardsOutput,
  CreateQuizOutput,
  LumoraUIMessage,
} from "@/lib/ai/tools";
import type { ConversationSummary } from "@/lib/supabase/conversations";
import {
  readActiveConversationId,
  writeActiveConversationId,
} from "./activeConversationStorage";
import ChatInterface from "./ChatInterface";
import MobilePanelDrawer from "./MobilePanelDrawer";
import PracticePanel from "./PracticePanel";
import RecentChatsPanel from "./RecentChatsPanel";

interface GenerateWorkspaceProps {
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
  initialConversations: ConversationSummary[];
}

// One conversation's worth of state: the chat itself (owned entirely by
// ChatInterface's useChat) plus the Resources activities that conversation
// has generated. GenerateWorkspace mounts exactly one of these at a time,
// keyed by `sessionKey` — switching conversations (New Chat, or picking a
// Recent Chat) bumps that key, which remounts this component fresh rather
// than trying to reset all of its state by hand. Same trick app/generate/
// page.tsx used to do at the page level (see its own comment); it now lives
// here so switching conversations no longer needs a full navigation.
function GenerateSession({
  initialConversationId,
  initialMessages,
  resourcesMobileOpen,
  onResourcesMobileOpenChange,
  onConversationIdKnown,
  onTurnSettled,
}: {
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
  resourcesMobileOpen: boolean;
  onResourcesMobileOpenChange: (open: boolean) => void;
  onConversationIdKnown: (id: string) => void;
  onTurnSettled: () => void;
}) {
  const [quizzes, setQuizzes] = useState<CreateQuizOutput[]>([]);
  const [flashcardSets, setFlashcardSets] = useState<CreateFlashcardsOutput[]>(
    [],
  );

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

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center">
        <ChatInterface
          initialConversationId={initialConversationId}
          initialMessages={initialMessages}
          onConversationIdKnown={onConversationIdKnown}
          onTurnSettled={onTurnSettled}
          onQuizGenerated={handleQuizGenerated}
          onFlashcardsGenerated={handleFlashcardsGenerated}
        />
      </div>

      <aside
        aria-label="Resources"
        className="hidden min-h-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4"
      >
        <PracticePanel quizzes={quizzes} flashcardSets={flashcardSets} />
      </aside>

      <MobilePanelDrawer
        open={resourcesMobileOpen}
        onOpenChange={onResourcesMobileOpenChange}
        title="Resources"
        side="right"
      >
        <PracticePanel quizzes={quizzes} flashcardSets={flashcardSets} />
      </MobilePanelDrawer>
    </>
  );
}

// The three-column Generate layout: Recent Chats | Chat | Resources.
// GenerateWorkspace itself owns everything that outlives a single
// conversation (the Recent Chats list, which conversation is active) —
// GenerateSession above owns everything scoped to just the one currently
// active conversation, and gets fully replaced (via `sessionKey`) whenever
// that changes.
export default function GenerateWorkspace({
  initialConversationId,
  initialMessages,
  initialConversations,
}: GenerateWorkspaceProps) {
  const router = useRouter();

  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationId,
  );
  const [activeInitialMessages, setActiveInitialMessages] = useState(
    initialMessages,
  );
  const [sessionKey, setSessionKey] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<"recent" | "resources" | null>(
    null,
  );
  const [loadingConversationId, setLoadingConversationId] = useState<
    string | null
  >(null);
  // True only while restoring a conversation this tab was already on before
  // an away-and-back navigation (see the mount effect below) — never true
  // when the server already resolved a conversation from the URL.
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as {
        conversations: ConversationSummary[];
      };
      setConversations(data.conversations);
    } catch {
      // Recent Chats staying slightly stale isn't worth surfacing an
      // error for — the list corrects itself on the next successful fetch
      // (next turn, next selection) or a real page load.
    }
  }, []);

  // On a bare `/generate` load (no ?conversationId=, so the server didn't
  // resolve one) with a conversation this tab already had active — e.g. the
  // user navigated to Explore/Settings and back via the Dock, which links
  // to plain "/generate" — pick that conversation back up instead of
  // starting a fresh one. A real `?conversationId=` in the URL always wins
  // (that's an explicit link, e.g. from History) and skips this entirely.
  useEffect(() => {
    if (initialConversationId) {
      writeActiveConversationId(initialConversationId);
      return;
    }
    const storedId = readActiveConversationId();
    if (!storedId) return;

    let cancelled = false;
    // This flag can only be known once we've checked sessionStorage above
    // (not derivable from props at initial render), and the fetch it gates
    // is genuinely async — not a state-mirrors-state loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsRestoringSession(true);
    (async () => {
      try {
        const response = await fetch(`/api/conversations/${storedId}`);
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { messages: LumoraUIMessage[] };
        if (cancelled) return;
        setActiveConversationId(storedId);
        setActiveInitialMessages(data.messages);
        setSessionKey((key) => key + 1);
      } catch {
        // Stored id is stale or unreadable — fall back to a fresh
        // conversation silently rather than surfacing an error for a
        // background restore the user never explicitly asked for.
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately runs once, on mount only — a one-time "resume where this
    // tab left off" check, not a live subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(undefined);
    setActiveInitialMessages(undefined);
    setSessionKey((key) => key + 1);
    setMobilePanel(null);
    writeActiveConversationId(null);
    router.replace("/generate", { scroll: false });
  }, [router]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationId) {
        setMobilePanel(null);
        return;
      }
      setLoadingConversationId(id);
      try {
        const response = await fetch(`/api/conversations/${id}`);
        if (!response.ok) return;
        const data = (await response.json()) as { messages: LumoraUIMessage[] };
        setActiveConversationId(id);
        setActiveInitialMessages(data.messages);
        setSessionKey((key) => key + 1);
        writeActiveConversationId(id);
        router.replace(`/generate?conversationId=${id}`, { scroll: false });
      } finally {
        setLoadingConversationId(null);
        setMobilePanel(null);
      }
    },
    [activeConversationId, router],
  );

  const handleConversationIdKnown = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      writeActiveConversationId(id);
      router.replace(`/generate?conversationId=${id}`, { scroll: false });
      void refreshConversations();
    },
    [router, refreshConversations],
  );

  const handleTurnSettled = useCallback(() => {
    void refreshConversations();
  }, [refreshConversations]);

  const handleResourcesMobileOpenChange = useCallback((open: boolean) => {
    setMobilePanel(open ? "resources" : null);
  }, []);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:mx-auto lg:max-w-[1400px] lg:grid lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:items-stretch lg:gap-5">
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
          onClick={() => setMobilePanel("resources")}
          className="gap-1.5"
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          Resources
        </Button>
      </div>

      <aside
        aria-label="Recent chats"
        className="hidden min-h-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-4"
      >
        <RecentChatsPanel
          conversations={conversations}
          activeConversationId={activeConversationId}
          loadingConversationId={loadingConversationId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
        />
      </aside>

      {isRestoringSession ? (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <span
              role="status"
              className="text-sm text-muted-foreground motion-safe:animate-pulse"
            >
              Restoring your conversation&hellip;
            </span>
          </div>
          {/*
            An inert placeholder in Resources' own grid column — keeps the
            three-column width stable instead of collapsing to two while
            this (brief, one-fetch) restore is in flight.
          */}
          <div
            aria-hidden="true"
            className="hidden lg:block lg:rounded-2xl lg:border lg:border-border lg:bg-card"
          />
        </>
      ) : (
        <GenerateSession
          key={sessionKey}
          initialConversationId={activeConversationId}
          initialMessages={activeInitialMessages}
          resourcesMobileOpen={mobilePanel === "resources"}
          onResourcesMobileOpenChange={handleResourcesMobileOpenChange}
          onConversationIdKnown={handleConversationIdKnown}
          onTurnSettled={handleTurnSettled}
        />
      )}

      <MobilePanelDrawer
        open={mobilePanel === "recent"}
        onOpenChange={(open) => setMobilePanel(open ? "recent" : null)}
        title="Recent chats"
        side="left"
      >
        <RecentChatsPanel
          conversations={conversations}
          activeConversationId={activeConversationId}
          loadingConversationId={loadingConversationId}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
        />
      </MobilePanelDrawer>
    </div>
  );
}

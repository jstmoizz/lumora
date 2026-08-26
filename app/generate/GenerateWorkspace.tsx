"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { HistoryIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_GENERATE_ACCENT,
  getStoredGenerateAccent,
  type GenerateAccent,
} from "@/app/components/theme/generateAccent";
import "@/app/components/theme/generate-accent.css";
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

// Radix's Dialog portals its content into document.body, outside this
// tree, so `data-generate-accent` on the workspace root never cascades to
// it — wrapping the drawer's children re-scopes it locally. `contents`
// keeps the wrapper out of layout.
function AccentScope({
  accent,
  children,
}: {
  accent: string;
  children: ReactNode;
}) {
  return (
    <div data-generate-accent={accent} className="contents">
      {children}
    </div>
  );
}

interface GenerateWorkspaceProps {
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
  initialConversations: ConversationSummary[];
  /** From /generate?topic=... (Explore's "Study Topic" link) — only
   * relevant to the first session; never threaded through session switches. */
  initialTopic?: string;
}

// One conversation's worth of state: the chat plus the Resources activities
// it's generated. Keyed by `sessionKey` — switching conversations bumps
// that key, remounting this fresh rather than resetting state by hand.
function GenerateSession({
  initialConversationId,
  initialMessages,
  initialTopic,
  resourcesMobileOpen,
  onResourcesMobileOpenChange,
  onConversationIdKnown,
  onTurnSettled,
  accent,
}: {
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
  initialTopic?: string;
  resourcesMobileOpen: boolean;
  onResourcesMobileOpenChange: (open: boolean) => void;
  onConversationIdKnown: (id: string) => void;
  onTurnSettled: () => void;
  accent: string;
}) {
  const [quizzes, setQuizzes] = useState<CreateQuizOutput[]>([]);
  const [flashcardSets, setFlashcardSets] = useState<CreateFlashcardsOutput[]>(
    [],
  );

  const handleQuizGenerated = useCallback((quiz: CreateQuizOutput) => {
    // Dedupes by quizId defensively, rather than assuming this is never
    // called twice for the same quiz.
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
          initialTopic={initialTopic}
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
        <AccentScope accent={accent}>
          <PracticePanel quizzes={quizzes} flashcardSets={flashcardSets} />
        </AccentScope>
      </MobilePanelDrawer>
    </>
  );
}

// The three-column Generate layout: Recent Chats | Chat | Resources.
// GenerateWorkspace owns everything that outlives a single conversation;
// GenerateSession owns everything scoped to the active one.
export default function GenerateWorkspace({
  initialConversationId,
  initialMessages,
  initialConversations,
  initialTopic,
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
  // Kept separate from loadingConversationId since a failure needs to stay
  // visible after loading clears.
  const [selectionError, setSelectionError] = useState<string | null>(null);
  // A ref, not state, so two clicks in the same tick are distinguishable
  // instantly — each in-flight request checks this before touching state,
  // so only the latest selection's response is ever applied.
  const selectionRequestIdRef = useRef(0);
  // True only while restoring a conversation this tab was already on
  // before an away-and-back navigation.
  const [isRestoringSession, setIsRestoringSession] = useState(false);

  // Defaults to indigo so server and first client render agree; the real
  // stored choice is picked up a moment later in the effect below.
  const [accent, setAccent] = useState<GenerateAccent>(DEFAULT_GENERATE_ACCENT);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of a client-only value (localStorage).
    setAccent(getStoredGenerateAccent());
  }, []);

  const refreshConversations = useCallback(async () => {
    try {
      const response = await fetch("/api/conversations");
      if (!response.ok) return;
      const data = (await response.json()) as {
        conversations: ConversationSummary[];
      };
      setConversations(data.conversations);
    } catch {
      // Not worth surfacing an error — the list corrects itself on the
      // next successful fetch or page load.
    }
  }, []);

  // On a bare /generate load with a conversation this tab already had
  // active, pick it back up instead of starting fresh. A real
  // ?conversationId= in the URL always wins and skips this.
  useEffect(() => {
    if (initialConversationId) {
      writeActiveConversationId(initialConversationId);
      return;
    }
    const storedId = readActiveConversationId();
    if (!storedId) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- only knowable after checking sessionStorage above; the fetch it gates is genuinely async.
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
        // conversation silently.
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, on mount only.
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(undefined);
    setActiveInitialMessages(undefined);
    setSessionKey((key) => key + 1);
    setMobilePanel(null);
    setSelectionError(null);
    writeActiveConversationId(null);
    router.replace("/generate", { scroll: false });
  }, [router]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (id === activeConversationId) {
        setMobilePanel(null);
        return;
      }

      const requestId = ++selectionRequestIdRef.current;
      const isStale = () => selectionRequestIdRef.current !== requestId;

      setLoadingConversationId(id);
      setSelectionError(null);

      try {
        const response = await fetch(`/api/conversations/${id}`);
        // A newer selection has already started — discard this response.
        if (isStale()) return;

        if (!response.ok) {
          if (response.status === 404) {
            setSelectionError("This conversation is no longer available.");
            // Best-effort: drops the now-gone conversation from the list.
            void refreshConversations();
          } else {
            setSelectionError("Couldn't load this conversation. Please try again.");
          }
          return;
        }

        const data = (await response.json()) as { messages: LumoraUIMessage[] };
        if (isStale()) return;

        setActiveConversationId(id);
        setActiveInitialMessages(data.messages);
        setSessionKey((key) => key + 1);
        writeActiveConversationId(id);
        router.replace(`/generate?conversationId=${id}`, { scroll: false });
      } catch {
        if (isStale()) return;
        setSelectionError("Couldn't load this conversation. Please try again.");
      } finally {
        // Only the still-current request may clear the loading indicator —
        // a stale one finishing later must not affect the newer selection.
        if (!isStale()) {
          setLoadingConversationId(null);
        }
        setMobilePanel(null);
      }
    },
    [activeConversationId, router, refreshConversations],
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
    <div
      data-generate-accent={accent}
      className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:mx-auto lg:max-w-[1400px] lg:grid lg:grid-cols-[220px_minmax(0,1fr)_260px] lg:items-stretch lg:gap-5"
    >
      {/* Below lg, both side panels collapse behind these toggles instead of squeezing three columns into a narrow viewport. */}
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
          selectionError={selectionError}
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
          {/* Inert placeholder keeping the three-column width stable during the brief restore. */}
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
          // Only meaningful for the first session — a session switch
          // shouldn't keep re-prefilling the composer.
          initialTopic={sessionKey === 0 ? initialTopic : undefined}
          resourcesMobileOpen={mobilePanel === "resources"}
          onResourcesMobileOpenChange={handleResourcesMobileOpenChange}
          onConversationIdKnown={handleConversationIdKnown}
          onTurnSettled={handleTurnSettled}
          accent={accent}
        />
      )}

      <MobilePanelDrawer
        open={mobilePanel === "recent"}
        onOpenChange={(open) => setMobilePanel(open ? "recent" : null)}
        title="Recent chats"
        side="left"
      >
        <AccentScope accent={accent}>
          <RecentChatsPanel
            conversations={conversations}
            activeConversationId={activeConversationId}
            loadingConversationId={loadingConversationId}
            selectionError={selectionError}
            onSelect={handleSelectConversation}
            onNewChat={handleNewChat}
          />
        </AccentScope>
      </MobilePanelDrawer>
    </div>
  );
}

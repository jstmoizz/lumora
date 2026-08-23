"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowDownIcon, CircleAlertIcon, RotateCcwIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LumoraUIMessage } from "@/lib/ai/tools";
import QuizToolPart from "./QuizToolPart";

// How close to the bottom (in pixels) counts as "at the bottom" for the
// purpose of re-engaging auto-scroll. A small tolerance, not an exact 0,
// so sub-pixel/rounding scroll positions don't falsely look "scrolled up".
const NEAR_BOTTOM_THRESHOLD_PX = 64;

// Curated pool of study-related suggestions shown in the empty state.
// Spans multiple subjects (not just CS) and mixes plain "explain" prompts
// with "quiz me" prompts that exercise the `createQuiz` tool — a fresh,
// random subset of these is picked per page mount (see `pickRandomPrompts`
// below). Purely illustrative copy — clicking one sends it as-is via the
// same `sendMessage` path as the composer, no separate submission logic.
const EXAMPLE_PROMPT_POOL = [
  "Explain photosynthesis",
  "Quiz me on data structures",
  "Explain binary search",
  "Quiz me on world history",
  "Help me understand Newton's laws of motion",
  "Explain how neural networks work",
  "Quiz me on the periodic table",
  "Break down Big-O notation for me",
  "Explain the water cycle",
  "Quiz me on grammar rules",
  "Help me understand supply and demand",
  "Explain recursion like I'm a beginner",
  "Quiz me on the solar system",
] as const;

// Number of suggestions shown at once — unchanged from the original UI.
const VISIBLE_EXAMPLE_COUNT = 3;

// Fisher-Yates shuffle + slice: picks `count` distinct prompts from `pool`
// with no duplicates, in random order.
function pickRandomPrompts(
  pool: readonly string[],
  count: number,
): string[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// Deterministic fallback used only for the server-rendered/pre-hydration
// snapshot below, so the very first client render matches the server's
// markup exactly (Math.random() would otherwise diverge between the two
// and trigger a hydration mismatch).
const SERVER_EXAMPLE_PROMPTS = EXAMPLE_PROMPT_POOL.slice(
  0,
  VISIBLE_EXAMPLE_COUNT,
);
function getServerExamplePrompts(): string[] {
  return SERVER_EXAMPLE_PROMPTS;
}

// This "store" never changes/emits, so there's nothing to subscribe to —
// `useSyncExternalStore` still requires a subscribe function, and an inert
// one is the correct shape when the snapshot is only ever read once.
function subscribeToNothing() {
  return () => {};
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The AI SDK surfaces every chat failure as a plain `Error`, whether it's a
// network drop, an HTTP/API error, or a mid-stream failure — there's no
// discriminated error type to switch on. We only special-case the one kind
// we can safely detect client-side (a fetch that never reached the server,
// which the SDK itself throws as a TypeError) so we can point the user at
// their connection; everything else — HTTP failures, rate limits, mid-stream
// errors — collapses into one generic message. `error.message` itself is
// never rendered: it may contain provider/internal detail we don't want to
// expose.
function getChatErrorCopy(error: Error | undefined) {
  const isNetworkError =
    error instanceof TypeError && /fetch|network/i.test(error.message);

  return isNetworkError
    ? {
        title: "Couldn't reach Lumora",
        description: "Check your connection, then retry.",
      }
    : {
        title: "Couldn't finish that response",
        description: "Your message wasn't lost — you can retry it.",
      };
}

function ChatErrorCard({
  error,
  retrying,
  onRetry,
}: {
  error: Error | undefined;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { title, description } = getChatErrorCopy(error);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
      {/*
        This card appears mid-conversation with no navigation to cue a
        screen reader user that something changed — `role="alert"` announces
        it the moment it mounts, same as it would be seen appear visually.
      */}
      <div role="alert" className="flex items-center gap-2.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        className="w-fit gap-1.5 rounded-xl transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] disabled:hover:translate-y-0 disabled:hover:scale-100"
      >
        <RotateCcwIcon
          aria-hidden="true"
          className={cn("size-3.5", retrying && "motion-safe:animate-spin")}
        />
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
}

export default function ChatInterface({
  initialConversationId,
  initialMessages,
}: {
  /** Set when arriving from History via /generate?conversationId=... */
  initialConversationId?: string;
  initialMessages?: LumoraUIMessage[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, regenerate, status, stop, error } =
    useChat<LumoraUIMessage>({
      messages: initialMessages,
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

  // Two ways this becomes known, covering the two ways a chat starts:
  // resuming from History arrives already knowing it (`initialConversationId`,
  // read server-side from the URL); starting fresh only learns it once the
  // server creates a conversation and reports it back via the assistant
  // message's metadata (see `messageMetadata` in app/api/chat/route.ts) —
  // never generated or chosen client-side either way. Once known, every
  // later request in this session (a new send, or a retry) includes it as
  // `body.conversationId` so the server continues the same conversation
  // instead of starting another one.
  const conversationId =
    initialConversationId ??
    messages.find((message) => message.metadata?.conversationId)?.metadata
      ?.conversationId;

  // Only passes a second argument at all once there's a conversation to
  // continue — omitting it (rather than passing `body: undefined`) keeps
  // the very first request in a session identical to before this feature
  // existed.
  function sendChatMessage(message: { text: string }) {
    if (conversationId) {
      sendMessage(message, { body: { conversationId } });
    } else {
      sendMessage(message);
    }
  }

  // Randomized once per mount (cached in the ref, computed lazily on first
  // read) and never recomputed afterward — a fresh visit remounts this
  // component and gets a new subset. `useSyncExternalStore`'s server
  // snapshot keeps this hydration-safe: React renders the deterministic
  // `getServerExamplePrompts()` value through hydration to match the
  // server-rendered HTML, then swaps to the real random snapshot right
  // after — no `Math.random()` call ever runs during render itself, so
  // there's nothing for React to mismatch against.
  const randomExamplePromptsRef = useRef<string[] | null>(null);
  const examplePrompts = useSyncExternalStore(
    subscribeToNothing,
    () => {
      if (randomExamplePromptsRef.current === null) {
        randomExamplePromptsRef.current = pickRandomPrompts(
          EXAMPLE_PROMPT_POOL,
          VISIBLE_EXAMPLE_COUNT,
        );
      }
      return randomExamplePromptsRef.current;
    },
    getServerExamplePrompts,
  );

  const isGenerating = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && status === "ready";
  const isEmpty = messages.length === 0;
  const hasError = status === "error";

  // A ref (not just the mirrored `isRetrying` state below) so the guard is
  // effective the instant a second click happens — state updates only take
  // effect on the next render, which is too late to stop a synchronous
  // double-click from firing `regenerate()` twice.
  const isRetryingRef = useRef(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Mirrors "is the user currently near the bottom", read on every scroll
  // event without triggering a re-render. Only the boolean transitions
  // (near <-> away) touch React state, via `showJumpToLatest` below.
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  // Refs targeted by the empty-state entrance animation below.
  const emptyStateRef = useRef<HTMLDivElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const emptyDescriptionRef = useRef<HTMLParagraphElement>(null);
  const emptyExamplesRef = useRef<HTMLDivElement>(null);
  const emptyComposerRef = useRef<HTMLDivElement>(null);

  const jumpButtonWrapperRef = useRef<HTMLDivElement>(null);

  // Message ids already given their entrance animation, so a message is
  // only ever animated in once — never re-triggered while its text is
  // still streaming in.
  const animatedMessageIdsRef = useRef<Set<string>>(new Set());

  function isScrolledNearBottom() {
    const el = scrollContainerRef.current;
    if (!el) return true;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distanceFromBottom <= NEAR_BOTTOM_THRESHOLD_PX;
  }

  function scrollToBottom(behavior: ScrollBehavior) {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }

  // Track the user's own scrolling. Passive + only updates state on an
  // actual near/away transition, so this doesn't re-render on every pixel
  // of scroll while the list is (for example) being auto-followed.
  //
  // The scroll container only exists in the DOM once the conversation has
  // started (see `isEmpty` below), so this must re-run when that mounts —
  // an empty dep array would attach to nothing on first render and never
  // pick the container up once it appears.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    function handleScroll() {
      const nearBottom = isScrolledNearBottom();
      if (nearBottom !== isNearBottomRef.current) {
        isNearBottomRef.current = nearBottom;
        setShowJumpToLatest(!nearBottom);
      }
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isEmpty]);

  // Auto-follow new content (streamed tokens or newly added messages), but
  // only while the user hasn't scrolled away from the bottom. Instant
  // ("auto") rather than smooth, since this can fire once per token and a
  // smooth-scroll animation restarting on every chunk looks janky; smooth
  // scrolling is reserved for the explicit "Jump to latest" action below.
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    scrollToBottom("auto");
  }, [messages]);

  // One-time cascading entrance for the empty state (heading -> description
  // -> example prompts -> composer). The empty state only ever renders once
  // per session — there's no "clear chat" affordance — so this runs once on
  // mount and never again.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (
        !emptyHeadingRef.current ||
        !emptyDescriptionRef.current ||
        !emptyComposerRef.current
      ) {
        return;
      }

      const prompts = emptyExamplesRef.current
        ? Array.from(emptyExamplesRef.current.children)
        : [];

      gsap
        .timeline({ defaults: { ease: "power2.out", duration: 0.35 } })
        .from(emptyHeadingRef.current, { opacity: 0, y: 14 })
        .from(emptyDescriptionRef.current, { opacity: 0, y: 10 }, "-=0.22")
        .from(prompts, { opacity: 0, y: 8, stagger: 0.06 }, "-=0.18")
        .from(emptyComposerRef.current, { opacity: 0, y: 10 }, "-=0.15");
    },
    { scope: emptyStateRef, dependencies: [] },
  );

  // Fade + scale the Jump-to-latest badge in whenever it becomes visible.
  // No matching exit animation: it would need extra state just to delay
  // unmounting past the existing `showJumpToLatest` condition, and instant
  // disappearance doesn't hurt the UX enough to justify that.
  useGSAP(
    () => {
      if (
        !showJumpToLatest ||
        prefersReducedMotion() ||
        !jumpButtonWrapperRef.current
      ) {
        return;
      }
      gsap.fromTo(
        jumpButtonWrapperRef.current,
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 0.22, ease: "power2.out" },
      );
    },
    { dependencies: [showJumpToLatest] },
  );

  // Animate a message row in only the first time it's introduced into the
  // list — never on subsequent content updates. `messages.length` only
  // changes when a message is pushed (a new user message, or the
  // assistant's first streamed chunk); it stays constant while an existing
  // message's text is being replaced chunk-by-chunk, so this intentionally
  // does not fire on every streamed token.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const latest = messages[messages.length - 1];
      if (!latest || animatedMessageIdsRef.current.has(latest.id)) return;
      animatedMessageIdsRef.current.add(latest.id);

      const el = scrollContainerRef.current?.querySelector(
        `[data-message-id="${latest.id}"]`,
      );
      if (!el) return;

      const isUser = latest.role === "user";
      gsap.from(el, {
        opacity: 0,
        x: isUser ? 16 : 0,
        y: isUser ? 0 : 8,
        duration: 0.3,
        ease: "power2.out",
      });
    },
    { dependencies: [messages.length] },
  );

  function handleJumpToLatest() {
    isNearBottomRef.current = true;
    setShowJumpToLatest(false);
    scrollToBottom(prefersReducedMotion() ? "auto" : "smooth");
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (!canSend) return;
    sendChatMessage({ text: input });
    setInput("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleExampleClick(prompt: string) {
    if (status !== "ready") return;
    sendChatMessage({ text: prompt });
  }

  // Re-requests the failed turn via the SDK's own `regenerate` — it drops
  // the failed (possibly partial) assistant message and resends from the
  // last user message already in `messages`, so this never appends a
  // duplicate user message. The ref guard makes rapid double-clicks a
  // no-op; `regenerate` resolves rather than throws even if the retry
  // itself fails, since AbstractChat routes retry failures into `status`
  // instead.
  async function handleRetry() {
    if (isRetryingRef.current || status !== "error") return;
    isRetryingRef.current = true;
    setIsRetrying(true);
    try {
      await (conversationId
        ? regenerate({ body: { conversationId } })
        : regenerate());
    } finally {
      isRetryingRef.current = false;
      setIsRetrying(false);
    }
  }

  // No assistant message exists yet for this turn (the API hasn't sent the
  // message-start event). Once it does, the per-message "pending" branch
  // below takes over with the same "Thinking..." text, so there is no
  // visible swap between this and the in-message indicator.
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistantMessage =
    status === "submitted" && (!lastMessage || lastMessage.role === "user");
  // A failure that happened before any assistant content ever appeared for
  // this turn — network failure, or an HTTP/API error returned before the
  // stream started. The failed turn has no assistant message to attach an
  // inline error to, so it renders as its own row instead (mirrors
  // `awaitingAssistantMessage` above, which handles the same "no assistant
  // message yet" gap for the pending case).
  const erroredBeforeAssistantMessage =
    hasError && (!lastMessage || lastMessage.role === "user");

  const composer = (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-ring focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/30"
    >
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isGenerating}
        placeholder="Ask anything..."
        rows={1}
        aria-label="Message"
        className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
      />
      {isGenerating ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => stop()}
          className="h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
        >
          Stop
        </Button>
      ) : (
        <Button
          type="submit"
          disabled={!canSend}
          className="h-11 shrink-0 rounded-xl px-5 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
        >
          Send
        </Button>
      )}
    </form>
  );

  return (
    <div className="flex w-full min-h-0 max-w-2xl flex-1 flex-col gap-4">
      {isEmpty ? (
        <div
          ref={emptyStateRef}
          className="flex flex-1 flex-col items-center justify-center gap-8 px-2 py-6 text-center"
        >
          <div className="flex flex-col items-center gap-2">
            <h2
              ref={emptyHeadingRef}
              className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              What are you studying today?
            </h2>
            <p
              ref={emptyDescriptionRef}
              className="max-w-sm text-sm text-muted-foreground"
            >
              Ask a question, work through a concept, or try one of these to
              get started.
            </p>
          </div>

          {/*
            DOM order intentionally puts the composer before the example
            prompts so Tab reaches the primary input first; `order-last`
            keeps it rendered visually below the prompts as before.
          */}
          <div ref={emptyComposerRef} className="order-last w-full">
            {composer}
          </div>

          <div
            ref={emptyExamplesRef}
            role="group"
            aria-label="Example prompts"
            className="flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            {examplePrompts.map((prompt, index) => (
              <Button
                key={index}
                type="button"
                variant="outline"
                size="sm"
                disabled={status !== "ready"}
                onClick={() => handleExampleClick(prompt)}
                className="rounded-full border-border font-normal text-muted-foreground transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            {/*
              Plain scroll container: no border/background/fixed height. It
              only establishes the scrollable region — `scrollContainerRef`,
              and the scrollHeight/scrollTop/clientHeight math the existing
              near-bottom + auto-follow effects above read from it, are
              untouched. `justify-end` lives on the inner wrapper below
              (not here) specifically so a short conversation rests at the
              bottom without relying on justify-content on the
              overflow:auto element itself, which is a known source of
              scroll-position quirks.
            */}
            <div
              ref={scrollContainerRef}
              className="chat-scrollbar h-full overflow-y-auto"
            >
              <div className="flex min-h-full flex-col justify-end gap-6 py-4">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";
                  const text = message.parts
                    .filter(isTextUIPart)
                    .map((part) => part.text)
                    .join("");
                  const isLastMessage = index === messages.length - 1;
                  // Whether this message already has anything worth
                  // rendering — text content or a tool call that's at
                  // least started. A tool part existing (even still in
                  // input-streaming) counts, since QuizToolPart renders
                  // its own "preparing" state instead of leaving a gap.
                  const hasRenderableContent = message.parts.some(
                    (part) =>
                      (part.type === "text" && part.text.length > 0) ||
                      part.type === "tool-createQuiz",
                  );
                  const isPending =
                    !isUser &&
                    isLastMessage &&
                    !hasRenderableContent &&
                    isGenerating;
                  // This message is the one the current failed turn was
                  // streaming into (possibly with no content at all yet) —
                  // render whatever it managed to produce, followed by the
                  // error card, instead of a "Thinking..." indicator that
                  // will now never resolve.
                  const isErroredMessage = !isUser && isLastMessage && hasError;

                  return (
                    <div
                      key={message.id}
                      data-message-id={message.id}
                      className={isUser ? "flex justify-end" : "flex justify-start"}
                    >
                      {isUser ? (
                        <div className="min-w-0 max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-primary-foreground sm:max-w-[75%]">
                          {text}
                        </div>
                      ) : (
                        <div className="min-w-0 w-full text-[15px] leading-relaxed whitespace-pre-wrap break-words text-foreground">
                          {isPending ? (
                            <span
                              role="status"
                              className="text-muted-foreground motion-safe:animate-pulse"
                            >
                              Thinking&hellip;
                            </span>
                          ) : (
                            // Walk parts in the order the model produced
                            // them — text parts render through Streamdown
                            // as before; a `createQuiz` tool part renders
                            // via QuizToolPart, keyed by toolCallId so it
                            // stays mounted across its own state changes.
                            <div className="flex flex-col gap-3">
                              {message.parts.map((part, partIndex) => {
                                if (part.type === "text") {
                                  if (!part.text) return null;
                                  return (
                                    <Streamdown key={partIndex}>
                                      {part.text}
                                    </Streamdown>
                                  );
                                }
                                if (part.type === "tool-createQuiz") {
                                  return (
                                    <QuizToolPart
                                      key={part.toolCallId}
                                      part={part}
                                    />
                                  );
                                }
                                return null;
                              })}
                              {isErroredMessage && (
                                <ChatErrorCard
                                  error={error}
                                  retrying={isRetrying}
                                  onRetry={handleRetry}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {awaitingAssistantMessage && (
                  <div className="flex justify-start">
                    <span
                      role="status"
                      className="text-[15px] text-muted-foreground motion-safe:animate-pulse"
                    >
                      Thinking&hellip;
                    </span>
                  </div>
                )}

                {erroredBeforeAssistantMessage && (
                  <div className="flex justify-start">
                    <div className="w-full max-w-sm">
                      <ChatErrorCard
                        error={error}
                        retrying={isRetrying}
                        onRetry={handleRetry}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {showJumpToLatest && (
              <div
                ref={jumpButtonWrapperRef}
                className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center"
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleJumpToLatest}
                  className="pointer-events-auto gap-1 rounded-full border border-border shadow-md transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
                >
                  <ArrowDownIcon aria-hidden="true" className="size-3.5" />
                  Jump to latest
                </Button>
              </div>
            )}
          </div>

          {composer}
        </>
      )}
    </div>
  );
}

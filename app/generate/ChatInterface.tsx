"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowDownIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Button } from "@/components/ui/button";
import type { LumoraUIMessage } from "@/lib/ai/tools";
import QuizToolPart from "./QuizToolPart";

// How close to the bottom (in pixels) counts as "at the bottom" for the
// purpose of re-engaging auto-scroll. A small tolerance, not an exact 0,
// so sub-pixel/rounding scroll positions don't falsely look "scrolled up".
const NEAR_BOTTOM_THRESHOLD_PX = 64;

// Suggestions shown in the empty state to demonstrate what Lumora can help
// with. Purely illustrative copy — clicking one sends it as-is via the same
// `sendMessage` path as the composer, no separate submission logic.
const EXAMPLE_PROMPTS = [
  "Explain photosynthesis",
  "Quiz me on data structures",
  "Explain binary search",
];

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error } =
    useChat<LumoraUIMessage>({
      transport: new DefaultChatTransport({ api: "/api/chat" }),
    });

  const isGenerating = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && status === "ready";
  const isEmpty = messages.length === 0;

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
    sendMessage({ text: input });
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
    sendMessage({ text: prompt });
  }

  // No assistant message exists yet for this turn (the API hasn't sent the
  // message-start event). Once it does, the per-message "pending" branch
  // below takes over with the same "Thinking..." text, so there is no
  // visible swap between this and the in-message indicator.
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistantMessage =
    status === "submitted" && (!lastMessage || lastMessage.role === "user");

  const composer = (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-end gap-2 rounded-2xl border border-zinc-300 bg-background p-2 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-ring focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring/30 dark:border-zinc-700"
    >
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isGenerating}
        placeholder="Ask anything..."
        rows={1}
        aria-label="Message"
        className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-6 text-foreground placeholder:text-zinc-500 focus:outline-none disabled:opacity-50 dark:placeholder:text-zinc-500"
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

  const errorBanner = error ? (
    <p className="text-sm text-red-600 dark:text-red-400">
      Something went wrong: {error.message}
    </p>
  ) : null;

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
              className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400"
            >
              Ask a question, work through a concept, or try one of these to
              get started.
            </p>
          </div>

          <div
            ref={emptyExamplesRef}
            role="group"
            aria-label="Example prompts"
            className="flex max-w-md flex-wrap items-center justify-center gap-2"
          >
            {EXAMPLE_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExampleClick(prompt)}
                className="rounded-full border-zinc-300 font-normal text-zinc-600 transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] dark:border-zinc-700 dark:text-zinc-400"
              >
                {prompt}
              </Button>
            ))}
          </div>

          {errorBanner}

          <div ref={emptyComposerRef} className="w-full">
            {composer}
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
                            <span className="text-zinc-500 motion-safe:animate-pulse dark:text-zinc-500">
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
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {awaitingAssistantMessage && (
                  <div className="flex justify-start">
                    <span className="text-[15px] text-zinc-500 motion-safe:animate-pulse dark:text-zinc-500">
                      Thinking&hellip;
                    </span>
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
                  className="pointer-events-auto gap-1 rounded-full border border-zinc-200 shadow-md transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03] dark:border-zinc-700"
                >
                  <ArrowDownIcon className="size-3.5" />
                  Jump to latest
                </Button>
              </div>
            )}
          </div>

          {errorBanner}

          {composer}
        </>
      )}
    </div>
  );
}

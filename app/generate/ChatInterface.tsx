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
import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { Button } from "@/components/ui/button";

// How close to the bottom (in pixels) counts as "at the bottom" for the
// purpose of re-engaging auto-scroll. A small tolerance, not an exact 0,
// so sub-pixel/rounding scroll positions don't falsely look "scrolled up".
const NEAR_BOTTOM_THRESHOLD_PX = 64;

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function ChatInterface() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isGenerating = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && status === "ready";

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Mirrors "is the user currently near the bottom", read on every scroll
  // event without triggering a re-render. Only the boolean transitions
  // (near <-> away) touch React state, via `showJumpToLatest` below.
  const isNearBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

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
  }, []);

  // Auto-follow new content (streamed tokens or newly added messages), but
  // only while the user hasn't scrolled away from the bottom. Instant
  // ("auto") rather than smooth, since this can fire once per token and a
  // smooth-scroll animation restarting on every chunk looks janky; smooth
  // scrolling is reserved for the explicit "Jump to latest" action below.
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    scrollToBottom("auto");
  }, [messages]);

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

  // No assistant message exists yet for this turn (the API hasn't sent the
  // message-start event). Once it does, the per-message "pending" branch
  // below takes over with the same "Thinking..." text, so there is no
  // visible swap between this and the in-message indicator.
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistantMessage =
    status === "submitted" && (!lastMessage || lastMessage.role === "user");

  return (
    <div className="flex w-full max-w-2xl flex-1 flex-col gap-4">
      <div className="relative">
        <div
          ref={scrollContainerRef}
          className="flex h-[60dvh] min-h-80 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {messages.length === 0 && !awaitingAssistantMessage && (
            <p className="m-auto max-w-xs text-center text-sm text-zinc-500 dark:text-zinc-500">
              Ask Lumora a question to start studying.
            </p>
          )}

          {messages.map((message, index) => {
            const isUser = message.role === "user";
            const text = message.parts
              .filter(isTextUIPart)
              .map((part) => part.text)
              .join("");
            const isLastMessage = index === messages.length - 1;
            const isPending =
              !isUser && isLastMessage && text.length === 0 && isGenerating;

            return (
              <div
                key={message.id}
                className={isUser ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    isUser
                      ? "min-w-0 max-w-[85%] rounded-lg bg-foreground px-4 py-2 text-sm whitespace-pre-wrap break-words text-background sm:max-w-[75%]"
                      : "min-w-0 max-w-[85%] rounded-lg border border-zinc-200 bg-background px-4 py-2 text-sm whitespace-pre-wrap break-words text-foreground sm:max-w-[75%] dark:border-zinc-800"
                  }
                >
                  {isPending ? (
                    <span className="text-zinc-500 dark:text-zinc-500">
                      Thinking&hellip;
                    </span>
                  ) : isUser ? (
                    text
                  ) : (
                    <Streamdown>{text}</Streamdown>
                  )}
                </div>
              </div>
            );
          })}

          {awaitingAssistantMessage && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-zinc-200 bg-background px-4 py-2 text-sm text-zinc-500 sm:max-w-[75%] dark:border-zinc-800 dark:text-zinc-500">
                Thinking&hellip;
              </div>
            </div>
          )}
        </div>

        {showJumpToLatest && messages.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleJumpToLatest}
              className="pointer-events-auto shadow-md"
            >
              Jump to latest ↓
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Something went wrong: {error.message}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          placeholder="Ask Lumora something..."
          rows={2}
          aria-label="Message"
          className="flex-1 resize-none rounded-lg border border-zinc-300 bg-background px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 focus:ring-2 focus:ring-zinc-400 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:placeholder:text-zinc-500"
        />
        {isGenerating ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => stop()}
            className="h-11 px-4"
          >
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!canSend} className="h-11 px-4">
            Send
          </Button>
        )}
      </form>
    </div>
  );
}

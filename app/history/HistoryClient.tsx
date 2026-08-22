"use client";

import Link from "next/link";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConversationSummary } from "@/lib/supabase/conversations";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const RELATIVE_TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 1000 * 60 * 60 * 24 * 365],
  ["month", 1000 * 60 * 60 * 24 * 30],
  ["week", 1000 * 60 * 60 * 24 * 7],
  ["day", 1000 * 60 * 60 * 24],
  ["hour", 1000 * 60 * 60],
  ["minute", 1000 * 60],
];

const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

// "2 hours ago", "Yesterday", etc. via the built-in Intl formatter — no new
// dependency needed for this. Kept out of the component body's own render
// (called inline per-row instead) since its result depends on the current
// time, not just `updatedAt`; see the `suppressHydrationWarning` note below
// for why that's fine here.
function formatRelativeTime(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  for (const [unit, unitMs] of RELATIVE_TIME_UNITS) {
    if (Math.abs(diffMs) >= unitMs) {
      return relativeTimeFormatter.format(Math.round(diffMs / unitMs), unit);
    }
  }
  return relativeTimeFormatter.format(0, "minute");
}

function ConversationRow({
  conversation,
}: {
  conversation: ConversationSummary;
}) {
  return (
    <Link
      href={`/generate?conversationId=${conversation.id}`}
      className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-card px-4 py-3 transition-colors duration-150 ease-out hover:border-zinc-300 hover:bg-muted/40 dark:border-zinc-800 dark:hover:border-zinc-700"
    >
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        {conversation.title}
      </span>
      {/*
        The formatted string depends on the current time, not just
        `conversation.updatedAt` — a client/server render a few seconds
        apart can legitimately disagree ("2 minutes ago" vs "3 minutes
        ago"). That's expected here, not a real mismatch to fix, so it's
        suppressed rather than worked around the way app/generate's random
        example prompts are.
      */}
      <span
        suppressHydrationWarning
        className="shrink-0 text-xs text-zinc-500 dark:text-zinc-500"
      >
        {formatRelativeTime(conversation.updatedAt)}
      </span>
    </Link>
  );
}

export default function HistoryClient({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLParagraphElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null);
  const emptyDescriptionRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isEmpty = conversations.length === 0;

  // One-time cascading entrance: page title -> subtitle -> (empty-state
  // icon/heading/description/CTA, or the conversation list). Same short
  // fade + upward-move recipe as Home's hero and Generate's empty state,
  // with `clearProps` so GSAP's inline transforms don't linger and block
  // the CTA's/rows' CSS hover transforms afterward.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      if (!titleRef.current || !subtitleRef.current) return;

      const timeline = gsap.timeline({
        defaults: { ease: "power2.out", duration: 0.45, clearProps: "all" },
      });
      timeline
        .from(titleRef.current, { opacity: 0, y: 12 })
        .from(subtitleRef.current, { opacity: 0, y: 10 }, "-=0.3");

      if (
        isEmpty &&
        iconRef.current &&
        emptyHeadingRef.current &&
        emptyDescriptionRef.current &&
        ctaRef.current
      ) {
        timeline
          .from(iconRef.current, { opacity: 0, y: 14, scale: 0.94 }, "-=0.22")
          .from(emptyHeadingRef.current, { opacity: 0, y: 10 }, "-=0.26")
          .from(emptyDescriptionRef.current, { opacity: 0, y: 8 }, "-=0.28")
          .from(ctaRef.current, { opacity: 0, y: 8 }, "-=0.26");
      } else if (listRef.current) {
        timeline.from(
          listRef.current.children,
          { opacity: 0, y: 8, stagger: 0.04 },
          "-=0.22",
        );
      }
    },
    { scope: pageRef, dependencies: [isEmpty] },
  );

  return (
    <main
      ref={pageRef}
      className="flex flex-1 flex-col items-center px-6 py-16 sm:py-20"
    >
      <div className="flex w-full max-w-2xl flex-col items-center gap-2 text-center">
        <h1
          ref={titleRef}
          className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
        >
          History
        </h1>
        <p
          ref={subtitleRef}
          className="text-sm text-zinc-500 dark:text-zinc-400"
        >
          Your study sessions, all in one place.
        </p>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
          <div
            ref={iconRef}
            className="relative flex size-32 items-center justify-center"
          >
            {/*
              Small, static-position ambient glow behind the icon, reusing
              the same aurora-drift keyframes and indigo tone as Home's
              AuroraBackground for a consistent (but much smaller/calmer)
              ambient treatment. Purely decorative.
            */}
            <div
              aria-hidden="true"
              className="aurora-blob absolute inset-0 rounded-full bg-indigo-500/15 blur-2xl dark:bg-indigo-500/20"
            />
            <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl border border-zinc-200 bg-card text-foreground dark:border-zinc-800">
              <HistoryIcon aria-hidden="true" className="size-7" />
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <h2
              ref={emptyHeadingRef}
              className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              No study sessions yet
            </h2>
            <p
              ref={emptyDescriptionRef}
              className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400"
            >
              Once you start studying with Lumora, your sessions will show up
              here so you can pick up where you left off.
            </p>
          </div>

          <div ref={ctaRef}>
            <Button
              asChild
              size="lg"
              className="h-11 gap-2 rounded-xl px-6 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.03]"
            >
              <Link href="/generate">Start studying</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div
          ref={listRef}
          role="list"
          aria-label="Study sessions"
          className="mt-10 flex w-full max-w-2xl flex-col gap-2"
        >
          {conversations.map((conversation) => (
            <div role="listitem" key={conversation.id}>
              <ConversationRow conversation={conversation} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

"use client";

import { useRef, type ComponentType, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  CircleAlertIcon,
  ClipboardCheckIcon,
  LayersIcon,
  SparklesIcon,
} from "lucide-react";
import type { LumoraUIMessage } from "@/lib/ai/tools";

type CreateQuizUIPart = Extract<
  LumoraUIMessage["parts"][number],
  { type: "tool-createQuiz" }
>;
type CreateFlashcardsUIPart = Extract<
  LumoraUIMessage["parts"][number],
  { type: "tool-createFlashcards" }
>;

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// One-time entrance for whichever state renders — shared by QuizToolPart
// and FlashcardsToolPart below, since both are the same "tool call status
// in the conversation" concept for two different Practice activities.
function ToolPartWrapper({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !wrapperRef.current) return;
      gsap.from(wrapperRef.current, {
        opacity: 0,
        y: 10,
        duration: 0.35,
        ease: "power2.out",
        clearProps: "all",
      });
    },
    { scope: wrapperRef, dependencies: [] },
  );

  return (
    <div ref={wrapperRef} className="w-full max-w-lg">
      {children}
    </div>
  );
}

function ActivitySkeleton({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
      role="status"
      aria-label={label}
    >
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="size-8 shrink-0 rounded-lg bg-secondary motion-safe:animate-pulse"
        />
        <div className="flex flex-1 flex-col gap-1.5">
          <div
            aria-hidden="true"
            className="h-2.5 w-16 rounded-full bg-secondary motion-safe:animate-pulse"
          />
          <div
            aria-hidden="true"
            className="h-3 w-40 rounded-full bg-secondary motion-safe:animate-pulse"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{label}&hellip;</p>
    </div>
  );
}

function ActivityBuilding({
  icon: Icon,
  verb,
  topic,
}: {
  icon: ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  verb: string;
  topic: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        <Icon aria-hidden className="size-4 motion-safe:animate-pulse" />
      </div>
      <p className="text-sm text-muted-foreground">
        {verb} <span className="font-medium text-foreground">{topic}</span>
        &hellip;
      </p>
    </div>
  );
}

function ActivityErrorCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
        </div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// Deliberately non-interactive and deliberately not a second copy of the
// activity's own content (no questions/cards rendered here at all) — see
// QuizPanel.tsx/FlashcardsPanel.tsx, which already have this same data by
// the time this renders (via ChatInterface's onQuizGenerated/
// onFlashcardsGenerated) and are the *only* place either activity is
// actually interactive. This notice exists only so the conversation has a
// visible, compact record that something was generated and roughly what
// it covers — never the full payload as chat text.
function ActivityReadyNotice({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        <ClipboardCheckIcon aria-hidden="true" className="size-4" />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

// Renders the `createQuiz` tool call's part across all four lifecycle
// states it can be in. Keyed by `part.toolCallId` at the call site (see
// ChatInterface.tsx), so this stays mounted (not remounted) as the same
// call progresses input-streaming -> input-available ->
// output-available/output-error — that's what makes the one-time entrance
// animation fire only once.
export function QuizToolPart({ part }: { part: CreateQuizUIPart }) {
  return (
    <ToolPartWrapper>
      {(() => {
        switch (part.state) {
          case "input-streaming":
            return <ActivitySkeleton label="Preparing a quiz" />;
          case "input-available":
            return (
              <ActivityBuilding
                icon={SparklesIcon}
                verb="Building your quiz on"
                topic={part.input.topic}
              />
            );
          case "output-available": {
            const count = part.output.questions.length;
            return (
              <ActivityReadyNotice
                title={`Quiz ready: ${part.output.topic}`}
                detail={`${count} question${count === 1 ? "" : "s"} · Open Practice to take it`}
              />
            );
          }
          case "output-error":
            return (
              <ActivityErrorCard
                title="Couldn't build this quiz"
                message={part.errorText}
              />
            );
          default:
            // Approval-related states are part of the SDK's typed union but
            // never occur here — this tool has no `needsApproval` set.
            return null;
        }
      })()}
    </ToolPartWrapper>
  );
}

// The `createFlashcards` counterpart to QuizToolPart above — same four
// states, same "notice only, never the content itself" rule; see
// FlashcardsPanel.tsx for where the actual cards render.
export function FlashcardsToolPart({ part }: { part: CreateFlashcardsUIPart }) {
  return (
    <ToolPartWrapper>
      {(() => {
        switch (part.state) {
          case "input-streaming":
            return <ActivitySkeleton label="Preparing flashcards" />;
          case "input-available":
            return (
              <ActivityBuilding
                icon={LayersIcon}
                verb="Building flashcards on"
                topic={part.input.topic}
              />
            );
          case "output-available": {
            const count = part.output.cards.length;
            return (
              <ActivityReadyNotice
                title={`Flashcards ready: ${part.output.topic}`}
                detail={`${count} card${count === 1 ? "" : "s"} · Open Practice to study`}
              />
            );
          }
          case "output-error":
            return (
              <ActivityErrorCard
                title="Couldn't build these flashcards"
                message={part.errorText}
              />
            );
          default:
            return null;
        }
      })()}
    </ToolPartWrapper>
  );
}

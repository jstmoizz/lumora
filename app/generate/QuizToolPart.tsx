"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CircleAlertIcon, ClipboardCheckIcon, SparklesIcon } from "lucide-react";
import type { LumoraUIMessage } from "@/lib/ai/tools";

type CreateQuizUIPart = Extract<
  LumoraUIMessage["parts"][number],
  { type: "tool-createQuiz" }
>;

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Renders the `createQuiz` tool call's part across all four lifecycle
// states it can be in. Keyed by `part.toolCallId` at the call site, so this
// component stays mounted (not remounted) as the same call progresses
// input-streaming -> input-available -> output-available/output-error —
// that's what makes the one-time entrance animation below fire only once.
//
// Deliberately non-interactive at every state, including output-available:
// the actual interactive quiz (question navigation, answer selection,
// scoring) renders exclusively in the Generate workspace's dedicated Quiz
// panel (see QuizPanel.tsx) — GenerateWorkspace captures the quiz data via
// ChatInterface's `onQuizGenerated` callback, watching for this same
// output-available state. This component only ever shows the tool call's
// own status (preparing / building / ready / failed) inline in the
// conversation, never a second copy of the quiz itself.
export default function QuizToolPart({ part }: { part: CreateQuizUIPart }) {
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
      {(() => {
        switch (part.state) {
          case "input-streaming":
            // The model is still streaming the tool call's arguments —
            // topic/questions may be undefined or half-formed. Rather than
            // render that partial JSON, show a generic "preparing" skeleton.
            return <QuizSkeleton />;
          case "input-available":
            // Arguments are fully parsed; `execute` hasn't resolved yet.
            return <QuizBuilding topic={part.input.topic} />;
          case "output-available":
            return (
              <QuizReadyNotice
                topic={part.output.topic}
                questionCount={part.output.questions.length}
              />
            );
          case "output-error":
            return <QuizErrorCard message={part.errorText} />;
          default:
            // Approval-related states are part of the SDK's typed union but
            // never occur here — this tool has no `needsApproval` set.
            return null;
        }
      })()}
    </div>
  );
}

function QuizSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
      role="status"
      aria-label="Preparing a quiz"
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
      <p className="text-xs text-muted-foreground">
        Lumora is preparing a quiz&hellip;
      </p>
    </div>
  );
}

function QuizBuilding({ topic }: { topic: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        <SparklesIcon
          aria-hidden="true"
          className="size-4 motion-safe:animate-pulse"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Building your quiz on{" "}
        <span className="font-medium text-foreground">{topic}</span>
        &hellip;
      </p>
    </div>
  );
}

function QuizErrorCard({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-5">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Couldn&apos;t build this quiz
        </p>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// The tool call succeeded — deliberately non-interactive and deliberately
// not a second copy of the quiz content (no questions/options rendered
// here at all). GenerateWorkspace already has this same data via
// `onQuizGenerated` by the time this renders, and shows it in the Quiz
// panel; this notice exists only so the conversation has a visible record
// that a quiz was produced and roughly what it covers.
function QuizReadyNotice({
  topic,
  questionCount,
}: {
  topic: string;
  questionCount: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        <ClipboardCheckIcon aria-hidden="true" className="size-4" />
      </div>
      <div className="flex flex-col">
        <p className="text-sm font-medium text-foreground">
          Quiz ready: <span className="font-semibold">{topic}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {questionCount} {questionCount === 1 ? "question" : "questions"}{" "}
          &middot; open the Quiz panel to take it
        </p>
      </div>
    </div>
  );
}

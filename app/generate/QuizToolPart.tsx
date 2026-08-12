"use client";

import { useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { CircleAlertIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreateQuizOutput, LumoraUIMessage } from "@/lib/ai/tools";

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
            return <QuizCard quiz={part.output} />;
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
      className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-card p-5 dark:border-zinc-800"
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
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Lumora is preparing a quiz&hellip;
      </p>
    </div>
  );
}

function QuizBuilding({ topic }: { topic: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-card p-5 dark:border-zinc-800">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
        <SparklesIcon
          aria-hidden="true"
          className="size-4 motion-safe:animate-pulse"
        />
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Building your quiz on{" "}
        <span className="font-medium text-foreground">{topic}</span>
        &hellip;
      </p>
    </div>
  );
}

function QuizErrorCard({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 dark:border-red-500/25 dark:bg-red-500/10">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400">
          <CircleAlertIcon aria-hidden="true" className="size-4" />
        </div>
        <p className="text-sm font-semibold text-foreground">
          Couldn&apos;t build this quiz
        </p>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
    </div>
  );
}

function QuizCard({ quiz }: { quiz: CreateQuizOutput }) {
  // Which option the student picked per question, keyed by question id.
  // Local-only: no persistence, no backend scoring — answering just
  // reveals correct/incorrect for that question and locks it in.
  const [selections, setSelections] = useState<Record<string, number>>({});

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-card p-5 dark:border-zinc-800">
      <div className="flex items-center gap-2">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
          <SparklesIcon aria-hidden="true" className="size-4" />
        </div>
        <div className="flex flex-col">
          <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
            Quiz
          </p>
          <h3 className="text-sm font-semibold text-foreground">
            {quiz.topic}
          </h3>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {quiz.questions.map((question, index) => {
          const selected = selections[question.id];
          const hasAnswered = selected !== undefined;
          const answeredCorrectly = selected === question.correctIndex;

          return (
            <div key={question.id} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">
                {index + 1}. {question.question}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option, optionIndex) => {
                  const isCorrectOption = optionIndex === question.correctIndex;
                  const isSelectedOption = selected === optionIndex;

                  return (
                    <Button
                      key={optionIndex}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={hasAnswered}
                      onClick={() =>
                        setSelections((prev) => ({
                          ...prev,
                          [question.id]: optionIndex,
                        }))
                      }
                      className={cn(
                        "h-auto justify-start rounded-xl px-3 py-2 text-left text-sm font-normal whitespace-normal disabled:opacity-100",
                        hasAnswered &&
                          isCorrectOption &&
                          "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-400",
                        hasAnswered &&
                          isSelectedOption &&
                          !isCorrectOption &&
                          "border-red-500/40 bg-red-500/10 text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400",
                      )}
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
              {hasAnswered && (
                <p
                  className={cn(
                    "text-xs",
                    answeredCorrectly
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {answeredCorrectly
                    ? "Correct!"
                    : `Not quite — the correct answer is "${question.options[question.correctIndex]}."`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
